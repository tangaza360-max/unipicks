revoke execute on function public.get_my_completed_orders()
from anon;

revoke all on function public.get_my_completed_orders()
from public;

grant execute on function public.get_my_completed_orders()
to authenticated;
