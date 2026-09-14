create or replace function public.get_my_rating_history()
returns table (
  deal_id uuid,
  rating integer,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.deal_id,
    r.rating,
    r.created_at
  from public.ratings r
  where r.student_id = auth.uid()
  order by r.created_at desc;
$$;

revoke all on function public.get_my_rating_history()
from public;

grant execute on function public.get_my_rating_history()
to authenticated;
