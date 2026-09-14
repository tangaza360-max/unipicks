create table if not exists public.deal_views (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now()
);

create index if not exists deal_views_deal_id_viewed_at_idx
  on public.deal_views (deal_id, viewed_at desc);

create index if not exists deal_views_student_id_viewed_at_idx
  on public.deal_views (student_id, viewed_at desc);

alter table public.deal_views enable row level security;

drop policy if exists "Students can insert their own deal views"
  on public.deal_views;

create policy "Students can insert their own deal views"
  on public.deal_views
  for insert
  to authenticated
  with check (student_id = auth.uid());

revoke all on public.deal_views from anon;
revoke all on public.deal_views from authenticated;

grant insert on public.deal_views to authenticated;

create or replace function public.record_deal_view(p_deal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.deals
    where id = p_deal_id
      and active = true
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.deal_views
    where deal_id = p_deal_id
      and student_id = auth.uid()
      and viewed_at >= now() - interval '30 minutes'
  ) then
    return;
  end if;

  insert into public.deal_views (
    deal_id,
    student_id
  )
  values (
    p_deal_id,
    auth.uid()
  );
end;
$$;

revoke execute on function public.record_deal_view(uuid)
  from public;

grant execute on function public.record_deal_view(uuid)
  to authenticated;
