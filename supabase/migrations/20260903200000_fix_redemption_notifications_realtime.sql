-- Keep the trigger independent of the session user's RLS policies.
create or replace function public.handle_redemption_notification()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  deal_merchant_id uuid;
  deal_title text;
begin
  select merchant_id, title
    into deal_merchant_id, deal_title
  from public.deals
  where id = new.deal_id;

  if deal_merchant_id is not null then
    insert into public.notifications (
      merchant_id,
      deal_id,
      student_name,
      student_email,
      message,
      type
    ) values (
      deal_merchant_id,
      new.deal_id,
      new.student_name,
      (select email from auth.users where id = new.student_id),
      format('Student %s redeemed "%s"', coalesce(new.student_name, 'A student'), coalesce(deal_title, 'your deal')),
      'redemption'
    );
  end if;

  return new;
end;
$$;

-- Recreate the trigger so this migration is safe on databases with or without it.
drop trigger if exists redemption_notification_trigger on public.redemptions;
create trigger redemption_notification_trigger
after insert on public.redemptions
for each row
execute function public.handle_redemption_notification();

-- The notification bell listens to postgres_changes INSERT events.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end
$$;
