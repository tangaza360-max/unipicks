-- Create system settings table
CREATE TABLE IF NOT EXISTS public.system_settings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  key text NOT NULL UNIQUE,
  value jsonb NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- Only admins can view and update settings.
drop policy if exists "Admins can view system settings" on public.system_settings;
CREATE POLICY "Admins can view system settings"
ON public.system_settings
FOR SELECT
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

drop policy if exists "Admins can insert system settings" on public.system_settings;
CREATE POLICY "Admins can insert system settings"
ON public.system_settings
FOR INSERT
TO authenticated
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

drop policy if exists "Admins can update system settings" on public.system_settings;
CREATE POLICY "Admins can update system settings"
ON public.system_settings
FOR UPDATE
TO authenticated
USING (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
)
WITH CHECK (
  (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
);

-- Insert default settings
INSERT INTO public.system_settings (key, value, description) VALUES
  ('platform_name', '"Unipicks"', 'The name of the platform'),
  ('platform_description', '"Student discount platform"', 'Brief description of the platform'),
  ('allow_merchant_registration', 'true', 'Whether merchants can register'),
  ('allow_student_registration', 'true', 'Whether students can register'),
  ('deal_approval_required', 'true', 'Whether deals need admin approval before going live'),
  ('max_discount_percent', '90', 'Maximum discount percentage allowed'),
  ('max_price_rwf', '100000', 'Maximum deal price in RWF'),
  ('contact_email', '"admin@unipicks.com"', 'Contact email for support')
ON CONFLICT (key) DO NOTHING;

-- Create a function to get a setting value
CREATE OR REPLACE FUNCTION public.get_setting(setting_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  setting_value jsonb;
BEGIN
  SELECT value INTO setting_value
  FROM public.system_settings
  WHERE key = setting_key;
  
  RETURN setting_value;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_setting(text) TO authenticated;