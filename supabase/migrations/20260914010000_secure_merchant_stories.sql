ALTER TABLE public.merchant_stories ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.merchant_stories FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.merchant_stories TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can view active merchant stories" ON public.merchant_stories;
CREATE POLICY "Authenticated users can view active merchant stories"
  ON public.merchant_stories
  FOR SELECT
  TO authenticated
  USING (expires_at > now());

DROP POLICY IF EXISTS "Approved merchants can create their own stories" ON public.merchant_stories;
CREATE POLICY "Approved merchants can create their own stories"
 ON public.merchant_stories
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

DROP POLICY IF EXISTS "Merchants can update their own stories" ON public.merchant_stories;
CREATE POLICY "Merchants can update their own stories"
  ON public.merchant_stories
  FOR UPDATE
  TO authenticated
  USING (merchant_id = auth.uid())
  WITH CHECK (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Merchants can delete their own stories" ON public.merchant_stories;
CREATE POLICY "Merchants can delete their own stories"
  ON public.merchant_stories
  FOR DELETE
  TO authenticated
  USING (merchant_id = auth.uid());

DROP POLICY IF EXISTS "Admins can manage merchant stories" ON public.merchant_stories;
CREATE POLICY "Admins can manage merchant stories"
  ON public.merchant_stories
  FOR ALL
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));
