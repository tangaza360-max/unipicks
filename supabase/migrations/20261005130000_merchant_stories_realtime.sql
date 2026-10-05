-- New business stories appear on Home without a reload (found while drawing
-- the architecture map, 2026-10-05).
--
-- Before: the Home screen (DealsFeed.jsx) listens for changes to
-- merchant_stories, but the table was not in the Supabase Realtime
-- publication, so no change was ever sent; a new or deleted business story
-- only showed after a reload.
--
-- After: merchant_stories is in the publication. Realtime still applies the
-- table's rules (RLS): signed-in users only receive stories they may read
-- (active ones).

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'merchant_stories'
     ) then
    alter publication supabase_realtime add table public.merchant_stories;
  end if;
end
$$;
