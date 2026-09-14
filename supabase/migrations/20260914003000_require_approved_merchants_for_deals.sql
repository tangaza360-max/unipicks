-- Only approved merchants may create, update, or delete deals.

DROP POLICY IF EXISTS "Merchants can insert own deals"
  ON public.deals;

DROP POLICY IF EXISTS "Merchants can insert their own deals"
  ON public.deals;

DROP POLICY IF EXISTS "Merchants can update own deals"
  ON public.deals;

DROP POLICY IF EXISTS "Merchants can update their own deals"
  ON public.deals;

DROP POLICY IF EXISTS "Merchants can delete their own deals"
  ON public.deals;

CREATE POLICY "Approved merchants can insert their own deals"
  ON public.deals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  );

CREATE POLICY "Approved merchants can update their own deals"
  ON public.deals
  FOR UPDATE
  TO authenticated
  USING (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  )
  WITH CHECK (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  );

CREATE POLICY "Approved merchants can delete their own deals"
  ON public.deals
  FOR DELETE
  TO authenticated
  USING (
    merchant_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  );
