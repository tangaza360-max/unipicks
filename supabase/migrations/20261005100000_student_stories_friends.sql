-- Student stories: friends can see them for 24 hours (founder decision
-- 2026-10-05, replaces social audit D4 "stories are v2").
--
-- Decisions: friends only (option A), photos and GIFs only, the owner sees
-- who viewed ("Seen by"), friends can report a story.
--
-- Before: the tables existed (20260917130000) but a student could only read
-- their OWN stories, students could not upload story photos, and nothing set
-- the 24-hour limit.
--
-- After:
--   * public.can_see_student_stories(owner): the owner, an admin, or a friend
--     (friendships row) when neither has blocked the other and the owner is
--     not banned;
--   * a story is visible while expires_at > now(). The database sets
--     created_at = now() and expires_at = now() + 24 hours on insert; the
--     phone cannot choose them. Stories cannot be edited, only deleted;
--   * only students post; media_url must be a file in the poster's own folder
--     of the private bucket "student-stories" ("<user id>/<name>.jpg|png|webp|gif");
--   * the photo itself is private: a signed-in user can download it only while
--     the story is visible to them (so a copied link stops working for
--     strangers). Max 5 MB, images only;
--   * a view can be recorded only for a story you can see and do not own;
--   * public.get_story_tray(): friends with active stories (and you), unseen
--     first, for the Social screen;
--   * admins can see and remove any story (reports).
--
-- Standards: eSafety Commissioner "Safety by Design" (private by default,
-- block respected everywhere); OWASP API1:2023 (object-level authorization);
-- Apple App Review 1.2 (report and block for user content).

