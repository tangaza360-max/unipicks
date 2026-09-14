-- Prevent merchants from approving themselves.
-- Admins keep separate authority to change merchant_profiles.

DROP POLICY IF EXISTS "Merchants can update own profile"
  ON public.merchant_profiles;

CREATE POLICY "Merchants can update own profile"
  ON public.merchant_profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND approved = false
  );
