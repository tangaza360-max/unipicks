-- Database speed (audit 2026-10-08, Supabase advisors).
--
-- 1. 52 access rules called auth.uid() once per row. Wrapped as
--    (SELECT auth.uid()) Postgres works it out once per query; the rule means
--    exactly the same (the same user id), only faster on big tables.
--    https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
--    The rules are rewritten from their current text in the database, with
--    only that change, so nothing is copied by hand. Running it again finds
--    nothing to change.
--
-- 2. 19 links between tables (foreign keys) had no index, so following them
--    (for example "orders of this student", deleting a user) read the whole
--    table. https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

do $$
declare
  p record;
  new_qual text;
  new_check text;
  changed int := 0;
begin
  for p in
    select tablename, policyname, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and (coalesce(qual, '') ~ '(?<!SELECT )auth\.uid\(\)'
        or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)')
  loop
    new_qual := regexp_replace(p.qual, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    new_check := regexp_replace(p.with_check, '(?<!SELECT )auth\.uid\(\)', '(SELECT auth.uid())', 'g');
    execute format('alter policy %I on public.%I', p.policyname, p.tablename)
      || case when new_qual is not null then format(' using (%s)', new_qual) else '' end
      || case when new_check is not null then format(' with check (%s)', new_check) else '' end;
    changed := changed + 1;
  end loop;
  raise notice 'access rules made faster: %', changed;
end
$$;

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('activity_logs', 'admin_id'),
      ('chat_messages', 'deal_id'),
      ('chat_messages', 'receiver_id'),
      ('deals', 'merchant_id'),
      ('group_order_members', 'student_id'),
      ('group_orders', 'created_by'),
      ('group_orders', 'deal_id'),
      ('merchant_stories', 'merchant_id'),
      ('notifications', 'deal_id'),
      ('orders', 'dispute_raised_by'),
      ('ratings', 'student_id'),
      ('redemptions', 'deal_id'),
      ('redemptions', 'student_id'),
      ('redemptions', 'transaction_id'),
      ('student_reports', 'reviewed_by'),
      ('student_reports', 'story_id'),
      ('system_settings', 'updated_by'),
      ('transactions', 'deal_id'),
      ('user_notifications', 'actor_id')
    ) as t(tbl, col)
  loop
    -- Skip quietly where a table or column does not exist (local test
    -- databases); in production all 19 exist.
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = fk.tbl and column_name = fk.col
    ) then
      execute format('create index if not exists %I on public.%I (%I)', 'idx_' || fk.tbl || '_' || fk.col, fk.tbl, fk.col);
    end if;
  end loop;
end
$$;
