-- Star ratings for many deals in one request (home feed).
--
-- The feed used to call get_deal_rating_stats once per deal, one after the
-- other, and showed nothing until every call was back (30 deals = 30 trips
-- on a phone connection). This returns one row per deal that has ratings;
-- deals without a row have no ratings yet.
--
-- Same rule as get_deal_rating_stats: ratings are public ("Anyone can view
-- ratings"), so security invoker; RLS still applies.
create or replace function public.get_deals_rating_stats(p_deal_ids uuid[])
returns table (deal_id uuid, average_rating numeric, review_count bigint)
language plpgsql stable security invoker set search_path = ''
as $$
begin
  if coalesce(cardinality(p_deal_ids), 0) > 200 then
    raise exception 'Ask for at most 200 deals at a time.';
  end if;

  return query
    select r.deal_id, round(avg(r.rating)::numeric, 1), count(*)
      from public.ratings r
     where r.deal_id = any (p_deal_ids)
     group by r.deal_id;
end;
$$;

revoke all on function public.get_deals_rating_stats(uuid[]) from public;
grant execute on function public.get_deals_rating_stats(uuid[]) to anon, authenticated;
