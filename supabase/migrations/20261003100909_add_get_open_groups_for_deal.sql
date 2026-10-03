-- UNIPICKS GROUP ORDERS
-- Lists all open group orders for a given deal so students can discover
-- existing groups and join them without needing a code.

create or replace function public.get_open_groups_for_deal(p_deal_id uuid)
returns table (
  id uuid,
  deal_id uuid,
  host_name text,
  join_code text,
  status text,
  created_at timestamptz,
  member_count bigint,
  total_quantity bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    go.id,
    go.deal_id,
    go.host_name,
    go.join_code,
    go.status,
    go.created_at,
    coalesce(count(distinct gom.id), 0) as member_count,
    coalesce(sum(gom.quantity), 0) as total_quantity
  from public.group_orders go
  left join public.group_order_members gom on gom.group_order_id = go.id
  where go.deal_id = p_deal_id
    and go.status = 'open'
  group by go.id
  order by go.created_at desc
  limit 20;
$$;

revoke all on function public.get_open_groups_for_deal(uuid) from public;
grant execute on function public.get_open_groups_for_deal(uuid) to authenticated;
