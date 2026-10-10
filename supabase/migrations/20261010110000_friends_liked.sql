-- "Fred M and 2 other friends liked this" and comment counts on feed cards
-- (founder request 2026-10-10).
--
-- get_deals_social(ids) gets three more columns, still one request for the
-- whole feed:
--   friend_like_count  how many of my friends liked the deal
--   friend_name        the display name of the friend who liked it last
--   comment_count      how many comments the deal has
-- Friends are rows in friendships. Anyone blocked either way is never counted
-- or named. Only students have friends; for others the friend columns are 0
-- and null. The return type changes, so the function is dropped and made
-- again (same rules as 20261009140000: definer, empty search path, max 200,
-- live deals of businesses in good standing, signed-in only).

drop function if exists public.get_deals_social(uuid[]);

create function public.get_deals_social(p_deal_ids uuid[])
returns table (
  deal_id uuid, like_count bigint, liked_by_me boolean, saved_by_me boolean,
  friend_like_count bigint, friend_name text, comment_count bigint
)
language plpgsql
stable
security definer -- counts include other students' likes and comments, which RLS hides
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_deal_ids), 0) > 200 then
    raise exception 'Ask for at most 200 deals at a time.';
  end if;

  return query
    with my_friends as (
      select case when f.student_a = auth.uid() then f.student_b else f.student_a end as friend_id
        from public.friendships f
       where auth.uid() in (f.student_a, f.student_b)
    ),
    visible_friends as (
      select mf.friend_id
        from my_friends mf
       where not exists (
               select 1 from public.blocked_students b
                where (b.blocker_id = auth.uid() and b.blocked_id = mf.friend_id)
                   or (b.blocker_id = mf.friend_id and b.blocked_id = auth.uid()))
    )
    select d.id,
           (select count(*) from public.deal_likes l where l.deal_id = d.id),
           exists (select 1 from public.deal_likes l where l.deal_id = d.id and l.student_id = auth.uid()),
           exists (select 1 from public.student_saved_items s
                    where s.item_type = 'deal' and s.item_id = d.id and s.student_id = auth.uid()),
           (select count(*) from public.deal_likes l join visible_friends vf on vf.friend_id = l.student_id
             where l.deal_id = d.id),
           (select sp.display_name
              from public.deal_likes l
              join visible_friends vf on vf.friend_id = l.student_id
              join public.student_profiles sp on sp.user_id = l.student_id
             where l.deal_id = d.id
             order by l.created_at desc
             limit 1),
           (select count(*) from public.deal_comments c where c.deal_id = d.id)
      from public.deals d
     where d.id = any (p_deal_ids)
       and d.active
       and public.is_merchant_in_good_standing(d.merchant_id);
end;
$$;

revoke all on function public.get_deals_social(uuid[]) from public, anon;
grant execute on function public.get_deals_social(uuid[]) to authenticated;
