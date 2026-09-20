REVOKE EXECUTE ON FUNCTION public.handle_redemption_notification() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_redemption_notification() TO service_role;
