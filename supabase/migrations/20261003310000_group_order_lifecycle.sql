-- Fix 7 (ecosystem audit J5; founder decisions): group order lifecycle.
--
--   1. A group stays open for 24 hours (expires_at). After that nobody can join
--      or submit it, and expire-orders closes it (status 'cancelled').
--   2. If the group's order dies (merchant declines, confirmation or payment
--      window expires), the group goes back to 'open' with the same members,
--      with a fresh 24 hours, so the host can submit again. Before, the group
--      stayed 'closed' forever and could never be resubmitted.
--   3. Members are told what happens (user_notifications → Social activity and
--      the student badge): sent to the business, paid, not completed and
--      reopened, closed after 24 hours.
--   4. Groups can't be created for, joined on, or (in the Edge Function)
--      submitted for an inactive or expired deal.

-- 1. expires_at ---------------------------------------------------------------
alter table public.group_orders add column if not exists expires_at timestamptz;
update public.group_orders set expires_at = created_at + interval '24 hours' where expires_at is null;
alter table public.group_orders alter column expires_at set default now() + interval '24 hours';
alter table public.group_orders alter column expires_at set not null;
create index if not exists group_orders_open_expires_idx on public.group_orders (expires_at) where status = 'open';

-- "Open" now means: open, not past its 24 hours, and the deal is still live.
create or replace function public.is_open_group_order(p_group_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.group_orders go
      join public.deals d on d.id = go.deal_id
     where go.id = p_group_order_id
       and go.status = 'open'
       and go.expires_at > now()
       and d.active
       and (d.expires_at is null or d.expires_at > now())
  );
$$;

