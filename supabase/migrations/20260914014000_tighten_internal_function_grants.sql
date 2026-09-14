REVOKE ALL ON FUNCTION public.assign_initial_user_role() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_initial_user_role() TO service_role;

REVOKE ALL ON FUNCTION public.can_access_group_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_access_group_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.find_open_group_order_by_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.find_open_group_order_by_code(text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_my_role() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

REVOKE ALL ON FUNCTION public.is_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.is_open_group_order(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_open_group_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.handle_redemption_notification() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_redemption_notification() TO service_role;

REVOKE ALL ON TABLE public.activity_logs FROM anon;
