create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references public.deals(id) on delete set null,
  merchant_id uuid references auth.users(id) on delete set null,
  student_id uuid not null references auth.users(id) on delete cascade,
  redemption_id uuid not null unique references public.redemptions(id) on delete cascade,
  rating integer not null check (rating between 1 and 5),
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ratings enable row level security;

drop policy if exists "Anyone can view ratings" on public.ratings;
create policy "Anyone can view ratings"
  on public.ratings for select to public using (true);

drop policy if exists "Students can insert ratings after redemption" on public.ratings;
create policy "Students can insert ratings after redemption"
  on public.ratings for insert to authenticated
  with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.redemptions redemption
      where redemption.id = redemption_id
        and redemption.student_id = auth.uid()
        and redemption.deal_id = ratings.deal_id
        and redemption.status = 'redeemed'
    )
  );

drop policy if exists "Students can update recent ratings" on public.ratings;
create policy "Students can update recent ratings"
  on public.ratings for update to authenticated
  using (student_id = auth.uid() and created_at > now() - interval '24 hours')
  with check (student_id = auth.uid());

drop policy if exists "Admins can delete ratings" on public.ratings;
create policy "Admins can delete ratings"
  on public.ratings for delete to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create or replace function public.set_rating_updated_at()
returns trigger language plpgsql set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ratings_updated_at on public.ratings;
create trigger ratings_updated_at before update on public.ratings
for each row execute function public.set_rating_updated_at();

create or replace function public.get_deal_rating_stats(target_deal_id uuid)
returns table (average_rating numeric, review_count bigint)
language sql stable security invoker set search_path = public
as $$
  select coalesce(round(avg(rating)::numeric, 1), 0), count(*)
  from public.ratings
  where deal_id = target_deal_id;
$$;

grant execute on function public.get_deal_rating_stats(uuid) to anon, authenticated;
create index if not exists idx_ratings_deal_id on public.ratings(deal_id);
create index if not exists idx_ratings_merchant_id on public.ratings(merchant_id);
create index if not exists idx_ratings_created_at on public.ratings(created_at desc);
