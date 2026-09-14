revoke execute on function public.get_business_performance_signals() from anon;
revoke all on function public.get_business_performance_signals() from public;
grant execute on function public.get_business_performance_signals() to authenticated;
