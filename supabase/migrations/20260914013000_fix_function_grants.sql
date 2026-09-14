REVOKE ALL ON FUNCTION public.admin_ban_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.admin_unban_user(uuid) FROM anon;

REVOKE ALL ON FUNCTION public.get_all_merchants() FROM anon;
REVOKE ALL ON FUNCTION public.get_all_students() FROM anon;

GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_all_merchants() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_students() TO authenticated;
