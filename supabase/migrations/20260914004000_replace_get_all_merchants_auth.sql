DROP FUNCTION IF EXISTS public.get_all_merchants();

CREATE FUNCTION public.get_all_merchants()
RETURNS TABLE (
  id uuid,
  email text,
  full_name text,
  business_name text,
  phone text,
  address text,
  rdb_number text,
  approved boolean,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can view merchant list';
  END IF;

  RETURN QUERY
  SELECT
    u.id,
    u.email,
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'business_name',
    u.raw_user_meta_data->>'phone',
    u.raw_user_meta_data->>'address',
    u.raw_user_meta_data->>'rdb_number',
    COALESCE(mp.approved, false),
    u.created_at
  FROM auth.users u
  INNER JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'merchant'
  LEFT JOIN public.merchant_profiles mp ON u.id = mp.id
  ORDER BY u.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_all_merchants() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_all_merchants() TO authenticated;
