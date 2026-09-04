create table if not exists public.group_orders (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references public.deals(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  host_name text,
  join_code text not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.group_order_members (
  id uuid primary key default gen_random_uuid(),
  group_order_id uuid not null references public.group_orders(id) on delete cascade,
  student_id uuid not null references auth.users(id),
  student_name text,
  item_note text,
  joined_at timestamptz not null default now(),
  unique (group_order_id, student_id)
);

alter table public.group_orders enable row level security;
alter table public.group_order_members enable row level security;

create policy "Anyone signed in can view group orders"
  on public.group_orders for select
  to authenticated
  using (true);

create policy "Students can create group orders"
  on public.group_orders for insert
  to authenticated
  with check (created_by = auth.uid());

create policy "Anyone signed in can view group order members"
  on public.group_order_members for select
  to authenticated
  using (true);

create policy "Students can join group orders"
  on public.group_order_members for insert
  to authenticated
  with check (student_id = auth.uid());