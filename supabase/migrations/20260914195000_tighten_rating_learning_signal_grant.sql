revoke execute on function public.get_my_rating_history()
from anon;

revoke all on function public.get_my_rating_history()
from public;

grant execute on function public.get_my_rating_history()
to authenticated;
