-- Ensure the query returned by get_all_students matches its declared table type.
DROP FUNCTION IF EXISTS public.get_all_students();

CREATE FUNCTION public.get_all_students()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  university text,
  student_id text,
  banned boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE auth.users.id = auth.uid()
    AND (auth.users.raw_user_meta_data->>'role') = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can view student list';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    (u.raw_user_meta_data->>'full_name')::text,
    (u.raw_user_meta_data->>'university')::text,
    (u.raw_user_meta_data->>'student_id')::text,
    (u.raw_user_meta_data->>'banned')::boolean
  FROM auth.users u
  WHERE (u.raw_user_meta_data->>'role') = 'student'
  ORDER BY u.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_students() TO authenticated;