create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  student_id uuid not null references auth.users(id),
  student_name text,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'redeemed')),
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

alter table public.redemptions enable row level security;

create policy "Students can insert own redemptions"
  on public.redemptions for insert
  to authenticated
  with check (student_id = auth.uid());

create policy "Students can view own redemptions"
  on public.redemptions for select
  to authenticated
  using (student_id = auth.uid());

create policy "Merchants can view redemptions for their deals"
  on public.redemptions for select
  to authenticated
  using (
    exists (
      select 1 from public.deals
      where deals.id = redemptions.deal_id
      and deals.merchant_id = auth.uid()
    )
  );

create policy "Merchants can update redemptions for their deals"
  on public.redemptions for update
  to authenticated
  using (
    exists (
      select 1 from public.deals
      where deals.id = redemptions.deal_id
      and deals.merchant_id = auth.uid()
    )
  );