-- ---------------------------------------------------------------------------
-- 1. Who can see whose stories.
-- ---------------------------------------------------------------------------
create or replace function public.can_see_student_stories(p_owner uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select
    auth.uid() is not null
    and (
      auth.uid() = p_owner
      or public.is_admin()
      or (
        exists (
          select 1 from public.friendships f
           where f.student_a = least(auth.uid(), p_owner)
             and f.student_b = greatest(auth.uid(), p_owner)
        )
        and not exists (
          select 1 from public.blocked_students b
           where (b.blocker_id = auth.uid() and b.blocked_id = p_owner)
              or (b.blocker_id = p_owner and b.blocked_id = auth.uid())
        )
        and not public.is_banned(p_owner)
      )
    )
$$;

revoke all on function public.can_see_student_stories(uuid) from public, anon;
grant execute on function public.can_see_student_stories(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Posting: the database decides the times and checks the photo path.
-- ---------------------------------------------------------------------------
-- A signed-in student who is not banned (user_roles is not readable by
-- signed-in users directly, so policies call this).
create or replace function public.can_post_student_story()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student')
     and not public.is_banned(auth.uid())
$$;

revoke all on function public.can_post_student_story() from public, anon;
grant execute on function public.can_post_student_story() to authenticated;

create or replace function public.prepare_student_story()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Service role, migrations and internal functions (no signed-in user).
  if auth.uid() is null then
    return new;
  end if;

  if new.student_id is distinct from auth.uid() then
    raise exception 'You can only post your own story.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'student') then
    raise exception 'Only students can post stories.' using errcode = '42501';
  end if;

  if new.media_url is null
     or new.media_url !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp|gif)$') then
    raise exception 'Choose a photo or GIF to post.' using errcode = '22023';
  end if;

  if new.caption is not null then
    new.caption := nullif(trim(new.caption), '');
    if length(new.caption) > 200 then
      raise exception 'Keep the caption under 200 characters.' using errcode = '22023';
    end if;
  end if;

  new.type := 'image';
  new.visibility := 'friends';
  new.created_at := now();
  new.expires_at := now() + interval '24 hours';
  return new;
end;
$$;

revoke all on function public.prepare_student_story() from public, anon, authenticated;

drop trigger if exists student_stories_prepare on public.student_stories;
create trigger student_stories_prepare
  before insert on public.student_stories
  for each row execute function public.prepare_student_story();

-- ---------------------------------------------------------------------------
-- 3. Row access.
-- ---------------------------------------------------------------------------
drop policy if exists students_view_own_stories on public.student_stories;
drop policy if exists students_view_visible_stories on public.student_stories;
create policy students_view_visible_stories
  on public.student_stories
  for select
  to authenticated
  using (
    student_id = auth.uid()
    or (select public.is_admin())
    or (expires_at > now() and public.can_see_student_stories(student_id))
  );

-- Stories are not edited (the photo and times are fixed); delete and post again.
drop policy if exists students_update_own_stories on public.student_stories;

drop policy if exists admins_delete_student_stories on public.student_stories;
create policy admins_delete_student_stories
  on public.student_stories
  for delete
  to authenticated
  using ((select public.is_admin()));

drop policy if exists students_create_story_views on public.student_story_views;
create policy students_create_story_views
  on public.student_story_views
  for insert
  to authenticated
  with check (
    viewer_id = auth.uid()
    and exists (
      select 1 from public.student_stories s
       where s.id = story_id
         and s.student_id <> auth.uid()
         and s.expires_at > now()
         and public.can_see_student_stories(s.student_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. The tray on the Social screen.
-- ---------------------------------------------------------------------------
create or replace function public.get_story_tray()
returns table (
  student_id uuid,
  display_name text,
  username text,
  story_count integer,
  latest_at timestamptz,
  has_unseen boolean,
  is_me boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.student_id,
         coalesce(p.display_name, 'Student'),
         p.username,
         count(*)::integer,
         max(s.created_at),
         bool_or(s.student_id <> auth.uid() and not exists (
           select 1 from public.student_story_views v
            where v.story_id = s.id and v.viewer_id = auth.uid()
         )),
         s.student_id = auth.uid()
    from public.student_stories s
    left join public.student_profiles p on p.user_id = s.student_id
   where auth.uid() is not null
     and s.expires_at > now()
     and (
       s.student_id = auth.uid()
       or (
         -- Friends only: an admin's access (can_see_student_stories) is for
         -- reports, not for the tray.
         exists (
           select 1 from public.friendships f
            where f.student_a = least(auth.uid(), s.student_id)
              and f.student_b = greatest(auth.uid(), s.student_id)
         )
         and public.can_see_student_stories(s.student_id)
       )
     )
   group by s.student_id, p.display_name, p.username
   order by (s.student_id = auth.uid()) desc,
            bool_or(s.student_id <> auth.uid() and not exists (
              select 1 from public.student_story_views v
               where v.story_id = s.id and v.viewer_id = auth.uid()
            )) desc,
            max(s.created_at) desc
$$;

revoke all on function public.get_story_tray() from public, anon;
grant execute on function public.get_story_tray() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The photos: a private bucket.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('student-stories', 'student-stories', false)
on conflict (id) do update set public = false;

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'storage' and table_name = 'buckets'
                and column_name = 'file_size_limit') then
    execute $q$
      update storage.buckets
         set file_size_limit = 5242880,
             allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
       where id = 'student-stories'
    $q$;
  end if;
end;
$$;

drop policy if exists "Students upload their own story photos" on storage.objects;
create policy "Students upload their own story photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'student-stories'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.can_post_student_story()
  );

drop policy if exists "Story photos are visible while the story is" on storage.objects;
create policy "Story photos are visible while the story is"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'student-stories'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.student_stories s
         where s.media_url = name
           and s.expires_at > now()
           and public.can_see_student_stories(s.student_id)
      )
      or (select public.is_admin())
    )
  );

drop policy if exists "Students delete their own story photos" on storage.objects;
create policy "Students delete their own story photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'student-stories'
    and ((storage.foldername(name))[1] = auth.uid()::text or (select public.is_admin()))
  );

-- ---------------------------------------------------------------------------
-- 6. Reporting a story: the report says which story (admins can open it even
--    after the 24 hours, because expired rows are kept, only hidden).
-- ---------------------------------------------------------------------------
alter table public.student_reports
  add column if not exists story_id uuid references public.student_stories(id) on delete set null;

alter table public.student_reports drop constraint if exists student_reports_context_check;
alter table public.student_reports
  add constraint student_reports_context_check
  check (context is null or context in ('chat', 'profile', 'business', 'story'));

-- A story report must point at a story of the reported student that the
-- reporter could see.
create or replace function public.check_story_report()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.story_id is null then
    if new.context = 'story' then
      raise exception 'Choose the story to report.' using errcode = '22023';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.student_stories s
     where s.id = new.story_id
       and s.student_id = new.reported_id
       and public.can_see_student_stories(s.student_id)
  ) then
    raise exception 'You can only report a story you can see.' using errcode = '42501';
  end if;

  new.context := 'story';
  return new;
end;
$$;

revoke all on function public.check_story_report() from public, anon, authenticated;

drop trigger if exists student_reports_check_story on public.student_reports;
create trigger student_reports_check_story
  before insert on public.student_reports
  for each row execute function public.check_story_report();