create or replace function public.find_open_group_order_by_code(p_join_code text)
returns table (
  id uuid, deal_id uuid, host_name text, join_code text, status text, created_at timestamptz,
  title text, business_name text, price numeric, discount_percent numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select go.id, go.deal_id, go.host_name, go.join_code, go.status, go.created_at,
         d.title, d.business_name, d.price, d.discount_percent
    from public.group_orders go
    join public.deals d on d.id = go.deal_id
   where go.status = 'open'
     and go.expires_at > now()
     and d.active
     and (d.expires_at is null or d.expires_at > now())
     and go.join_code = upper(trim(p_join_code))
   limit 1;
$$;

create or replace function public.get_open_groups_for_deal(p_deal_id uuid)
returns table (
  id uuid, deal_id uuid, host_name text, join_code text, status text, created_at timestamptz,
  member_count bigint, total_quantity bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select go.id, go.deal_id, go.host_name, go.join_code, go.status, go.created_at,
         coalesce(count(distinct gom.id), 0) as member_count,
         coalesce(sum(gom.quantity), 0) as total_quantity
    from public.group_orders go
    left join public.group_order_members gom on gom.group_order_id = go.id
   where go.deal_id = p_deal_id
     and go.status = 'open'
     and go.expires_at > now()
   group by go.id
   order by go.created_at desc
   limit 20;
$$;

-- 4. No new groups for inactive or expired deals (body otherwise unchanged).
create or replace function public.create_group_order_with_host(
  p_deal_id uuid,
  p_join_code text
)
returns public.group_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_order public.group_orders;
  v_host_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a group order.';
  end if;

  if p_deal_id is null then
    raise exception 'A deal is required.';
  end if;

  if not exists (select 1 from public.deals where id = p_deal_id) then
    raise exception 'The selected deal does not exist.';
  end if;

  if not exists (
    select 1 from public.deals
     where id = p_deal_id and active and (expires_at is null or expires_at > now())
  ) then
    raise exception 'This deal has ended, so a new group can''t be started.';
  end if;

  select coalesce(nullif(trim(raw_user_meta_data ->> 'full_name'), ''), email)
    into v_host_name
    from auth.users
   where id = auth.uid();

  if v_host_name is null or trim(v_host_name) = '' then
    raise exception 'Your account does not have a valid name or email.';
  end if;

  if p_join_code is null or trim(p_join_code) = '' then
    raise exception 'A join code is required.';
  end if;

  insert into public.group_orders (deal_id, created_by, host_name, join_code)
  values (p_deal_id, auth.uid(), v_host_name, upper(trim(p_join_code)))
  returning * into v_group_order;

  insert into public.group_order_members (group_order_id, student_id, student_name, quantity)
  values (v_group_order.id, auth.uid(), v_host_name, 1);

  return v_group_order;
end;
$$;

-- 2 + 3. Order events for group orders -----------------------------------------
create or replace function public.handle_group_order_event()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_group public.group_orders;
  v_deal text;
  v_business text;
  v_host text;
  v_reason text;
begin
  if new.group_order_id is null then
    return new;
  end if;

  select * into v_group from public.group_orders where id = new.group_order_id;
  if not found then
    return new;
  end if;

  select coalesce(d.title, 'your deal'), coalesce(d.business_name, 'the business')
    into v_deal, v_business
    from public.deals d where d.id = new.deal_id;
  v_deal := coalesce(v_deal, 'your deal');
  v_business := coalesce(v_business, 'the business');
  v_host := coalesce(nullif(trim(v_group.host_name), ''), 'The host');

  if tg_op = 'INSERT' then
    -- Sent to the business: tell everyone except the host who sent it.
    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    select m.student_id, 'group_order_submitted', v_group.created_by, v_group.id,
           format('%s sent your group order for %s to %s.', v_host, v_deal, v_business),
           '/dashboard/orders'
      from public.group_order_members m
     where m.group_order_id = v_group.id
       and m.student_id <> v_group.created_by;
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  if new.status = 'paid' then
    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    select m.student_id, 'group_order_paid', v_group.created_by, v_group.id,
           format('Your group order for %s is paid. %s has the pickup code.', v_deal, v_host),
           '/dashboard/orders'
      from public.group_order_members m
     where m.group_order_id = v_group.id
       and m.student_id <> v_group.created_by;
    return new;
  end if;

  if new.status in ('declined', 'confirmation_expired', 'payment_expired') then
    v_reason := case new.status
      when 'declined' then format('%s declined it', v_business)
      when 'confirmation_expired' then format('%s didn''t respond in time', v_business)
      else 'it wasn''t paid in time'
    end;

    -- Reopen with the same members and a fresh 24 hours.
    update public.group_orders
       set status = 'open',
           expires_at = greatest(expires_at, now() + interval '24 hours')
     where id = v_group.id
       and status = 'closed';

    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    select m.student_id, 'group_order_reopened', null, v_group.id,
           format('Your group order for %s wasn''t completed: %s. The group is open again, so %s.',
                  v_deal, v_reason,
                  case when m.student_id = v_group.created_by then 'you can send it again' else 'the host can send it again' end),
           '/dashboard/orders'
      from public.group_order_members m
     where m.group_order_id = v_group.id;
  end if;

  return new;
end;
$$;

revoke all on function public.handle_group_order_event() from public;

drop trigger if exists handle_group_order_event on public.orders;
create trigger handle_group_order_event
after insert or update of status on public.orders
for each row
when (new.group_order_id is not null)
execute function public.handle_group_order_event();

-- 1 + 3. Closed after 24 hours: tell the members ----------------------------------
create or replace function public.notify_group_expired()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deal text;
begin
  select coalesce(d.title, 'your deal') into v_deal from public.deals d where d.id = new.deal_id;

  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  select m.student_id, 'group_order_expired', null, new.id,
         format('Your group for %s closed: it wasn''t sent to the business within 24 hours.', coalesce(v_deal, 'your deal')),
         '/dashboard/orders'
    from public.group_order_members m
   where m.group_order_id = new.id;
  return new;
end;
$$;

revoke all on function public.notify_group_expired() from public;

drop trigger if exists notify_group_expired on public.group_orders;
create trigger notify_group_expired
after update of status on public.group_orders
for each row
when (old.status = 'open' and new.status = 'cancelled' and new.expires_at <= now())
execute function public.notify_group_expired();
