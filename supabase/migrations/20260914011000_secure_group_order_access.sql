-- Secure group-order access:
-- Hosts and members can see their own groups.
-- Join-code lookup is handled by a restricted SECURITY DEFINER function.

CREATE OR REPLACE FUNCTION public.can_access_group_order(p_group_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_orders go
    WHERE go.id = p_group_order_id
      AND (
        go.created_by = auth.uid()
        OR EXISTS (
          SELECT 1
          FROM public.group_order_members gom
          WHERE gom.group_order_id = go.id
            AND gom.student_id = auth.uid()
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_open_group_order(p_group_order_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.group_orders
    WHERE id = p_group_order_id
      AND status = 'open'
  );
$$;

CREATE OR REPLACE FUNCTION public.find_open_group_order_by_code(p_join_code text)
RETURNS TABLE (
  id uuid,
  deal_id uuid,
  host_name text,
  join_code text,
  status text,
  created_at timestamptz,
  title text,
  business_name text,
  price numeric,
  discount_percent numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    go.id,
    go.deal_id,
    go.host_name,
    go.join_code,
    go.status,
    go.created_at,
    d.title,
    d.business_name,
    d.price,
    d.discount_percent
  FROM public.group_orders go
  JOIN public.deals d ON d.id = go.deal_id
  WHERE go.status = 'open'
    AND go.join_code = upper(trim(p_join_code))
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.can_access_group_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_group_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.is_open_group_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_open_group_order(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.find_open_group_order_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.find_open_group_order_by_code(text) TO authenticated;


DROP POLICY IF EXISTS "Anyone signed in can view group order members"
  ON public.group_order_members;

DROP POLICY IF EXISTS "Anyone signed in can view group orders"
  ON public.group_orders;

DROP POLICY IF EXISTS "Students can join group orders"
  ON public.group_order_members;


CREATE POLICY "Participants can view group orders"
  ON public.group_orders
  FOR SELECT
  TO authenticated
  USING ((SELECT public.can_access_group_order(id)));


CREATE POLICY "Participants can view group order members"
  ON public.group_order_members
  FOR SELECT
  TO authenticated
  USING ((SELECT public.can_access_group_order(group_order_id)));


CREATE POLICY "Students can join open group orders"
  ON public.group_order_members
  FOR INSERT
  TO authenticated
  WITH CHECK (
    student_id = auth.uid()
    AND (SELECT public.is_open_group_order(group_order_id))
  );
