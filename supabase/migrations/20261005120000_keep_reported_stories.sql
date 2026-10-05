-- Keep a reported story until an admin has looked at it (founder decision
-- 2026-10-05).
--
-- Before: a student could delete their story (and its photo) right after a
-- friend reported it, before an admin reviewed the report. The evidence was
-- gone and the report showed "The reported story was removed."
--
-- After, while a report on the story is open (pending or reviewing):
--   * the owner's Delete hides the story from everyone at once (expires_at is
--     set to now) but keeps the row, so the admin still sees it;
--   * the owner cannot delete its photo file.
-- Admins and server code without a signed-in user (account deletion) still
-- delete for real. Once the report is resolved or dismissed, the owner's
-- Delete works normally again.
--
-- Standards: Apple App Review 1.2 (act on reports). Keeping a reported
-- photo until review is assumed to be allowed under Rwanda's data
-- protection law (Law N° 058/2021) [inference: confirm with the legal
-- adviser].

create or replace function public.story_has_open_report(p_story_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.student_reports r
     where r.story_id = p_story_id
       and r.status in ('pending', 'reviewing')
  )
$$;

revoke all on function public.story_has_open_report(uuid) from public, anon;
grant execute on function public.story_has_open_report(uuid) to authenticated;

create or replace function public.keep_reported_story()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null or public.is_admin() or not public.story_has_open_report(old.id) then
    return old;
  end if;

  -- Hide it now instead of deleting it.
  update public.student_stories
     set expires_at = least(expires_at, greatest(now(), created_at + interval '1 millisecond'))
   where id = old.id;

  return null;
end;
$$;

revoke all on function public.keep_reported_story() from public, anon, authenticated;

drop trigger if exists student_stories_keep_reported on public.student_stories;
create trigger student_stories_keep_reported
  before delete on public.student_stories
  for each row execute function public.keep_reported_story();

drop policy if exists "Students delete their own story photos" on storage.objects;
create policy "Students delete their own story photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'student-stories'
    and (
      (select public.is_admin())
      or (
        (storage.foldername(name))[1] = auth.uid()::text
        and not exists (
          select 1 from public.student_stories s
           where s.media_url = name
             and public.story_has_open_report(s.id)
        )
      )
    )
  );
