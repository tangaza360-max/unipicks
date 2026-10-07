-- "Food ready" (founder decision 2026-10-07): the business taps Food ready
-- when a paid order is cooked; the student gets an alert and the order
-- shows Ordered → Accepted → Paid → Ready → Collected.
--
-- A time, not a new status: payments, pickup codes, refunds and disputes all
-- look for status 'paid', and a new status would have to be added to each.
-- Only the update-order-status function (service role) sets it; students and
-- businesses have no UPDATE policy on orders.
alter table public.orders add column if not exists ready_at timestamptz;

comment on column public.orders.ready_at is
  'When the business marked the food ready (status stays paid). Set only by update-order-status.';
