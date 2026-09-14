create table if not exists public.deal_searches (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  search_query text not null,
  searched_at timestamptz not null default now()
);

create index if not exists deal_searches_student_id_searched_at_idx
  on public.deal_searches (student_id, searched_at desc);

create index if not exists deal_searches_query_searched_at_idx
  on public.deal_searches (search_query, searched_at desc);

alter table public.deal_searches enable row level security;

revoke all on public.deal_searches from anon;
revoke all on public.deal_searches from authenticated;

create or replace function public.record_deal_search(p_search_query text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cleaned_query text;
begin
  if auth.uid() is null then
    return;
  end if;

  cleaned_query := lower(trim(p_search_query));

  if cleaned_query = '' or char_length(cleaned_query) > 100 then
    return;
  end if;

  insert into public.deal_searches (
    student_id,
    search_query
  )
  values (
    auth.uid(),
    cleaned_query
  );
end;
$$;

revoke execute on function public.record_deal_search(text)
  from public;

grant execute on function public.record_deal_search(text)
  to authenticated;
