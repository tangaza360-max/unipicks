-- Unipicks authorization foundation
-- auth.users = identity
-- user_roles = trusted authorization source
-- user_metadata.role is never trusted for authorization decisions

CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('student', 'merchant', 'delivery', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.user_roles FROM anon, authenticated;

-- Return the caller's trusted role.
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.get_my_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

-- Check whether the caller is an admin.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- Assign a safe role when a new auth user is created.
-- Public signup may create only student or merchant accounts.
-- Admin and delivery roles must be assigned through trusted administration.
CREATE OR REPLACE FUNCTION public.assign_initial_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  requested_role text;
BEGIN
  requested_role := NEW.raw_user_meta_data ->> 'role';

  IF requested_role NOT IN ('student', 'merchant') THEN
    requested_role := 'student';
  END IF;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, requested_role);

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_initial_user_role() FROM PUBLIC;

DROP TRIGGER IF EXISTS on_auth_user_created_assign_role ON auth.users;

CREATE TRIGGER on_auth_user_created_assign_role
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.assign_initial_user_role();

-- Migrate roles for existing users.
-- Only supported roles are copied.
INSERT INTO public.user_roles (user_id, role)
SELECT
  id,
  raw_user_meta_data ->> 'role'
FROM auth.users
WHERE raw_user_meta_data ->> 'role'
    IN ('student', 'merchant', 'delivery', 'admin')
ON CONFLICT (user_id)
DO UPDATE SET
  role = EXCLUDED.role,
  updated_at = now();
