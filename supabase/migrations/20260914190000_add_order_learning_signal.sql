create or replace function public.get_my_completed_orders()
returns table (
  deal_id uuid,
  completed_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.deal_id,
    coalesce(r.redeemed_at, r.created_at) as completed_at
  from public.redemptions r
  where r.student_id = auth.uid()
    and r.status = 'redeemed'
  order by coalesce(r.redeemed_at, r.created_at) desc;
$$;

revoke all on function public.get_my_completed_orders()
from public;

grant execute on function public.get_my_completed_orders()
to authenticated;
