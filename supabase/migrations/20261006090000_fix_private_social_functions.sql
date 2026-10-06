-- Fix "relation public.social_notifications does not exist" on Add Friend
-- (founder report 2026-10-06, Social → student profile).
--
-- Cause: production has a `private` schema that is not in our migrations
-- (created by hand earlier). Eighteen public functions are thin wrappers
-- such as `select private.send_friend_request(target_student)`, and the real
-- code lives in private. Migration 20261003210000 renamed the table
-- social_notifications → user_notifications and rewrote every *public*
-- function that used the old name, but not the private ones. Since then these
-- fail in production:
--   send_friend_request, accept_friend_request, send_message_request,
--   accept_message_request, get_social_activity
-- (Add Friend, message requests, accepting them, and the Social Activity
-- screen).
--
-- Fix: the same rewrite for functions in the private schema. Guarded: does
-- nothing where the private schema does not exist (local test databases).
-- Follow-up (separate): bring the private functions into the migrations so
-- tests see what production runs.

do $$
declare
  f record;
begin
  if not exists (select 1 from pg_namespace where nspname = 'private') then
    return;
  end if;

  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'private'
       and p.prokind = 'f'
       and strpos(p.prosrc, 'social_notifications') > 0
  loop
    execute replace(pg_get_functiondef(f.oid), 'social_notifications', 'user_notifications');
  end loop;
end
$$;
