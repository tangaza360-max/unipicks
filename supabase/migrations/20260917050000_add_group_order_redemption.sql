alter table public.redemptions
  add column if not exists group_order_id uuid
  references public.group_orders(id)
  on delete set null;

create unique index if not exists redemptions_group_order_id_unique
  on public.redemptions(group_order_id)
  where group_order_id is not null;

create index if not exists redemptions_group_order_id_idx
  on public.redemptions(group_order_id);
