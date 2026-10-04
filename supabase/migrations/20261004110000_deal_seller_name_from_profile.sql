-- The seller name on a deal always comes from the business profile.
--
-- deals.business_name is a copy shown to students (feed, deal page, payment,
-- receipts). Until now the client chose it: the deal form had a free-text
-- "Business name" box and the AI deal generator saved the placeholder
-- 'Your Business'. In production 2 of Mr. Chips' 4 deals showed "Your
-- Business" as the seller, even on the payment page. A marketplace must name
-- the real seller (Rwanda Law N° 011/2026 on consumer protection; Unipicks is
-- an agent, the food place is the seller), and a free-text box would also let
-- a business label deals with another business's name.
--
--   1. Backfill: every deal takes its business's profile name.
--   2. On insert, or when a deal's merchant or name is changed, the database
--      sets business_name from merchant_profiles (what the client sends is
--      ignored). If the profile has no name yet, the sent name is kept
--      (the column is NOT NULL).
--   3. When a business renames itself in Profile, all its deals follow.

-- 1. Backfill ---------------------------------------------------------------
update public.deals d
   set business_name = trim(mp.business_name)
  from public.merchant_profiles mp
 where mp.id = d.merchant_id
   and nullif(trim(mp.business_name), '') is not null
   and d.business_name is distinct from trim(mp.business_name);

-- 2. Deals take the profile name ---------------------------------------------
create or replace function public.set_deal_business_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  select nullif(trim(business_name), '') into v_name
    from public.merchant_profiles
   where id = new.merchant_id;
  if v_name is not null then
    new.business_name := v_name;
  end if;
  return new;
end;
$$;

revoke all on function public.set_deal_business_name() from public, anon, authenticated;

drop trigger if exists deals_business_name_from_profile on public.deals;
create trigger deals_business_name_from_profile
  before insert or update of business_name, merchant_id on public.deals
  for each row execute function public.set_deal_business_name();

-- 3. A renamed business renames its deals -----------------------------------
create or replace function public.sync_deal_business_names()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(new.business_name), '') is not null then
    update public.deals
       set business_name = trim(new.business_name)
     where merchant_id = new.id
       and business_name is distinct from trim(new.business_name);
  end if;
  return new;
end;
$$;

revoke all on function public.sync_deal_business_names() from public, anon, authenticated;

drop trigger if exists merchant_profiles_sync_deal_names on public.merchant_profiles;
create trigger merchant_profiles_sync_deal_names
  after insert or update of business_name on public.merchant_profiles
  for each row execute function public.sync_deal_business_names();
