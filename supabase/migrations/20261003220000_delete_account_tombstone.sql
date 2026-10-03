-- P3 / B1: account deletion by scrub-and-tombstone.
--
-- A raw DELETE FROM auth.users either fails (NO ACTION FKs from orders,
-- redemptions, deals, merchant_profiles, group_orders, group_order_members) or
-- cascades away payment records (transactions) and other people's chat history.
-- Instead, one transaction deletes personal/social data, anonymises the personal
-- fields inside records that must be kept, and turns the auth user into a
-- tombstone: no usable email, password, identities or sessions, banned,
-- app_metadata.deleted_at set. Plan: docs/audits/p3-delete-account-plan.md.

-- ===========================================================================
-- 1. set_verified_identity (P1, extended in P4): honour deleted_at.
--    Without this, the trigger would resurrect app_metadata.student_id from
--    OLD on the tombstone update. Once deleted, an account stays deleted and
--    banned, with no identity attributes.
-- ===========================================================================
create or replace function public.set_verified_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_university text;
  v_domain text;
  v_student_id text;
  v_banned jsonb;
  v_deleted_at jsonb;
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  v_deleted_at := v_app -> 'deleted_at';
  if v_deleted_at is null and tg_op = 'UPDATE' then
    v_deleted_at := old.raw_app_meta_data -> 'deleted_at';
  end if;

  if v_deleted_at is not null then
    new.raw_app_meta_data :=
      (v_app - 'student_id' - 'university' - 'verified_email_domain')
      || jsonb_build_object('deleted_at', v_deleted_at, 'banned', true);
    return new;
  end if;

  v_university := public.university_for_email(new.email);
  v_domain := lower(split_part(coalesce(new.email, ''), '@', 2));

  if tg_op = 'INSERT' then
    if v_university is not null then
      v_student_id := nullif(trim(new.raw_user_meta_data ->> 'student_id'), '');
    end if;
    v_banned := v_app -> 'banned';
  else
    v_student_id := coalesce(v_app ->> 'student_id', old.raw_app_meta_data ->> 'student_id');
    v_banned := coalesce(v_app -> 'banned', old.raw_app_meta_data -> 'banned');
  end if;

  v_app := v_app - 'university' - 'verified_email_domain' - 'student_id' - 'banned';

  if v_university is not null then
    v_app := v_app || jsonb_build_object(
      'university', v_university,
      'verified_email_domain', v_domain
    );
  end if;

  if v_student_id is not null then
    v_app := v_app || jsonb_build_object('student_id', v_student_id);
  end if;

  if v_banned is not null then
    v_app := v_app || jsonb_build_object('banned', v_banned);
  end if;

  new.raw_app_meta_data := v_app;
  return new;
end;
$$;

