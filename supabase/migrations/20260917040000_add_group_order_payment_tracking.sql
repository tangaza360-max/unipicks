alter table public.group_order_members
  add column if not exists payment_status text not null default 'unpaid'
  check (payment_status in ('unpaid', 'pending', 'paid'));

create table if not exists public.group_order_payment_members (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  group_order_member_id uuid not null references public.group_order_members(id) on delete cascade,
  amount integer not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, group_order_member_id)
);

alter table public.group_order_payment_members enable row level security;

create index if not exists idx_group_order_payment_members_transaction_id
  on public.group_order_payment_members(transaction_id);

create index if not exists idx_group_order_payment_members_member_id
  on public.group_order_payment_members(group_order_member_id);

create policy "Students can view own group order payment allocations"
  on public.group_order_payment_members
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.group_order_members member
      where member.id = group_order_payment_members.group_order_member_id
        and member.student_id = auth.uid()
    )
    or
    exists (
      select 1
      from public.transactions transaction
      where transaction.id = group_order_payment_members.transaction_id
        and transaction.student_id = auth.uid()
    )
  );
