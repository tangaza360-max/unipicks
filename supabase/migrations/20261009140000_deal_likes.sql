-- Likes on deals (Instagram-style ❤️) and the numbers the feed shows.
--
-- * deal_likes: one row per student per deal. Only active students (not
--   banned, students only) can like, and only live deals. A student can see
--   and remove only their own likes; other people see just the count.
-- * Linked to user_roles with "on delete cascade": deleting an account
--   removes the role row (tombstone_user_core), so the likes go with it
--   (right to erasure) without changing the deletion function again.
-- * get_deals_social(ids): for each deal, how many likes, and whether I
--   liked / saved it. One request for the whole feed (max 200).
-- Saves use the existing student_saved_items table (owner-only rule).

create table if not exists public.deal_likes (
  student_id uuid not null references public.user_roles(user_id) on delete cascade,
  deal_id uuid not null references public.deals(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (student_id, deal_id)
);

create index if not exists deal_likes_deal_id_idx on public.deal_likes (deal_id);

alter table public.deal_likes enable row level security;

revoke all on public.deal_likes from anon, authenticated;
grant select, insert, delete on public.deal_likes to authenticated;

drop policy if exists "Students see their own likes" on public.deal_likes;
create policy "Students see their own likes"
  on public.deal_likes for select to authenticated
  using (student_id = (select auth.uid()));

-- can_post_student_story() = signed in, role student, not banned. The deal
-- check runs under the deals rules, so it must also be visible to the student
-- (live, from an approved business in good standing).
drop policy if exists "Active students like live deals" on public.deal_likes;
create policy "Active students like live deals"
  on public.deal_likes for insert to authenticated
  with check (
    student_id = (select auth.uid())
    and (select public.can_post_student_story())
    and exists (select 1 from public.deals d where d.id = deal_id and d.active)
  );

drop policy if exists "Students remove their own likes" on public.deal_likes;
create policy "Students remove their own likes"
  on public.deal_likes for delete to authenticated
  using (student_id = (select auth.uid()));

create or replace function public.get_deals_social(p_deal_ids uuid[])
returns table (deal_id uuid, like_count bigint, liked_by_me boolean, saved_by_me boolean)
language plpgsql
stable
security definer -- counts include other students' likes, which RLS hides
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_deal_ids), 0) > 200 then
    raise exception 'Ask for at most 200 deals at a time.';
  end if;

  return query
    select d.id,
           (select count(*) from public.deal_likes l where l.deal_id = d.id),
           exists (select 1 from public.deal_likes l where l.deal_id = d.id and l.student_id = auth.uid()),
           exists (select 1 from public.student_saved_items s
                    where s.item_type = 'deal' and s.item_id = d.id and s.student_id = auth.uid())
      from public.deals d
     where d.id = any (p_deal_ids)
       and d.active
       and public.is_merchant_in_good_standing(d.merchant_id); -- same as who may see the deal
end;
$$;

revoke all on function public.get_deals_social(uuid[]) from public, anon;
grant execute on function public.get_deals_social(uuid[]) to authenticated;
