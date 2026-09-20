REVOKE EXECUTE ON FUNCTION public.reserve_group_order_payment_members(uuid[]) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_group_order_payment_members(uuid[]) TO service_role;
