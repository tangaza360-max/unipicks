-- Make bans real.
--
-- Before: admin_ban_user wrote `banned` into auth.users.raw_user_meta_data,
-- which the user can rewrite from the browser (supabase.auth.updateUser), and
-- nothing read it, so a banned user kept full access.
--
-- After:
--   * `banned` lives in raw_app_meta_data (server-only) and survives
--     auth-server rewrites (set_verified_identity trigger, extended from P1);
--   * public.is_banned(uid) is the single check;
--   * banned users cannot send chat messages, send friend or message requests,
--     raise disputes, post stories, or start/join group orders. Enforced with
--     BEFORE triggers rather than RLS predicates because several of these
--     writes go through SECURITY DEFINER functions (send_friend_request,
--     send_message_request, raise_order_dispute, create_group_order_with_host),
--     which bypass RLS. Triggers fire either way, and auth.uid() is still the
--     calling user inside those functions;
--   * order creation happens in Edge Functions with the service role
--     (auth.uid() is null there), so create-order and create-group-order-payment
--     check app_metadata.banned themselves (same commit).

-- ---------------------------------------------------------------------------
-- 1. The single check.
-- ---------------------------------------------------------------------------
create or replace function public.is_banned(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select lower(u.raw_app_meta_data ->> 'banned') = 'true'
       from auth.users u
      where u.id = p_user_id),
    false
  )
$$;

revoke all on function public.is_banned(uuid) from public, anon;
grant execute on function public.is_banned(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Extend set_verified_identity (P1, 20261003190000) so `banned` survives
--    the auth server rewriting raw_app_meta_data from its in-memory copy.
--    An explicit value (ban = true, unban = false) always wins; only a missing
--    key falls back to the previous value.
-- ---------------------------------------------------------------------------
create or replace function public.set_verified_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_university text := public.university_for_email(new.email);
  v_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
  v_student_id text;
  v_banned jsonb;
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
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

-- ---------------------------------------------------------------------------
-- 3. Backfill: move existing bans to app_metadata, then clear every
--    user-editable copy.
-- ---------------------------------------------------------------------------
update auth.users
   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"banned": true}'::jsonb
 where lower(raw_user_meta_data ->> 'banned') in ('true', 't', '1');

update auth.users
   set raw_user_meta_data = raw_user_meta_data - 'banned'
 where raw_user_meta_data ? 'banned';

-- ---------------------------------------------------------------------------
-- 4. Admin ban / unban write app_metadata. Unban writes an explicit false so
--    the preservation rule in step 2 can't resurrect the ban.
--    Same signatures and grants as 20260914006000.
-- ---------------------------------------------------------------------------
create or replace function public.admin_ban_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_found uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can perform this action';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"banned": true}'::jsonb,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'banned'
   where id = target_user_id
  returning id into v_found;

  if v_found is null then
    raise exception 'User not found';
  end if;

  return jsonb_build_object('success', true, 'message', 'User banned successfully');
end;
$$;

create or replace function public.admin_unban_user(target_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = auth, public
as $$
declare
  v_found uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can perform this action';
  end if;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"banned": false}'::jsonb,
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) - 'banned'
   where id = target_user_id
  returning id into v_found;

  if v_found is null then
    raise exception 'User not found';
  end if;

  return jsonb_build_object('success', true, 'message', 'User unbanned successfully');
end;
$$;

revoke all on function public.admin_ban_user(uuid) from public, anon;
revoke all on function public.admin_unban_user(uuid) from public, anon;
grant execute on function public.admin_ban_user(uuid) to authenticated;
grant execute on function public.admin_unban_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin lists show the enforced flag.
--    get_all_students: as in 20261003190000, banned now from app_metadata.
--    get_all_merchants: as in 20260914007000, banned now from app_metadata.
-- ---------------------------------------------------------------------------
create or replace function public.get_all_students()
returns jsonb
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view student list';
  end if;

  return coalesce(
    (select jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', u.raw_user_meta_data->>'full_name',
        'university', u.raw_app_meta_data->>'university',
        'student_id', u.raw_app_meta_data->>'student_id',
        'banned', public.is_banned(u.id)
      )
    )
    from auth.users u
    inner join public.user_roles ur on ur.user_id = u.id and ur.role = 'student'),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_all_merchants()
returns table (
  id uuid,
  email text,
  full_name text,
  business_name text,
  phone text,
  address text,
  rdb_number text,
  approved boolean,
  created_at timestamptz,
  banned boolean
)
language plpgsql
security definer
set search_path = auth, public
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view merchant list';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'business_name',
    u.raw_user_meta_data->>'phone',
    u.raw_user_meta_data->>'address',
    u.raw_user_meta_data->>'rdb_number',
    coalesce(mp.approved, false),
    u.created_at,
    public.is_banned(u.id)
  from auth.users u
  inner join public.user_roles ur on ur.user_id = u.id and ur.role = 'merchant'
  left join public.merchant_profiles mp on u.id = mp.id
  order by u.created_at desc;
end;
$$;

revoke all on function public.get_all_students() from public, anon;
revoke all on function public.get_all_merchants() from public, anon;
grant execute on function public.get_all_students() to authenticated;
grant execute on function public.get_all_merchants() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Enforcement: one guard, attached to every protected write.
--    auth.uid() is null for the service role (Edge Functions, migrations),
--    so system writes such as order-status chat messages still go through.
-- ---------------------------------------------------------------------------
create or replace function public.reject_if_banned()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.is_banned(auth.uid()) then
    raise exception 'Your account is suspended. Contact support.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function public.reject_if_banned() from public;

-- Chat messages (direct and group)
drop trigger if exists reject_banned_chat_messages on public.chat_messages;
create trigger reject_banned_chat_messages
before insert on public.chat_messages
for each row execute function public.reject_if_banned();

-- Friend requests (send_friend_request inserts here)
drop trigger if exists reject_banned_friend_requests on public.friend_requests;
create trigger reject_banned_friend_requests
before insert on public.friend_requests
for each row execute function public.reject_if_banned();

-- Message requests (send_message_request): same contact path as friend requests
drop trigger if exists reject_banned_message_requests on public.message_requests;
create trigger reject_banned_message_requests
before insert on public.message_requests
for each row execute function public.reject_if_banned();

-- Stories (merchant stories today; student stories are v2 but guarded now)
drop trigger if exists reject_banned_merchant_stories on public.merchant_stories;
create trigger reject_banned_merchant_stories
before insert on public.merchant_stories
for each row execute function public.reject_if_banned();

drop trigger if exists reject_banned_student_stories on public.student_stories;
create trigger reject_banned_student_stories
before insert on public.student_stories
for each row execute function public.reject_if_banned();

-- Disputes (raise_order_dispute sets dispute_raised_at); resolving is unaffected
drop trigger if exists reject_banned_dispute_raise on public.orders;
create trigger reject_banned_dispute_raise
before update of dispute_raised_at on public.orders
for each row
when (old.dispute_raised_at is null and new.dispute_raised_at is not null)
execute function public.reject_if_banned();

-- Group orders: starting one (create_group_order_with_host) and joining one
drop trigger if exists reject_banned_group_orders on public.group_orders;
create trigger reject_banned_group_orders
before insert on public.group_orders
for each row execute function public.reject_if_banned();

drop trigger if exists reject_banned_group_order_members on public.group_order_members;
create trigger reject_banned_group_order_members
before insert on public.group_order_members
for each row execute function public.reject_if_banned();
