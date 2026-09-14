revoke execute on function public.record_deal_view(uuid) from anon;
revoke all on function public.record_deal_view(uuid) from public;
grant execute on function public.record_deal_view(uuid) to authenticated;
