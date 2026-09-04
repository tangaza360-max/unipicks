drop policy if exists "Admins can view all merchant profiles" on public.merchant_profiles;
drop policy if exists "Admins can update merchant profiles" on public.merchant_profiles;

create policy "Admins can view all merchant profiles"
  on public.merchant_profiles for select
  to authenticated
  using ( (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' );

create policy "Admins can update merchant profiles"
  on public.merchant_profiles for update
  to authenticated
  using ( (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' );