-- ===========================================================================
-- 2. tombstone_user: the single deletion path (self-service and admin).
--    Service role only. The delete-my-account Edge Function verifies the
--    caller's password before calling it; admin_delete_user calls it after
--    its admin check.
-- ===========================================================================
create or replace function public.tombstone_user(p_user_id uuid, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_app jsonb;
  v_role text;
  v_now timestamptz := now();
  v_table text;
  v_storage jsonb := jsonb_build_array(
    jsonb_build_object('bucket', 'deal-images',    'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'deal-images',    'prefix', 'merchants/' || p_user_id),
    jsonb_build_object('bucket', 'merchant-logos', 'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'story-images',   'prefix', 'merchants/' || p_user_id)
  );
begin
  select lower(u.email), coalesce(u.raw_app_meta_data, '{}'::jsonb)
    into v_email, v_app
    from auth.users u
   where u.id = p_user_id
   for update;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- Idempotent: a retry after a partial failure (e.g. storage) is safe.
  if v_app ? 'deleted_at' then
    return jsonb_build_object('status', 'already_deleted', 'user_id', p_user_id, 'storage', v_storage);
  end if;

  select role into v_role from public.user_roles where user_id = p_user_id;

  -- ---- Pre-checks: nothing in flight -----------------------------------------
  if v_role = 'admin' then
    raise exception 'Admin accounts cannot be deleted. Remove the admin role first.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.orders
     where (student_id = p_user_id or merchant_id = p_user_id)
       and status in ('pending_confirmation', 'confirmed', 'payment_processing', 'paid')
  ) then
    raise exception 'You have active orders. Finish, collect or cancel them before deleting your account.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders
     where (student_id = p_user_id or merchant_id = p_user_id)
       and dispute_status in ('open', 'under_review')
  ) then
    raise exception 'You have an open dispute. Wait for it to be resolved before deleting your account.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.group_orders
     where created_by = p_user_id and status = 'open'
  ) then
    raise exception 'You are hosting an open group order. Submit or cancel it before deleting your account.'
      using errcode = 'P0001';
  end if;

  -- ---- Delete: personal and social data --------------------------------------
  delete from public.student_profiles             where user_id = p_user_id;
  delete from public.friend_requests              where sender_id = p_user_id or receiver_id = p_user_id;
  delete from public.friendships                  where student_a = p_user_id or student_b = p_user_id;
  delete from public.message_requests             where sender_id = p_user_id or receiver_id = p_user_id;
  delete from public.blocked_students             where blocker_id = p_user_id;   -- blocks against them stay
  delete from public.student_story_views          where viewer_id = p_user_id;
  delete from public.student_story_reactions      where student_id = p_user_id;
  delete from public.student_stories              where student_id = p_user_id;
  delete from public.business_follows             where student_id = p_user_id or merchant_id = p_user_id;
  delete from public.student_interests            where student_id = p_user_id;
  delete from public.student_saved_items          where student_id = p_user_id;
  delete from public.social_content_interactions  where student_id = p_user_id;
  delete from public.deal_views                   where student_id = p_user_id;
  delete from public.deal_searches                where student_id = p_user_id;
  delete from public.merchant_stories             where merchant_id = p_user_id;
  delete from public.notifications                where merchant_id = p_user_id;  -- their merchant inbox
  delete from public.merchant_profiles            where id = p_user_id;

  -- Their own inbox; and others' social notifications about relationships
  -- that no longer exist (these messages contain the deleted user's name).
  delete from public.user_notifications where user_id = p_user_id;
  delete from public.user_notifications
   where actor_id = p_user_id
     and type in ('friend_request', 'friend_request_accepted', 'message_request', 'message_request_accepted');
  update public.user_notifications set actor_id = null where actor_id = p_user_id;

  -- Unsubmitted group memberships (no order yet). Submitted ones stay below.
  delete from public.group_order_members m
   using public.group_orders g
   where m.group_order_id = g.id
     and m.student_id = p_user_id
     and g.status = 'open';

  -- ---- Anonymise: records that must be kept ---------------------------------
  update public.orders set student_phone = null where student_id = p_user_id;
  update public.orders set merchant_phone = null where merchant_id = p_user_id;

  -- Payment phone masked to first 3 + last 3 digits (founder decision D3), so
  -- refunds can still be reconciled with the payment provider.
  update public.transactions
     set phone_number = case
           when length(phone_number) >= 7
             then left(phone_number, 3) || repeat('*', length(phone_number) - 6) || right(phone_number, 3)
           else '***'
         end
   where student_id = p_user_id
     and phone_number is not null
     and position('*' in phone_number) = 0;

  update public.redemptions        set student_name = null          where student_id = p_user_id;
  update public.ratings            set review = null                where student_id = p_user_id;
  update public.group_orders       set host_name = 'Deleted user'   where created_by = p_user_id;
  update public.group_order_members set student_name = 'Deleted user' where student_id = p_user_id;
  update public.activity_logs      set target_name = 'Deleted user' where target_id = p_user_id;

  -- Merchants' inbox rows that name this student (create-order, redemption trigger).
  if v_email is not null then
    update public.notifications
       set student_name = null,
           student_email = null,
           message = 'Order activity from a deleted user.'
     where lower(student_email) = v_email;
  end if;

  -- Merchant: deals stay (students' orders reference them) but go inactive;
  -- images are deleted from storage by the Edge Function (decision D5).
  update public.deals set active = false, image_url = null where merchant_id = p_user_id;

  -- chat_messages and student_reports are kept as they are (decisions D4 / plan §3.1):
  -- the other party's records and moderation history.

  delete from public.user_roles where user_id = p_user_id;

  -- ---- Tombstone the auth user ----------------------------------------------
  update auth.users
     set email = format('deleted-%s@deleted.unipicks.invalid', p_user_id),
         phone = null,
         raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = jsonb_build_object(
           'provider', 'email',
           'providers', jsonb_build_array('email'),
           'deleted_at', v_now,
           'banned', true,
           -- Lets support confirm "this address had an account, deleted at X"
           -- without retaining the address itself.
           'deleted_email_sha256', encode(sha256(convert_to(coalesce(v_email, ''), 'UTF8')), 'hex')
         ),
         encrypted_password = 'deleted:' || gen_random_uuid(),
         banned_until = v_now + interval '100 years',
         updated_at = v_now
   where id = p_user_id;

  -- Sign out everywhere and remove login methods (frees the email for re-signup).
  foreach v_table in array array['sessions', 'refresh_tokens', 'identities', 'mfa_factors', 'one_time_tokens'] loop
    if to_regclass('auth.' || v_table) is not null then
      execute format('delete from auth.%I where user_id::text = $1', v_table) using p_user_id::text;
    end if;
  end loop;

  -- Audit trail without personal data.
  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (
    case when p_actor_id is distinct from p_user_id then p_actor_id end,
    'account_deleted',
    coalesce(v_role, 'user'),
    p_user_id,
    'Deleted user',
    jsonb_build_object('by', case when p_actor_id is null or p_actor_id = p_user_id then 'self' else 'admin' end)
  );

  return jsonb_build_object('status', 'deleted', 'user_id', p_user_id, 'role', v_role, 'storage', v_storage);
end;
$$;

revoke all on function public.tombstone_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.tombstone_user(uuid, uuid) to service_role;

-- ===========================================================================
-- 3. admin_delete_user: previously a raw DELETE FROM auth.users (fails on
--    NO ACTION FKs, or cascades away transactions and others' chats).
--    Same signature and grants; now the same tombstone path.
-- ===========================================================================
create or replace function public.admin_delete_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'Only admins can perform this action';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'You cannot delete your own admin account';
  end if;

  v_result := public.tombstone_user(target_user_id, auth.uid());

  return jsonb_build_object(
    'success', true,
    'message', 'User deleted. Personal data removed; financial records kept anonymised.',
    'result', v_result
  );
end;
$$;

revoke all on function public.admin_delete_user(uuid) from public, anon;
grant execute on function public.admin_delete_user(uuid) to authenticated;
