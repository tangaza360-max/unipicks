-- UNIPICKS GROUP ORDERS
-- Link a group order to the merchant-facing orders row created when the host pays.
-- When a host pays a group order, we create ONE orders row representing the whole
-- group, so the merchant fulfills it as a single transaction (industry standard).

alter table public.orders
  add column if not exists group_order_id uuid
    references public.group_orders(id) on delete set null;

create index if not exists orders_group_order_id_idx
  on public.orders(group_order_id);

comment on column public.orders.group_order_id is
  'Set when this order was created from a group order payment. NULL for regular orders.';
