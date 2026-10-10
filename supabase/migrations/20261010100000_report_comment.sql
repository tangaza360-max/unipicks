-- Report a comment (founder request 2026-10-10: moderation for comments).
--
-- * New report type 'comment'. The phone sends only which comment; the
--   database fills in who wrote it (hidden from businesses and blocked
--   students) and keeps a copy of the text. You can't report your own.
--   Students and businesses can report (a business can't delete students'
--   comments, so this is how it flags one).
-- * Admin -> Reports shows the comment; admin_remove_comment() deletes it
--   (its replies go with it) and logs it.
--
-- get_admin_reports() is copied from 20261009160000 (fingerprint 61e2e927
-- matched production on 2026-10-10) plus three comment columns.
-- Standards: Apple App Review 1.2 / Google Play UGC policy; OWASP API5:2023.

alter table public.student_reports add column if not exists comment_id uuid references public.deal_comments(id) on delete set null;
alter table public.student_reports add column if not exists comment_text text;
create index if not exists idx_student_reports_comment_id on public.student_reports (comment_id);

alter table public.student_reports drop constraint if exists student_reports_context_check;
alter table public.student_reports add constraint student_reports_context_check
  check (context is null or context = any (array['chat', 'profile', 'business', 'story', 'avatar', 'review', 'comment']));

create or replace function public.check_comment_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.deal_comments;
begin
  if new.context is distinct from 'comment' then
    new.comment_id := null; -- only comment reports carry these
    new.comment_text := null;
    return new;
  end if;

  select * into v_comment from public.deal_comments where id = new.comment_id;
  if not found then
    raise exception 'This comment no longer exists.' using errcode = 'P0002';
  end if;
  if v_comment.author_id = auth.uid() then
    raise exception 'You can''t report your own comment.' using errcode = '22023';
  end if;

  new.reported_id := v_comment.author_id;
  new.comment_text := v_comment.body;
  return new;
end;
$$;

revoke all on function public.check_comment_report() from public, anon, authenticated;

drop trigger if exists student_reports_check_comment on public.student_reports;
create trigger student_reports_check_comment
  before insert on public.student_reports
  for each row execute function public.check_comment_report();

-- Admin -> Reports gets the reported comment.
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
  review_removed boolean,
  comment_id uuid,
  comment_text text,
  comment_removed boolean
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
         (r.context = 'review' and (rt.id is null or (rt.review is null and rt.photo_path is null))),
         r.comment_id,
         r.comment_text,
         (r.context = 'comment' and dc.id is null)
    from public.student_reports r
    left join auth.users ru on ru.id = r.reporter_id
    left join auth.users du on du.id = r.reported_id
    left join public.user_roles rr on rr.user_id = r.reporter_id
    left join public.user_roles dr on dr.user_id = r.reported_id
    left join public.merchant_profiles mp_r on mp_r.id = r.reporter_id
    left join public.merchant_profiles mp_d on mp_d.id = r.reported_id
    left join public.student_stories s on s.id = r.story_id
    left join public.ratings rt on rt.id = r.rating_id
    left join public.deal_comments dc on dc.id = r.comment_id
   order by (r.status in ('pending', 'reviewing')) desc, r.created_at asc;
end;
$$;
revoke all on function public.get_admin_reports() from public, anon;
grant execute on function public.get_admin_reports() to authenticated;

-- Admin: delete the reported comment (and its replies) and log it.
create or replace function public.admin_remove_comment(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_report public.student_reports;
  v_role text;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove comments' using errcode = '42501';
  end if;

  select * into v_report from public.student_reports where id = p_report_id;
  if not found or v_report.context is distinct from 'comment' then
    raise exception 'This report is not about a comment.' using errcode = 'P0002';
  end if;

  delete from public.deal_comments where id = v_report.comment_id;

  select role into v_role from public.user_roles where user_id = v_report.reported_id;
  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), mp.business_name, u.email)
    into v_name
    from auth.users u
    left join public.merchant_profiles mp on mp.id = u.id
   where u.id = v_report.reported_id;

  perform public.log_admin_action(
    'remove_comment',
    case when v_role = 'merchant' then 'merchant' else 'student' end,
    v_report.reported_id,
    v_name,
    jsonb_build_object('report_id', p_report_id, 'comment_id', v_report.comment_id)
  );
end;
$$;

revoke all on function public.admin_remove_comment(uuid) from public, anon;
grant execute on function public.admin_remove_comment(uuid) to authenticated;
