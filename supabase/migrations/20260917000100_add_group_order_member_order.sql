ALTER TABLE public.group_order_members
  ADD COLUMN IF NOT EXISTS order_id uuid
  REFERENCES public.orders(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS group_order_members_order_id_uidx
  ON public.group_order_members(order_id)
  WHERE order_id IS NOT NULL;
