-- Verified identity becomes server-owned.
--
-- University and student ID used to live only in auth.users.raw_user_meta_data,
-- which every user can rewrite from the browser (supabase.auth.updateUser).
-- Admin views (get_all_students) trusted those self-edited values.
--
-- From now on:
--   * university is DERIVED from the account's email domain and stored in
--     raw_app_meta_data, which only the service role / database can write;
--   * student_id is captured once, at signup, into raw_app_meta_data and is
--     never read from user_metadata again (admins correct it via SQL);
--   * student_profiles.university always equals the verified university;
--   * get_all_students reads the verified values.

-- ---------------------------------------------------------------------------
-- 1. Email domain → university.
--    Mirror of src/lib/universities.js (only universities with a verified
--    domain). Add a row here when a new university launches.
-- ---------------------------------------------------------------------------
create or replace function public.university_for_email(p_email text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select u.name
    from (values
      ('keplercollege.ac.rw', 'Kepler College')
    ) as u(domain, name)
   where u.domain = lower(split_part(coalesce(p_email, ''), '@', 2))
$$;

revoke all on function public.university_for_email(text) from public;

-- ---------------------------------------------------------------------------
-- 2. Keep verified identity in app_metadata on every write to auth.users.
--    Runs on INSERT and on UPDATE OF email / raw_app_meta_data because the
--    auth server may rewrite app_metadata from its in-memory copy (e.g. when
--    recording providers); re-deriving each time keeps the values intact.
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
  v_app jsonb := coalesce(new.raw_app_meta_data, '{}'::jsonb);
begin
  if tg_op = 'INSERT' then
    -- Captured once at signup; only meaningful for verified students.
    if v_university is not null then
      v_student_id := nullif(trim(new.raw_user_meta_data ->> 'student_id'), '');
    end if;
  else
    -- Never read user_metadata after signup. Keep an explicitly provided
    -- value (admin correction via SQL), otherwise keep the stored one.
    v_student_id := coalesce(v_app ->> 'student_id', old.raw_app_meta_data ->> 'student_id');
  end if;

  v_app := v_app - 'university' - 'verified_email_domain' - 'student_id';

  if v_university is not null then
    v_app := v_app || jsonb_build_object(
      'university', v_university,
      'verified_email_domain', v_domain
    );
  end if;

  if v_student_id is not null then
    v_app := v_app || jsonb_build_object('student_id', v_student_id);
  end if;

  new.raw_app_meta_data := v_app;
  return new;
end;
$$;

revoke all on function public.set_verified_identity() from public;

drop trigger if exists on_auth_user_set_verified_identity on auth.users;

create trigger on_auth_user_set_verified_identity
before insert or update of email, raw_app_meta_data on auth.users
for each row
execute function public.set_verified_identity();

-- ---------------------------------------------------------------------------
-- 3. Backfill existing users.
--    University: from the email domain (trustworthy).
--    Student ID: taken from the CURRENT user_metadata, the only record that
--    exists. It may already have been edited by the student; admins should
--    spot-check it. From here on it is frozen.
-- ---------------------------------------------------------------------------
update auth.users u
   set raw_app_meta_data =
         coalesce(u.raw_app_meta_data, '{}'::jsonb)
         || case
              when public.university_for_email(u.email) is not null
               and exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'student')
               and nullif(trim(u.raw_user_meta_data ->> 'student_id'), '') is not null
              then jsonb_build_object('student_id', trim(u.raw_user_meta_data ->> 'student_id'))
              else '{}'::jsonb
            end;
-- (The UPDATE OF raw_app_meta_data fires the trigger above, which also sets
--  university and verified_email_domain for every matching email.)

-- ---------------------------------------------------------------------------
-- 4. student_profiles.university always equals the verified university.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_verified_profile_university()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_university text;
begin
  select raw_app_meta_data ->> 'university'
    into v_university
    from auth.users
   where id = new.user_id;

  if v_university is not null then
    new.university := v_university;
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_verified_profile_university() from public;

drop trigger if exists student_profiles_verified_university on public.student_profiles;

create trigger student_profiles_verified_university
before insert or update of university on public.student_profiles
for each row
execute function public.enforce_verified_profile_university();

update public.student_profiles sp
   set university = u.raw_app_meta_data ->> 'university'
  from auth.users u
 where u.id = sp.user_id
   and u.raw_app_meta_data ->> 'university' is not null
   and sp.university is distinct from u.raw_app_meta_data ->> 'university';

-- ---------------------------------------------------------------------------
-- 5. Admin student list reads the verified values.
--    Same signature and grants as 20260914007000; only the two fields change.
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
        'banned', coalesce((u.raw_user_meta_data->>'banned')::boolean, false)
      )
    )
    from auth.users u
    inner join public.user_roles ur on ur.user_id = u.id and ur.role = 'student'),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_all_students() from public, anon;
grant execute on function public.get_all_students() to authenticated;
