-- Secure merchant image uploads.
-- Keep public read behavior unchanged; only restrict uploads.

-- Remove broad upload policies.
DROP POLICY IF EXISTS "Allow authenticated uploads to story-images"
  ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated users to upload to deal-images"
  ON storage.objects;

DROP POLICY IF EXISTS "Allow users to upload their own deal images"
  ON storage.objects;

DROP POLICY IF EXISTS "Merchants can upload their own logo"
  ON storage.objects;

-- Deal images:
-- Existing path: <merchant_id>/<timestamp>-<filename>
CREATE POLICY "Approved merchants can upload their own deal images"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'deal-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  );

-- Merchant stories:
-- Existing path: merchants/<merchant_id>/<timestamp>.<extension>
CREATE POLICY "Approved merchants can upload their own stories"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'story-images'
    AND (storage.foldername(name))[1] = 'merchants'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  );

-- Merchant logos:
-- Existing path: <merchant_id>/<timestamp>.<extension>
CREATE POLICY "Approved merchants can upload their own logo"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'merchant-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND EXISTS (
      SELECT 1
      FROM public.merchant_profiles
      WHERE id = auth.uid()
        AND approved = true
    )
  );
