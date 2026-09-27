-- Fix: production was missing EXECUTE grants for authenticated users
-- on the group-order helper functions. Without these grants, students
-- could not load their Orders tab:
--   "permission denied for function can_access_group_order"
--
-- This restores the grants declared in
-- 20260914011000_secure_group_order_access.sql.
--
-- Safe to run repeatedly (GRANT is idempotent).

GRANT EXECUTE ON FUNCTION public.can_access_group_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_open_group_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_open_group_order_by_code(text) TO authenticated;
