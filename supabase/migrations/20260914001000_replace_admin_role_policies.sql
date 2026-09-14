-- Replace client-controlled user_metadata.role checks
-- with the trusted public.is_admin() authorization helper.

DROP POLICY IF EXISTS "Admins can delete merchant profiles"
  ON public.merchant_profiles;

CREATE POLICY "Admins can delete merchant profiles"
  ON public.merchant_profiles
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can delete ratings"
  ON public.ratings;

CREATE POLICY "Admins can delete ratings"
  ON public.ratings
  FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can insert system settings"
  ON public.system_settings;

CREATE POLICY "Admins can insert system settings"
  ON public.system_settings
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can update merchant profiles"
  ON public.merchant_profiles;

CREATE POLICY "Admins can update merchant profiles"
  ON public.merchant_profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can update system settings"
  ON public.system_settings;

CREATE POLICY "Admins can update system settings"
  ON public.system_settings
  FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can view activity logs"
  ON public.activity_logs;

CREATE POLICY "Admins can view activity logs"
  ON public.activity_logs
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can view all merchant profiles"
  ON public.merchant_profiles;

CREATE POLICY "Admins can view all merchant profiles"
  ON public.merchant_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));


DROP POLICY IF EXISTS "Admins can view system settings"
  ON public.system_settings;

CREATE POLICY "Admins can view system settings"
  ON public.system_settings
  FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));
