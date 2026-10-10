-- Who may see what about a business (founder decision 2026-10-10).
--
--   Visitors and other businesses: name and logo of approved businesses only.
--   Active students (role student, not banned): also phone and address.
--   The business itself and admins: everything (existing table rules).
--   Pending or deactivated businesses: only themselves and admins.
--   RDB number and MoMo pay code: only the business and admins — plus the
--   seller's name, address and RDB number on a student's own receipt.
--
-- Production had an extra rule, "Anyone can view merchant profiles"
-- (select for everyone, even signed-out visitors), that is not in any
-- migration: it exposed every column of every business, pending ones
-- included. It is removed here; the app reads other businesses through the
-- two functions below instead.

drop policy if exists "Anyone can view merchant profiles" on public.merchant_profiles;

-- Name and logo for everyone; phone and address only for active students and
-- admins. Approved businesses in good standing only. p_ids null = all.
create or replace function public.get_businesses(p_ids uuid[] default null)
returns table (id uuid, business_name text, logo_url text, phone text, address text)
language sql
stable
security definer
set search_path = ''
as $$
  with viewer as (
    select coalesce(public.can_post_student_story(), false)
        or coalesce((select private.is_admin()), false) as sees_contacts
  )
  select mp.id,
         mp.business_name,
         mp.logo_url,
         case when viewer.sees_contacts then mp.phone end,
         case when viewer.sees_contacts then mp.address end
  from public.merchant_profiles mp, viewer
  where mp.approved
    and public.is_merchant_in_good_standing(mp.id)
    and (p_ids is null or mp.id = any (p_ids))
  order by mp.business_name
  limit 500
$$;

revoke all on function public.get_businesses(uuid[]) from public;
grant execute on function public.get_businesses(uuid[]) to anon, authenticated;

-- The seller on a receipt: only for the order's student, its business, or an
-- admin. Receipts name the seller and its registration number.
create or replace function public.get_receipt_seller(p_order_id uuid)
returns table (business_name text, address text, rdb_number text)
language sql
stable
security definer
set search_path = ''
as $$
  select mp.business_name, mp.address, mp.rdb_number
  from public.orders o
  join public.merchant_profiles mp on mp.id = o.merchant_id
  where o.id = p_order_id
    and (o.student_id = (select auth.uid())
         or o.merchant_id = (select auth.uid())
         or coalesce((select private.is_admin()), false))
$$;

revoke all on function public.get_receipt_seller(uuid) from public, anon;
grant execute on function public.get_receipt_seller(uuid) to authenticated;

-- Search → Businesses: the address only for active students and admins, and
-- no longer the owner's personal name (not shown, not searchable). Same
-- columns as before so the app keeps working; full_name is always ''.
create or replace function public.search_merchants(search_query text)
returns table (user_id uuid, business_name text, full_name text, address text)
language plpgsql
stable
security definer
set search_path = auth, public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_query text;
  sees_contacts boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  normalized_query := lower(regexp_replace(coalesce(trim(search_query), ''), '[\s._-]+', '', 'g'));
  if normalized_query = '' then
    return;
  end if;

  sees_contacts := coalesce(public.can_post_student_story(), false) or coalesce(private.is_admin(), false);

  return query
  select
    u.id,
    coalesce((u.raw_user_meta_data->>'business_name')::text, '') as business_name,
    ''::text as full_name,
    case when sees_contacts then coalesce((u.raw_user_meta_data->>'address')::text, '') else '' end as address
  from auth.users u
  inner join public.user_roles ur on ur.user_id = u.id and ur.role = 'merchant'
  left join public.merchant_profiles mp on mp.id = u.id
  where coalesce(mp.approved, false) = true
    and u.id <> current_user_id
    and lower(regexp_replace(coalesce(u.raw_user_meta_data->>'business_name', ''), '[\s._-]+', '', 'g')) like '%' || normalized_query || '%'
  order by coalesce((u.raw_user_meta_data->>'business_name')::text, '') asc
  limit 50;
end;
$$;

revoke all on function public.search_merchants(text) from public, anon;
grant execute on function public.search_merchants(text) to authenticated;
