create table if not exists public.merchant_profiles (
  id uuid primary key references auth.users(id),
  business_name text,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.merchant_profiles enable row level security;

create policy "Merchants can view own profile"
  on public.merchant_profiles for select
  to authenticated
  using (id = auth.uid());

create policy "Merchants can insert own profile"
  on public.merchant_profiles for insert
  to authenticated
  with check (id = auth.uid());

create policy "Admins can view all merchant profiles"
  on public.merchant_profiles for select
  to authenticated
  using (
    (select raw_user_meta_data ->> 'role' from auth.users where id = auth.uid()) = 'admin'
  );

create policy "Admins can update merchant profiles"
  on public.merchant_profiles for update
  to authenticated
  using (
    (select raw_user_meta_data ->> 'role' from auth.users where id = auth.uid()) = 'admin'
  );