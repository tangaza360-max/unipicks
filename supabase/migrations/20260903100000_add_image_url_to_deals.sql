alter table public.deals
  add column if not exists image_url text;

-- Merchants may create and manage only deals that belong to their account.
drop policy if exists "Merchants can insert own deals" on public.deals;
create policy "Merchants can insert own deals"
  on public.deals
  for insert
  to authenticated
  with check (merchant_id = auth.uid());

drop policy if exists "Merchants can update own deals" on public.deals;
create policy "Merchants can update own deals"
  on public.deals
  for update
  to authenticated
  using (merchant_id = auth.uid())
  with check (merchant_id = auth.uid());
