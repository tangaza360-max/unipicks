-- Drop existing functions to allow return type change
DROP FUNCTION IF EXISTS public.get_all_students();
DROP FUNCTION IF EXISTS public.get_all_merchants();

-- Recreate get_all_students with banned flag
CREATE OR REPLACE FUNCTION public.get_all_students()
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
    u.email,
    u.raw_user_meta_data->>'full_name' as full_name,
    u.raw_user_meta_data->>'university' as university,
    u.raw_user_meta_data->>'student_id' as student_id,
    (u.raw_user_meta_data->>'banned')::boolean as banned
  FROM auth.users u
  WHERE (u.raw_user_meta_data->>'role') = 'student'
  ORDER BY u.created_at DESC;
END;
$$;

-- Recreate get_all_merchants with banned flag
CREATE OR REPLACE FUNCTION public.get_all_merchants()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  business_name text,
  phone text,
  address text,
  rdb_number text,
  approved boolean,
  created_at timestamptz,
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
    RAISE EXCEPTION 'Only admins can view merchant list';
  END IF;

  RETURN QUERY
  SELECT 
    u.id,
    u.email,
    u.raw_user_meta_data->>'full_name' as full_name,
    u.raw_user_meta_data->>'business_name' as business_name,
    u.raw_user_meta_data->>'phone' as phone,
    u.raw_user_meta_data->>'address' as address,
    u.raw_user_meta_data->>'rdb_number' as rdb_number,
    COALESCE(mp.approved, false) as approved,
    u.created_at,
    (u.raw_user_meta_data->>'banned')::boolean as banned
  FROM auth.users u
  LEFT JOIN public.merchant_profiles mp ON u.id = mp.id
  WHERE (u.raw_user_meta_data->>'role') = 'merchant'
  ORDER BY u.created_at DESC;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_all_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_merchants() TO authenticated;