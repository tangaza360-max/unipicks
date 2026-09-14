DROP POLICY IF EXISTS "Admins can view all transactions" ON public.transactions;

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT TO authenticated
  USING ((SELECT public.is_admin()));
