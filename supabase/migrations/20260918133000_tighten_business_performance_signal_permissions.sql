REVOKE EXECUTE ON FUNCTION public.get_business_performance_signals() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_performance_signals() TO service_role;
