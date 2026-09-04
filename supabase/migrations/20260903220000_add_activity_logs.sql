create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  admin_name text,
  action text not null,
  target_type text not null,
  target_id uuid,
  target_name text,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

alter table public.activity_logs enable row level security;
drop policy if exists "Admins can view activity logs" on public.activity_logs;
create policy "Admins can view activity logs"
  on public.activity_logs for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

drop policy if exists "System can insert activity logs" on public.activity_logs;
create policy "System can insert activity logs"
  on public.activity_logs for insert to service_role
  with check (true);

create or replace function public.log_admin_action(
  action text,
  target_type text,
  target_id uuid default null,
  target_name text default null,
  details jsonb default '{}'::jsonb
)
returns public.activity_logs
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_data auth.users;
  result public.activity_logs;
begin
  select * into current_user_data from auth.users where id = auth.uid();
  if current_user_data.id is null or current_user_data.raw_user_meta_data ->> 'role' <> 'admin' then
    raise exception 'Only admins can create activity logs';
  end if;

  insert into public.activity_logs (admin_id, admin_email, admin_name, action, target_type, target_id, target_name, details)
  values (
    current_user_data.id,
    current_user_data.email,
    current_user_data.raw_user_meta_data ->> 'full_name',
    action,
    target_type,
    target_id,
    target_name,
    coalesce(details, '{}'::jsonb)
  ) returning * into result;
  return result;
end;
$$;

revoke all on function public.log_admin_action(text, text, uuid, text, jsonb) from public;
grant execute on function public.log_admin_action(text, text, uuid, text, jsonb) to authenticated;
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at desc);
create index if not exists idx_activity_logs_action on public.activity_logs(action);
create index if not exists idx_activity_logs_target_type on public.activity_logs(target_type);
