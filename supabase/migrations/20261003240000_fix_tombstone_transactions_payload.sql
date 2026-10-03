-- P3 / B1 fix: the first production deletion failed with 42703 because
-- tombstone_user_core updated transactions.phone_number, a column production
-- does not have. Production's transactions table was created before
-- 20260904110000 (whose "create table if not exists" was therefore a no-op);
-- the payer's phone lives in webhook_payload (the UmunotaPay response) instead.
--
-- Part of the deletion contract from now on: the deleting user's payment
-- payloads keep their shape and every financial field, but the payer's
-- personal fields are replaced with '[deleted]'.

-- Repo/production alignment (no-op in production, where the column exists).
alter table public.transactions add column if not exists webhook_payload jsonb;

-- ===========================================================================
-- scrub_payment_payload: replace the payer's personal fields with '[deleted]'.
--   Top level: phone, account_number, wallet_id, wallet_name, description.
--   items[]: phone, account_number, wallet_id, wallet_name inside each object
--   element (product names, quantities and prices stay).
--   Only keys already present are touched (the shape never changes). Kept as
--   they are: id, amount, status, currency, reference, itecpay_trans_id,
--   request_id, is_test, created_at, updated_at, payment_provider, product_id,
--   every fee/total field, income_splits, transfer_scope, wallet_debited,
--   wallet_credited, correlation_id, sub_account_id (reconciliation).
-- ===========================================================================
create or replace function public.scrub_payment_payload(p_payload jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_out jsonb := p_payload;
  v_key text;
  v_items jsonb;
begin
  if jsonb_typeof(p_payload) is distinct from 'object' then
    return p_payload;
  end if;

  foreach v_key in array array['phone', 'account_number', 'wallet_id', 'wallet_name', 'description'] loop
    if v_out ? v_key then
      v_out := jsonb_set(v_out, array[v_key], to_jsonb('[deleted]'::text));
    end if;
  end loop;

  if jsonb_typeof(v_out -> 'items') = 'array' then
    select coalesce(jsonb_agg(
             case when jsonb_typeof(e.item) = 'object' then
               (select coalesce(jsonb_object_agg(
                         kv.key,
                         case when kv.key in ('phone', 'account_number', 'wallet_id', 'wallet_name')
                              then to_jsonb('[deleted]'::text) else kv.value end), '{}'::jsonb)
                  from jsonb_each(e.item) kv)
             else e.item end
             order by e.ord), '[]'::jsonb)
      into v_items
      from jsonb_array_elements(v_out -> 'items') with ordinality as e(item, ord);
    v_out := jsonb_set(v_out, '{items}', v_items);
  end if;

  return v_out;
end;
$$;

revoke all on function public.scrub_payment_payload(jsonb) from public, anon, authenticated;

-- ===========================================================================
-- tombstone_user_core: unchanged from 20261003220000 except the transactions
-- step. tombstone_user (wrapper, 20261003230000) still calls it; CREATE OR
-- REPLACE keeps its grants (none outside the owner).
-- ===========================================================================
create or replace function public.tombstone_user_core(p_user_id uuid, p_actor_id uuid default null)
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

  -- Payments: kept for reconciliation, personal fields scrubbed.
  -- (a) phone_number exists only in the repo-built schema: production's
  --     transactions table predates 20260904110000 (create table if not
  --     exists was a no-op there) and has no such column, which made the
  --     unconditional update fail with 42703. PL/pgSQL plans a statement on
  --     first execution, so this one is never parsed where the column is absent.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions' and column_name = 'phone_number'
  ) then
    update public.transactions
       set phone_number = case
             when length(phone_number) >= 7
               then left(phone_number, 3) || repeat('*', length(phone_number) - 6) || right(phone_number, 3)
             else '***'
           end
     where student_id = p_user_id
       and phone_number is not null
       and position('*' in phone_number) = 0;
  end if;

  -- (b) The provider payload (production's copy of the payer's details).
  update public.transactions
     set webhook_payload = public.scrub_payment_payload(webhook_payload)
   where student_id = p_user_id
     and jsonb_typeof(webhook_payload) = 'object';

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
