DROP FUNCTION IF EXISTS public.admin_ban_user(uuid);
DROP FUNCTION IF EXISTS public.admin_unban_user(uuid);
DROP FUNCTION IF EXISTS public.admin_delete_user(uuid);

CREATE FUNCTION public.admin_ban_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_meta jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can perform this action';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data || '{"banned": true}'::jsonb
  WHERE id = target_user_id
  RETURNING raw_user_meta_data INTO current_meta;

  IF current_meta IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'User banned successfully');
END;
$$;

CREATE FUNCTION public.admin_unban_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_meta jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can perform this action';
  END IF;

  UPDATE auth.users
  SET raw_user_meta_data = raw_user_meta_data - 'banned'
  WHERE id = target_user_id
  RETURNING raw_user_meta_data INTO current_meta;

  IF current_meta IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'User unbanned successfully');
END;
$$;

CREATE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can perform this action';
  END IF;

  DELETE FROM auth.users WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_ban_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_unban_user(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
