-- Fix 6 (ecosystem audit J2/J8): banning or deactivating a merchant must
-- actually stop them.
--
-- Before: a ban (app_metadata.banned) was not checked by deal writes, order
-- acceptance or pickup-code redemption, and deactivation (approved = false)
-- only blocked new deal writes. Both kinds of merchant stayed visible in the
-- deals feed and could still be ordered from.
--
-- After:
--   * deals are publicly visible only while their merchant is approved, not
--     banned and not deleted; a merchant still sees their own deals;
--   * a banned user can't create or edit deals, or redeem pickup codes
--     (same reject_if_banned trigger as P4; service-role writes unaffected);
--   * create-order / create-group-order-payment refuse merchants who are not
--     in good standing, and update-order-status refuses "accept" from them
--     (Edge Function changes in the same commit).

create or replace function public.is_merchant_in_good_standing(p_merchant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.merchant_profiles m
      join auth.users u on u.id = m.id
     where m.id = p_merchant_id
       and m.approved
       and coalesce(lower(u.raw_app_meta_data ->> 'banned'), 'false') <> 'true'
       and not (u.raw_app_meta_data ? 'deleted_at')
  )
$$;

revoke all on function public.is_merchant_in_good_standing(uuid) from public;
grant execute on function public.is_merchant_in_good_standing(uuid) to anon, authenticated, service_role;

-- Deal visibility (replaces the two identical "active = true" policies from
-- the original remote schema).
drop policy if exists "Anyone can view active deals" on public.deals;
drop policy if exists "Public active deals select" on public.deals;
drop policy if exists deals_public_select on public.deals;
create policy deals_public_select on public.deals
  for select
  using (active = true and public.is_merchant_in_good_standing(merchant_id));

drop policy if exists deals_merchant_select_own on public.deals;
create policy deals_merchant_select_own on public.deals
  for select to authenticated
  using (merchant_id = auth.uid());

-- Banned merchants can't create or edit deals.
drop trigger if exists reject_banned_deals on public.deals;
create trigger reject_banned_deals
before insert or update on public.deals
for each row execute function public.reject_if_banned();

-- Banned merchants can't redeem pickup codes (redeem_pickup_code runs as its
-- definer, but auth.uid() is still the calling merchant).
drop trigger if exists reject_banned_redemption on public.redemptions;
create trigger reject_banned_redemption
before update of status on public.redemptions
for each row
when (new.status = 'redeemed' and old.status is distinct from 'redeemed')
execute function public.reject_if_banned();
