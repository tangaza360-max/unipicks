-- Ended student stories and their photos are deleted (found while drawing the
-- architecture map, 2026-10-05).
--
-- Before: a story was hidden after 24 hours, but its row and photo stayed in
-- the database and in Storage forever. Students expect a story to be gone.
--
-- After: the timer job (expire-orders, every 60 s on cron-job.org) asks this
-- function for stories that ended more than 48 hours ago (so 3 days after
-- posting) and have no open report, deletes their photos from the private
-- bucket, then deletes the rows (views go with them). Stories with an open
-- report are kept until an admin closes it (20261005120000).
--
-- Only the server (service role) can call it.

create or replace function public.student_stories_to_clean(p_limit integer default 100)
returns table (id uuid, media_url text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.media_url
    from public.student_stories s
   where s.expires_at < now() - interval '48 hours'
     and not public.story_has_open_report(s.id)
   order by s.expires_at
   limit greatest(1, least(coalesce(p_limit, 100), 500))
$$;

revoke all on function public.student_stories_to_clean(integer) from public, anon, authenticated;
grant execute on function public.student_stories_to_clean(integer) to service_role;
