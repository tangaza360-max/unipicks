-- Fix 1 (ecosystem audit J2): create the merchant profile in the database at
-- signup, instead of from the browser.
--
-- RegisterMerchant.jsx inserted merchant_profiles right after auth.signUp,
-- which only works when signUp returns a session. With Supabase email
-- confirmation on (needed to prove the student email, audit U1) there is no
-- session yet, the insert failed silently (RLS: to authenticated), and the
-- merchant never reached Admin → Approvals.
--
-- assign_initial_user_role already runs AFTER INSERT ON auth.users and decides
-- the role; for merchants it now also creates the unapproved profile.
-- Unchanged: role comes from signup metadata, limited to student/merchant.

create or replace function public.assign_initial_user_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := new.raw_user_meta_data ->> 'role';

  if requested_role not in ('student', 'merchant') or requested_role is null then
    requested_role := 'student';
  end if;

  insert into public.user_roles (user_id, role)
  values (new.id, requested_role);

  if requested_role = 'merchant' then
    insert into public.merchant_profiles (id, business_name)
    values (new.id, nullif(trim(new.raw_user_meta_data ->> 'business_name'), ''))
    on conflict (id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function public.assign_initial_user_role() from public;

-- Backfill: merchants whose browser insert failed before this fix.
insert into public.merchant_profiles (id, business_name)
select r.user_id, nullif(trim(u.raw_user_meta_data ->> 'business_name'), '')
  from public.user_roles r
  join auth.users u on u.id = r.user_id
 where r.role = 'merchant'
   and not (u.raw_app_meta_data ? 'deleted_at')
   and not exists (select 1 from public.merchant_profiles m where m.id = r.user_id)
on conflict (id) do nothing;
