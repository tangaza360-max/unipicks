-- Drop any leftover functions/views from previous attempts
DROP FUNCTION IF EXISTS public.get_all_students() CASCADE;
DROP VIEW IF EXISTS public.student_profiles CASCADE;

-- Create the final working function
CREATE OR REPLACE FUNCTION public.get_all_students()
RETURNS jsonb
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
    WHERE (u.raw_user_meta_data->>'role') = 'student'),
    '[]'::jsonb
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_students() TO authenticated;