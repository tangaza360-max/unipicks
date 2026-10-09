-- Student profile pictures (founder decision 2026-10-09: all signed-in
-- students can see them; businesses and visitors cannot).
--
-- The picture is a small square JPEG made on the phone (512 px, no photo
-- location data) in a PRIVATE bucket, read through short-lived signed links.
-- A student who blocked you stays initials for you.

-- 1. Where the picture is: '<user id>/<random id>.jpg' in 'student-avatars'.
alter table public.student_profiles add column if not exists avatar_path text;
alter table public.student_profiles drop constraint if exists student_profiles_avatar_in_own_folder;
alter table public.student_profiles add constraint student_profiles_avatar_in_own_folder
  check (avatar_path is null or (split_part(avatar_path, '/', 1) = user_id::text and avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'));

-- 2. Who may see a student's picture: signed-in students and admins, unless
--    the owner blocked them. (Definer: storage rules can't read user_roles.)
--    The owner id is text so a folder name that is not an id (other buckets)
--    can never cause a cast error inside a storage rule.
create or replace function public.can_see_student_avatar(p_owner text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and (
       auth.uid()::text = p_owner
       or exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
       or (
         exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student')
         and not exists (select 1 from public.blocked_students where blocker_id::text = p_owner and blocked_id = auth.uid())
       )
     )
$$;

revoke all on function public.can_see_student_avatar(text) from public, anon;
grant execute on function public.can_see_student_avatar(text) to authenticated;

-- 3. Pictures of many students at once (lists, story tray, search).
create or replace function public.get_student_avatars(p_user_ids uuid[])
returns table (user_id uuid, avatar_path text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select sp.user_id, sp.avatar_path
    from public.student_profiles sp
   where sp.user_id = any (p_user_ids[1:200])
     and sp.avatar_path is not null
     and public.can_see_student_avatar(sp.user_id::text)
$$;

revoke all on function public.get_student_avatars(uuid[]) from public, anon;
grant execute on function public.get_student_avatars(uuid[]) to authenticated;

-- 4. The private bucket: 1 MB, JPEG only (the app always sends a small JPEG).
insert into storage.buckets (id, name, public)
values ('student-avatars', 'student-avatars', false)
on conflict (id) do update set public = false;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets'
                and column_name = 'file_size_limit') then
    execute $q$
      update storage.buckets
         set file_size_limit = 1048576,
             allowed_mime_types = array['image/jpeg']
       where id = 'student-avatars'
    $q$;
  end if;
end;
$$;

drop policy if exists "Students upload their own profile picture" on storage.objects;
create policy "Students upload their own profile picture"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'student-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and public.can_post_student_story()
  );

drop policy if exists "Students and admins see profile pictures" on storage.objects;
create policy "Students and admins see profile pictures"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'student-avatars'
    and public.can_see_student_avatar((storage.foldername(name))[1])
  );

drop policy if exists "Students remove their own profile picture" on storage.objects;
create policy "Students remove their own profile picture"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'student-avatars'
    and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_admin()))
  );

-- 5. Deleting an account empties the picture folder too (one more line in
--    the list; the rest is unchanged from 20261009100000).
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
    jsonb_build_object('bucket', 'story-images',   'prefix', 'merchants/' || p_user_id),
    jsonb_build_object('bucket', 'student-stories', 'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'student-avatars', 'prefix', p_user_id::text)
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
