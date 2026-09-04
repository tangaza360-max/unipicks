create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  deal_id uuid references public.deals(id) on delete set null,
  order_id uuid references public.group_orders(id) on delete set null,
  amount integer not null check (amount > 0),
  phone_number text not null,
  reference text not null unique,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'cancelled')),
  provider_response jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_has_reference_target check (deal_id is not null or order_id is not null)
);

alter table public.transactions enable row level security;

drop policy if exists "Students can insert own transactions" on public.transactions;
create policy "Students can insert own transactions"
  on public.transactions for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending');

drop policy if exists "Students can view own transactions" on public.transactions;
create policy "Students can view own transactions"
  on public.transactions for select to authenticated
  using (student_id = auth.uid());

drop policy if exists "Admins can view all transactions" on public.transactions;
create policy "Admins can view all transactions"
  on public.transactions for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create or replace function public.set_transaction_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions
for each row execute function public.set_transaction_updated_at();

create index if not exists idx_transactions_student_id on public.transactions(student_id);
create index if not exists idx_transactions_order_id on public.transactions(order_id);
create index if not exists idx_transactions_status on public.transactions(status);
create index if not exists idx_transactions_created_at on public.transactions(created_at desc);
