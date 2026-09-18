-- Add Group Order support to the existing transaction system.
--
-- Normal payments already use redemption_id.
-- Group payments may start before the final shared redemption exists,
-- so redemption_id must be allowed to remain NULL temporarily.

alter table public.transactions
  add column if not exists redemption_id uuid
  references public.redemptions(id)
  on delete set null;

alter table public.transactions
  alter column redemption_id drop not null;

alter table public.transactions
  add column if not exists group_order_id uuid
  references public.group_orders(id)
  on delete set null;

create index if not exists transactions_group_order_id_idx
  on public.transactions(group_order_id);