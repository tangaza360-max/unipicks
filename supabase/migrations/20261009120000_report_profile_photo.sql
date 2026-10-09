-- Report a student's profile photo (founder request 2026-10-09).
--
-- * New report type 'avatar'. The report keeps WHICH photo was reported
--   (student_reports.avatar_path, filled by the database, not the phone), and
--   only a photo the reporter may see can be reported.
-- * While such a report is open, the student can't delete that photo file
--   (they can still change or remove their photo; the old file is kept for
--   the admin), like reported stories (20261005120000).
-- * Admin -> Reports shows the photo; admin_remove_avatar() takes it off the
--   profile and returns the file path so the admin screen deletes the file.
--
-- get_admin_reports() is copied unchanged from 20261005110000 (fingerprint
-- matched production on 2026-10-09) plus one column, avatar_path.
-- Standards: Apple App Review 1.2 / Google Play UGC policy (report and act on
-- user content); OWASP API5:2023 (admin-only functions check the role).

alter table public.student_reports add column if not exists avatar_path text;

alter table public.student_reports drop constraint if exists student_reports_context_check;
alter table public.student_reports add constraint student_reports_context_check
  check (context is null or context = any (array['chat', 'profile', 'business', 'story', 'avatar']));

-- Fill in the reported photo; refuse photos the reporter can't see.
create or replace function public.check_avatar_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.context is distinct from 'avatar' then
    new.avatar_path := null; -- only the database sets it
    return new;
  end if;

  select sp.avatar_path into new.avatar_path
    from public.student_profiles sp
   where sp.user_id = new.reported_id;

  if new.avatar_path is null then
    raise exception 'This student has no profile photo.' using errcode = '22023';
  end if;

  if not public.can_see_student_avatar(new.reported_id::text) then
    raise exception 'You can only report a photo you can see.' using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.check_avatar_report() from public, anon, authenticated;

drop trigger if exists student_reports_check_avatar on public.student_reports;
create trigger student_reports_check_avatar
  before insert on public.student_reports
  for each row execute function public.check_avatar_report();

-- Is this photo file part of an open report? (Definer: storage rules can't
-- read student_reports.)
create or replace function public.avatar_has_open_report(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.student_reports
     where avatar_path = p_path and status in ('pending', 'reviewing')
  )
$$;

revoke all on function public.avatar_has_open_report(text) from public, anon;
grant execute on function public.avatar_has_open_report(text) to authenticated;

drop policy if exists "Students remove their own profile picture" on storage.objects;
create policy "Students remove their own profile picture"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'student-avatars'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and not public.avatar_has_open_report(name))
      or (select public.is_admin())
    )
  );

-- Admin -> Reports gets the reported photo.
drop function if exists public.get_admin_reports();

create function public.get_admin_reports()
returns table (
  id uuid,
  category text,
  description text,
  context text,
  status text,
  admin_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reporter_id uuid,
  reporter_name text,
  reporter_role text,
  reported_id uuid,
  reported_name text,
  reported_role text,
  reported_banned boolean,
  reported_deleted boolean,
  story_id uuid,
  story_media_path text,
  story_caption text,
  story_created_at timestamptz,
  story_expires_at timestamptz,
  story_removed boolean,
  avatar_path text
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can view reports' using errcode = '42501';
  end if;

  return query
  select r.id, r.category, r.description, r.context, r.status, r.admin_note, r.created_at, r.reviewed_at,
         r.reporter_id,
         coalesce(nullif(ru.raw_user_meta_data ->> 'full_name', ''), mp_r.business_name, ru.email)::text,
         rr.role,
         r.reported_id,
         coalesce(nullif(du.raw_user_meta_data ->> 'full_name', ''), mp_d.business_name, du.email)::text,
         dr.role,
         public.is_banned(r.reported_id),
         coalesce(du.raw_app_meta_data ? 'deleted_at', false),
         s.id,
         s.media_url,
         s.caption,
         s.created_at,
         s.expires_at,
         (r.context = 'story' and s.id is null),
         r.avatar_path
    from public.student_reports r
    left join auth.users ru on ru.id = r.reporter_id
    left join auth.users du on du.id = r.reported_id
    left join public.user_roles rr on rr.user_id = r.reporter_id
    left join public.user_roles dr on dr.user_id = r.reported_id
    left join public.merchant_profiles mp_r on mp_r.id = r.reporter_id
    left join public.merchant_profiles mp_d on mp_d.id = r.reported_id
    left join public.student_stories s on s.id = r.story_id
   order by (r.status in ('pending', 'reviewing')) desc, r.created_at asc;
end;
$$;
revoke all on function public.get_admin_reports() from public, anon;
grant execute on function public.get_admin_reports() to authenticated;

-- Admin: take the reported photo off the profile (if it is still the
-- current one), log it, and return the file path for the admin screen to
-- delete.
create or replace function public.admin_remove_avatar(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.student_reports;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove profile photos' using errcode = '42501';
  end if;

  select * into v_report from public.student_reports where id = p_report_id;
  if not found or v_report.avatar_path is null then
    raise exception 'This report is not about a profile photo.' using errcode = 'P0002';
  end if;

  update public.student_profiles
     set avatar_path = null
   where user_id = v_report.reported_id
     and avatar_path = v_report.avatar_path;

  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)
    into v_name
    from auth.users u
   where u.id = v_report.reported_id;

  perform public.log_admin_action(
    'remove_avatar',
    'student',
    v_report.reported_id,
    v_name,
    jsonb_build_object('report_id', p_report_id)
  );

  return v_report.avatar_path;
end;
$$;

revoke all on function public.admin_remove_avatar(uuid) from public, anon;
grant execute on function public.admin_remove_avatar(uuid) to authenticated;
