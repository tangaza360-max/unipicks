alter table public.transactions
  add column normal_order_id uuid references public.orders(id) on delete set null;

alter table public.redemptions
  add column order_id uuid references public.orders(id) on delete set null;

alter table public.ratings
  add column order_id uuid references public.orders(id) on delete set null;

create unique index transactions_normal_order_id_unique
  on public.transactions(normal_order_id)
  where normal_order_id is not null;

create unique index redemptions_order_id_unique
  on public.redemptions(order_id)
  where order_id is not null;

create unique index ratings_order_id_unique
  on public.ratings(order_id)
  where order_id is not null;

create index transactions_normal_order_id_idx
  on public.transactions(normal_order_id);

create index redemptions_order_id_idx
  on public.redemptions(order_id);

create index ratings_order_id_idx
  on public.ratings(order_id);
