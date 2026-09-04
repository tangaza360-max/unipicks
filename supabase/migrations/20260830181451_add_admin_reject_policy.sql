create policy "Admins can delete merchant profiles"
  on public.merchant_profiles for delete
  to authenticated
  using ( (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin' );