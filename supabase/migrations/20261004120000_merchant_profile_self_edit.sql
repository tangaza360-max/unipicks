-- Approved businesses can edit their own profile again (founder decision
-- 2026-10-04, option A).
--
-- Before: the policy "Merchants can update own profile" had
-- WITH CHECK (approved = false), so once a business was approved every save
-- failed with "new row violates row-level security policy". An approved
-- business could not change its phone, address, logo or MoMo pay code.
--
-- After:
--   * a business may update its own row (policy no longer checks approved);
--   * a business can never change its own approval (trigger; admins and the
--     service role still can);
--   * changing the business name or RDB number sends an approved business
--     back to "waiting for approval" (its deals are hidden until an admin
--     approves again, see is_merchant_in_good_standing), and every admin
--     gets a notification. The seller name is shown on every deal, so a
--     rename must not go live unchecked (impersonation).

-- Schema drift: production has these columns (added outside migrations);
-- create them here too so a fresh database matches. No-op in production.
alter table public.merchant_profiles
  add column if not exists phone text,
  add column if not exists address text,
  add column if not exists rdb_number text,
  add column if not exists logo_url text,
  add column if not exists updated_at timestamptz;

drop policy if exists "Merchants can update own profile" on public.merchant_profiles;
create policy "Merchants can update own profile"
  on public.merchant_profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.guard_merchant_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_is_admin boolean;
begin
  -- Service role, migrations and internal functions (no signed-in user).
  if v_actor is null then
    return new;
  end if;

  select exists (select 1 from public.user_roles where user_id = v_actor and role = 'admin')
    into v_is_admin;
  if v_is_admin then
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'A business profile cannot be moved to another account.' using errcode = '42501';
  end if;

  if new.approved is distinct from old.approved then
    raise exception 'Only Unipicks can approve a business.' using errcode = '42501';
  end if;

  if old.approved
     and (nullif(trim(new.business_name), '') is distinct from nullif(trim(old.business_name), '')
          or nullif(trim(new.rdb_number), '') is distinct from nullif(trim(old.rdb_number), '')) then
    new.approved := false;

    insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
    select r.user_id,
           'merchant_reapproval',
           new.id,
           new.id,
           format('%s changed its business name or RDB number and needs approval again (was: %s).',
                  coalesce(nullif(trim(new.business_name), ''), 'A business'),
                  coalesce(nullif(trim(old.business_name), ''), 'no name')),
           '/dashboard/approvals'
      from public.user_roles r
     where r.role = 'admin';
  end if;

  return new;
end;
$$;

revoke all on function public.guard_merchant_profile_update() from public, anon, authenticated;

drop trigger if exists merchant_profiles_guard_update on public.merchant_profiles;
create trigger merchant_profiles_guard_update
  before update on public.merchant_profiles
  for each row execute function public.guard_merchant_profile_update();
