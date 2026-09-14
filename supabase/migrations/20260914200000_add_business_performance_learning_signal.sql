create or replace function public.get_business_performance_signals()
returns table (
  merchant_id uuid,
  completed_order_count bigint,
  completed_order_count_7d bigint,
  completed_order_count_30d bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.merchant_id,
    count(r.id) filter (
      where r.status = 'redeemed'
    ) as completed_order_count,
    count(r.id) filter (
      where r.status = 'redeemed'
        and coalesce(r.redeemed_at, r.created_at) >= now() - interval '7 days'
    ) as completed_order_count_7d,
    count(r.id) filter (
      where r.status = 'redeemed'
        and coalesce(r.redeemed_at, r.created_at) >= now() - interval '30 days'
    ) as completed_order_count_30d
  from public.deals d
  left join public.redemptions r
    on r.deal_id = d.id
  where d.merchant_id is not null
  group by d.merchant_id;
$$;

revoke all on function public.get_business_performance_signals() from public;
grant execute on function public.get_business_performance_signals() to authenticated;
