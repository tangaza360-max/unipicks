alter table public.orders
  add column merchant_phone text;

create index orders_merchant_phone_idx
  on public.orders(merchant_phone);
