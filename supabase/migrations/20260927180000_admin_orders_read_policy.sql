-- Allow admins to read all orders so they can resolve disputes.
-- Uses the existing get_my_role() RPC to determine the caller's role.

drop policy if exists "Admins can view all orders" on public.orders;

create policy "Admins can view all orders"
  on public.orders
  for select
  to authenticated
  using (public.get_my_role() = 'admin');
