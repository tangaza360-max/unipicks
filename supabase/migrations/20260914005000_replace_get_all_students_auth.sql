DROP FUNCTION IF EXISTS public.get_all_students();

CREATE FUNCTION public.get_all_students()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view student list';
  END IF;

  RETURN COALESCE(
    (SELECT jsonb_agg(
      jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'full_name', u.raw_user_meta_data->>'full_name',
        'university', u.raw_user_meta_data->>'university',
        'student_id', u.raw_user_meta_data->>'student_id'
      )
    )
    FROM auth.users u
    INNER JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'student'),
    '[]'::jsonb
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_students() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_students() TO authenticated;
