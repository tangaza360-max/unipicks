-- Report a review (founder request 2026-10-09: moderation for reviews with
-- food photos).
--
-- * New report type 'review'. The phone sends only which review (rating_id);
--   the database fills in who wrote it (reported_id, hidden from businesses
--   and blocked students) and keeps a copy of the text and photo at that
--   moment (review_text, review_photo_path), so editing the review within
--   its 24 hours doesn't hide what was reported. You can't report your own.
-- * While such a report is open, the writer can't delete that photo file;
--   admins can (like reported stories and profile photos).
-- * Admin -> Reports shows the review; admin_remove_review() clears its text
--   and photo (the stars stay: the order really happened), logs it, and
--   returns the photo path for the admin screen to delete the file.
--
-- get_admin_reports() is copied from 20261009120000 (fingerprint 0663853f
-- matched production on 2026-10-09) plus five review columns.
-- Standards: Apple App Review 1.2 / Google Play UGC policy (report and act on
-- user content); OWASP API5:2023 (admin-only functions check the role).

alter table public.student_reports add column if not exists rating_id uuid references public.ratings(id) on delete set null;
alter table public.student_reports add column if not exists review_text text;
alter table public.student_reports add column if not exists review_photo_path text;
create index if not exists idx_student_reports_rating_id on public.student_reports (rating_id);

alter table public.student_reports drop constraint if exists student_reports_context_check;
alter table public.student_reports add constraint student_reports_context_check
  check (context is null or context = any (array['chat', 'profile', 'business', 'story', 'avatar', 'review']));

-- Fill in who wrote the review and a copy of it; refuse your own.
create or replace function public.check_review_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rating public.ratings;
begin
  if new.context is distinct from 'review' then
    new.rating_id := null; -- only review reports carry these
    new.review_text := null;
    new.review_photo_path := null;
    return new;
  end if;

  select * into v_rating from public.ratings where id = new.rating_id;
  if not found then
    raise exception 'This review no longer exists.' using errcode = 'P0002';
  end if;
  if v_rating.student_id = auth.uid() then
    raise exception 'You can''t report your own review.' using errcode = '22023';
  end if;

  new.reported_id := v_rating.student_id;
  new.review_text := v_rating.review;
  new.review_photo_path := v_rating.photo_path;
  return new;
end;
$$;

revoke all on function public.check_review_report() from public, anon, authenticated;

drop trigger if exists student_reports_check_review on public.student_reports;
create trigger student_reports_check_review
  before insert on public.student_reports
  for each row execute function public.check_review_report();

-- Is this review photo part of an open report? (Definer: storage rules
-- can't read student_reports.)
create or replace function public.review_photo_has_open_report(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.student_reports
     where review_photo_path = p_path and status in ('pending', 'reviewing')
  )
$$;

revoke all on function public.review_photo_has_open_report(text) from public, anon;
grant execute on function public.review_photo_has_open_report(text) to authenticated;

drop policy if exists "Students remove their own review photos" on storage.objects;
create policy "Students remove their own review photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'review-photos'
    and (
      ((storage.foldername(name))[1] = (select auth.uid())::text and not public.review_photo_has_open_report(name))
      or (select public.is_admin())
    )
  );

-- Admin -> Reports gets the reported review.
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
  avatar_path text,
  rating_id uuid,
  review_rating integer,
  review_text text,
  review_photo_path text,
  review_removed boolean
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
         r.avatar_path,
         r.rating_id,
         rt.rating,
         r.review_text,
         r.review_photo_path,
         (r.context = 'review' and (rt.id is null or (rt.review is null and rt.photo_path is null)))
    from public.student_reports r
    left join auth.users ru on ru.id = r.reporter_id
    left join auth.users du on du.id = r.reported_id
    left join public.user_roles rr on rr.user_id = r.reporter_id
    left join public.user_roles dr on dr.user_id = r.reported_id
    left join public.merchant_profiles mp_r on mp_r.id = r.reporter_id
    left join public.merchant_profiles mp_d on mp_d.id = r.reported_id
    left join public.student_stories s on s.id = r.story_id
    left join public.ratings rt on rt.id = r.rating_id
   order by (r.status in ('pending', 'reviewing')) desc, r.created_at asc;
end;
$$;
revoke all on function public.get_admin_reports() from public, anon;
grant execute on function public.get_admin_reports() to authenticated;

-- Admin: clear the reported review's text and photo (stars stay), log it,
-- and return the photo path for the admin screen to delete the file.
create or replace function public.admin_remove_review(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.student_reports;
  v_photo text;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove reviews' using errcode = '42501';
  end if;

  select * into v_report from public.student_reports where id = p_report_id;
  if not found or v_report.context is distinct from 'review' then
    raise exception 'This report is not about a review.' using errcode = 'P0002';
  end if;

  -- The photo now on the review, or the one reported if it was changed.
  select coalesce(photo_path, v_report.review_photo_path) into v_photo
    from public.ratings where id = v_report.rating_id;
  v_photo := coalesce(v_photo, v_report.review_photo_path);

  update public.ratings
     set review = null, photo_path = null
   where id = v_report.rating_id;

  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)
    into v_name
    from auth.users u
   where u.id = v_report.reported_id;

  perform public.log_admin_action(
    'remove_review',
    'student',
    v_report.reported_id,
    v_name,
    jsonb_build_object('report_id', p_report_id, 'rating_id', v_report.rating_id)
  );

  return v_photo;
end;
$$;

revoke all on function public.admin_remove_review(uuid) from public, anon;
grant execute on function public.admin_remove_review(uuid) to authenticated;
