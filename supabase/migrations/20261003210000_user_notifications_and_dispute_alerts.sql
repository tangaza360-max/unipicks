-- N3b: rename social_notifications -> user_notifications, add link_path, and
-- notify both parties (plus admins) through the dispute lifecycle.

-- ===========================================================================
-- Part A. Rename (data preserved: ALTER TABLE ... RENAME keeps every row).
-- ===========================================================================
alter table public.social_notifications rename to user_notifications;

-- Constraints (renaming a pkey/unique constraint also renames its index).
do $$
declare
  c record;
begin
  for c in
    select conname
      from pg_constraint
     where conrelid = 'public.user_notifications'::regclass
       and conname like 'social_notifications%'
  loop
    execute format(
      'alter table public.user_notifications rename constraint %I to %I',
      c.conname, replace(c.conname, 'social_notifications', 'user_notifications')
    );
  end loop;
end
$$;

-- Remaining indexes.
do $$
declare
  i record;
begin
  for i in
    select indexname
      from pg_indexes
     where schemaname = 'public'
       and tablename = 'user_notifications'
       and indexname like 'social_notifications%'
  loop
    execute format(
      'alter index public.%I rename to %I',
      i.indexname, replace(i.indexname, 'social_notifications', 'user_notifications')
    );
  end loop;
end
$$;

-- Policies follow the table (they reference it by OID); rename them for clarity.
alter policy students_view_own_social_notifications
  on public.user_notifications rename to users_view_own_notifications;
alter policy students_update_own_social_notifications
  on public.user_notifications rename to users_update_own_notifications;

-- Function bodies are stored as text and resolve table names at run time, so
-- every function that mentions the old name must be recompiled. Use the
-- database's own current definition (pg_get_functiondef), which also covers any
-- change made outside the migrations. CREATE OR REPLACE keeps grants.
-- In the repo these are: send_friend_request, accept_friend_request,
-- send_message_request, accept_message_request, get_social_activity.
do $$
declare
  f record;
begin
  for f in
    select p.oid
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosrc like '%social_notifications%'
  loop
    execute replace(pg_get_functiondef(f.oid), 'social_notifications', 'user_notifications');
  end loop;
end
$$;

-- Clickable notifications.
alter table public.user_notifications
  add column if not exists link_path text;

-- Live updates for badges (only where the Supabase realtime publication exists).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notifications'
     ) then
    alter publication supabase_realtime add table public.user_notifications;
  end if;
end
$$;

-- ===========================================================================
-- Part B. Dispute notifications.
-- One trigger on orders covers raise_order_dispute and resolve_order_dispute
-- (and any other path that changes dispute_status) without copying their bodies.
-- ===========================================================================
create or replace function public.notify_dispute_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order_ref text := upper(left(new.id::text, 8));
  v_deal_title text;
  v_reason text;
  v_status_text text;
  v_note text := nullif(trim(coalesce(new.dispute_resolution_note, '')), '');
begin
  select title into v_deal_title from public.deals where id = new.deal_id;
  v_deal_title := coalesce(v_deal_title, 'an order');

  -- Raised: every admin + the merchant.
  if old.dispute_status is null and new.dispute_status = 'open' then
    v_reason := case new.dispute_reason
      when 'item_not_received' then 'item not received'
      when 'quality_issue' then 'quality issue'
      when 'merchant_unresponsive' then 'merchant unresponsive'
      when 'wrong_item' then 'wrong item'
      else 'other'
    end;

    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    select r.user_id,
           'dispute_raised',
           new.dispute_raised_by,
           new.id,
           format('New dispute on order %s (%s): %s.', v_order_ref, v_deal_title, v_reason),
           '/dashboard/disputes'
      from public.user_roles r
     where r.role = 'admin';

    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    values (
      new.merchant_id,
      'dispute_raised',
      new.dispute_raised_by,
      new.id,
      format('A student opened a dispute on order %s (%s): %s. Unipicks will review it.', v_order_ref, v_deal_title, v_reason),
      '/dashboard/orders'
    );

  -- Status changed (under_review / resolved / rejected): the student who
  -- raised it + the merchant.
  elsif old.dispute_status is not null
        and new.dispute_status is distinct from old.dispute_status then
    v_status_text := case new.dispute_status
      when 'under_review' then 'is now under review'
      when 'resolved' then 'was resolved'
      when 'rejected' then 'was rejected'
      when 'open' then 'was reopened'
      else 'was updated'
    end;

    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    select x.user_id,
           'dispute_status_changed',
           auth.uid(),
           new.id,
           format('The dispute on order %s (%s) %s.', v_order_ref, v_deal_title, v_status_text)
             || coalesce(' Note: ' || v_note, ''),
           x.link_path
      from (values
        (coalesce(new.dispute_raised_by, new.student_id), '/dashboard/profile?view=orders'),
        (new.merchant_id, '/dashboard/orders')
      ) as x(user_id, link_path)
     where x.user_id is not null;
  end if;

  return new;
end;
$$;

revoke all on function public.notify_dispute_change() from public;

drop trigger if exists notify_dispute_change on public.orders;
create trigger notify_dispute_change
after update of dispute_status on public.orders
for each row
when (new.dispute_status is distinct from old.dispute_status)
execute function public.notify_dispute_change();
