-- UNIPICKS GROUP ORDERS
-- Per-deal group activity for the currently authenticated merchant.
-- Returns one row per group_buy deal owned by the merchant, with counts of
-- open groups, total members, and total items currently forming.

create or replace function public.get_merchant_group_activity()
returns table (
  deal_id uuid,
  open_group_count bigint,
  total_members bigint,
  total_quantity bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.id as deal_id,
    coalesce(count(distinct go.id), 0) as open_group_count,
    coalesce(count(distinct gom.id), 0) as total_members,
    coalesce(sum(gom.quantity), 0) as total_quantity
  from public.deals d
  left join public.group_orders go
    on go.deal_id = d.id and go.status = 'open'
  left join public.group_order_members gom
    on gom.group_order_id = go.id
  where d.merchant_id = auth.uid()
    and d.offer_type = 'group_buy'
  group by d.id;
$$;

revoke all on function public.get_merchant_group_activity() from public;
grant execute on function public.get_merchant_group_activity() to authenticated;
