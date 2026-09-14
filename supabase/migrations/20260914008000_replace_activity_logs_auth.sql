DROP POLICY IF EXISTS "Admins can view activity logs" ON public.activity_logs;
CREATE POLICY "Admins can view activity logs"
  ON public.activity_logs FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.log_admin_action(
  action text,
  target_type text,
  target_id uuid DEFAULT NULL,
  target_name text DEFAULT NULL,
  details jsonb DEFAULT '{}'::jsonb
)
RETURNS public.activity_logs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  current_user_data auth.users;
  result public.activity_logs;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create activity logs';
  END IF;

  SELECT * INTO current_user_data
  FROM auth.users
  WHERE id = auth.uid();

  IF current_user_data.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  INSERT INTO public.activity_logs (
    admin_id, admin_email, admin_name, action, target_type,
    target_id, target_name, details
  )
  VALUES (
    current_user_data.id,
    current_user_data.email,
    current_user_data.raw_user_meta_data ->> 'full_name',
    action,
    target_type,
    target_id,
    target_name,
    COALESCE(details, '{}'::jsonb)
  )
  RETURNING * INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.log_admin_action(text, text, uuid, text, jsonb) TO authenticated;
