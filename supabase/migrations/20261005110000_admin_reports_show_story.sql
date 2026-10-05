-- Admin → Reports shows the reported story (founder request 2026-10-05).
--
-- Before: a story report (20261005100000) stored story_id, but
-- get_admin_reports() did not return it, so an admin could see "about a
-- story" but not the photo, and had no way to remove it.
--
-- After:
--   * get_admin_reports() also returns the story: story_id, story_media_path
--     (file in the private bucket "student-stories"; admins may read it),
--     story_caption, story_created_at, story_expires_at, and story_removed
--     (true when the report was about a story that no longer exists);
--   * admin_remove_story(report_id): admins only; deletes the story, writes
--     "remove_story" to the admin activity log, and returns the photo path so
--     the admin screen can delete the file too.
--
-- Standards: Apple App Review 1.2 (act on reported content); OWASP API5:2023
-- (admin-only function checks the role itself).

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
  story_removed boolean
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
         (r.context = 'story' and s.id is null)
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

create or replace function public.admin_remove_story(p_report_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_story public.student_stories;
  v_name text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can remove stories' using errcode = '42501';
  end if;

  select s.* into v_story
    from public.student_reports r
    join public.student_stories s on s.id = r.story_id
   where r.id = p_report_id;

  if not found then
    raise exception 'This story was already removed.' using errcode = 'P0002';
  end if;

  delete from public.student_stories where id = v_story.id;

  select coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), u.email)
    into v_name
    from auth.users u
   where u.id = v_story.student_id;

  perform public.log_admin_action(
    'remove_story',
    'student',
    v_story.student_id,
    v_name,
    jsonb_build_object('report_id', p_report_id, 'story_id', v_story.id, 'caption', v_story.caption)
  );

  return v_story.media_url;
end;
$$;
revoke all on function public.admin_remove_story(uuid) from public, anon;
grant execute on function public.admin_remove_story(uuid) to authenticated;
