alter table public.orders
  add column payment_deadline timestamptz;

create index orders_payment_deadline_idx
  on public.orders(payment_deadline);
