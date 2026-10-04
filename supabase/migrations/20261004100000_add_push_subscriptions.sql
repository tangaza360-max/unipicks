-- Phone notifications (Web Push), step 1: where each phone's push address lives.
--
-- A browser that allows notifications gives the app a "push subscription":
-- an endpoint URL at the browser's push service (Google, Apple, Mozilla) and
-- two public keys used to encrypt messages for that browser (RFC 8291).
-- Edge Functions (service role) read this table to send alerts.
--
--   * One row per browser (endpoint is unique). If another user logs in on
--     the same phone and turns alerts on, the row moves to that user, so the
--     first user's alerts stop going to a phone they no longer use.
--   * Saving goes only through save_push_subscription() (validates input,
--     max 10 phones per user). Users can see and delete only their own rows.
--   * Deleting an account removes its rows (trigger on the user_roles delete
--     done by tombstone_user_core; the auth user itself is kept as a tombstone,
--     so the foreign key cascade alone would not run).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique
    check (endpoint like 'https://%' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 1 and 200),
  auth text not null check (length(auth) between 1 and 100),
  user_agent text check (length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

revoke all on public.push_subscriptions from anon, authenticated;
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

drop policy if exists users_view_own_push_subscriptions on public.push_subscriptions;
create policy users_view_own_push_subscriptions
  on public.push_subscriptions for select to authenticated
  using (user_id = auth.uid());

drop policy if exists users_delete_own_push_subscriptions on public.push_subscriptions;
create policy users_delete_own_push_subscriptions
  on public.push_subscriptions for delete to authenticated
  using (user_id = auth.uid());

-- Save (or move to the caller) this browser's push subscription.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if p_endpoint is null or p_endpoint not like 'https://%' or length(p_endpoint) > 1000
     or coalesce(length(p_p256dh), 0) not between 1 and 200
     or coalesce(length(p_auth), 0) not between 1 and 100 then
    raise exception 'Invalid push subscription' using errcode = '22023';
  end if;

  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_user, p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
     set user_id = excluded.user_id,
         p256dh = excluded.p256dh,
         auth = excluded.auth,
         user_agent = excluded.user_agent,
         updated_at = now()
  returning id into v_id;

  -- Keep the 10 most recent phones per user (OWASP API4:2023, resource limits).
  delete from public.push_subscriptions
   where user_id = v_user
     and id in (
       select id from public.push_subscriptions
        where user_id = v_user
        order by updated_at desc, id
        offset 10
     );

  return v_id;
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Account deletion: tombstone_user_core deletes the user's role row last.
create or replace function public.delete_push_subscriptions_for_removed_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.push_subscriptions where user_id = old.user_id;
  return old;
end;
$$;

revoke all on function public.delete_push_subscriptions_for_removed_role() from public, anon, authenticated;

drop trigger if exists delete_push_subscriptions_on_role_delete on public.user_roles;
create trigger delete_push_subscriptions_on_role_delete
  after delete on public.user_roles
  for each row execute function public.delete_push_subscriptions_for_removed_role();
