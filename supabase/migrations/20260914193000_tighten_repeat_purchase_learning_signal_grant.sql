revoke execute on function public.get_my_repeat_purchase_counts()
from anon;

revoke all on function public.get_my_repeat_purchase_counts()
from public;

grant execute on function public.get_my_repeat_purchase_counts()
to authenticated;
