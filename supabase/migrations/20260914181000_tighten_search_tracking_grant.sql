revoke execute on function public.record_deal_search(text)
from anon;

revoke all on public.deal_searches
from anon;

grant insert on public.deal_searches
to authenticated;
