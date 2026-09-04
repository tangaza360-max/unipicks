-- Function to ban a user (sets banned flag in user metadata)
CREATE OR REPLACE FUNCTION public.admin_ban_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  current_meta jsonb;
BEGIN
  -- Ensure the caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = current_user_id
    AND (raw_user_meta_data->>'role') = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can perform this action';
  END IF;

  -- Update the target user's metadata to include banned: true
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

-- Function to unban a user
CREATE OR REPLACE FUNCTION public.admin_unban_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
  current_meta jsonb;
BEGIN
  -- Ensure the caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = current_user_id
    AND (raw_user_meta_data->>'role') = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can perform this action';
  END IF;

  -- Remove banned key from metadata
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

-- Function to delete a user (permanently)
CREATE OR REPLACE FUNCTION public.admin_delete_user(target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  current_user_id uuid := auth.uid();
BEGIN
  -- Ensure the caller is an admin
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = current_user_id
    AND (raw_user_meta_data->>'role') = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can perform this action';
  END IF;

  -- Delete the user from auth (cascade will handle other tables if set up)
  DELETE FROM auth.users WHERE id = target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully');
END;
$$;

-- Grant execute permissions to authenticated users (the functions will check admin role)
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;