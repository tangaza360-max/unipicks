-- Function for admins to get a list of all merchants with their details
-- This bypasses RLS on auth.users so admins can see all merchants

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
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
BEGIN
  -- Only admins can call this
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
    u.created_at
  FROM auth.users u
  LEFT JOIN public.merchant_profiles mp ON u.id = mp.id
  WHERE (u.raw_user_meta_data->>'role') = 'merchant'
  ORDER BY u.created_at DESC;
END;
$$;

-- Grant execute permission to authenticated users (the function checks admin role internally)
GRANT EXECUTE ON FUNCTION public.get_all_merchants() TO authenticated;