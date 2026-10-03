-- UNIPICKS SEARCH
-- Allows any authenticated user (student, merchant) to search approved merchants by name

create or replace function public.search_merchants(
  search_query text
)
returns table (
  user_id uuid,
  business_name text,
  full_name text,
  address text
)
language plpgsql
security definer
set search_path = auth, public, pg_temp
stable
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_query text;
begin
  if current_user_id is null then
    raise exception 'Authentication required';
  end if;

  normalized_query := lower(
    regexp_replace(
      coalesce(trim(search_query), ''),
      '[\s._-]+',
      '',
      'g'
    )
  );

  -- Empty searches return nothing
  if normalized_query = '' then
    return;
  end if;

  return query
  select
    u.id,
    coalesce((u.raw_user_meta_data->>'business_name')::text, '') as business_name,
    coalesce((u.raw_user_meta_data->>'full_name')::text, '') as full_name,
    coalesce((u.raw_user_meta_data->>'address')::text, '') as address
  from auth.users u
  inner join public.user_roles ur on ur.user_id = u.id and ur.role = 'merchant'
  left join public.merchant_profiles mp on mp.id = u.id
  where coalesce(mp.approved, false) = true
    and u.id <> current_user_id
    and (
      lower(regexp_replace(coalesce(u.raw_user_meta_data->>'business_name', ''), '[\s._-]+', '', 'g')) like '%' || normalized_query || '%'
      or lower(regexp_replace(coalesce(u.raw_user_meta_data->>'full_name', ''), '[\s._-]+', '', 'g')) like '%' || normalized_query || '%'
    )
  order by coalesce((u.raw_user_meta_data->>'business_name')::text, '') asc
  limit 50;
end;
$$;

revoke all on function public.search_merchants(text) from public;
grant execute on function public.search_merchants(text) to authenticated;
