create or replace function public.get_my_repeat_purchase_counts()
returns table (
  deal_id uuid,
  purchase_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.deal_id,
    count(*) as purchase_count
  from public.redemptions r
  where r.student_id = auth.uid()
    and r.status = 'redeemed'
  group by r.deal_id
  having count(*) > 1;
$$;

revoke all on function public.get_my_repeat_purchase_counts()
from public;

grant execute on function public.get_my_repeat_purchase_counts()
to authenticated;
