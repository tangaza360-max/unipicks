#!/usr/bin/env bash
# Local Postgres test for migration 20261006100000_capture_private_schema.
# Builds the database from every migration and checks that it now matches
# production: the private schema, its 18 functions, the public wrappers that
# forward to them, the grants, the removed dead copies, and the friend /
# message flow end to end (the path that broke on 2026-10-06).
#
# Usage: bash supabase/tests/private_schema.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/private-schema-test.XXXXXX)"
PORT="${PGPORT_TEST:-54344}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }
as_user() { # $1 user id ('' = service role), $2 SQL → ERROR line or last result line
  local role=authenticated; [ -z "$1" ] && role=service_role
  local out
  out=$({ "${PSQL[@]}" -At 2>&1 || true; } <<SQL
set role $role;
select set_config('request.jwt.claim.sub', '$1', false) \\gset
$2
SQL
)
  if echo "$out" | grep -q 'ERROR:'; then echo "$out" | grep 'ERROR:' | head -1 | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//'
  else echo "$out" | grep -vE '^$|^SET$' | tail -1 || true; fi
}

# --- Stubbed Supabase internals (auth, storage, realtime) -------------------------
"${PSQL[@]}" <<'SQL' 2>/dev/null
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth; create schema storage;
create table auth.users (id uuid primary key, email varchar(255), phone text, encrypted_password varchar(255),
  banned_until timestamptz, email_confirmed_at timestamptz, created_at timestamptz default now(),
  updated_at timestamptz default now(), raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb, is_sso_user boolean not null default false,
  -- Newer GoTrue columns, as on the hosted project (GoTrue writes '' into the tokens).
  instance_id uuid, aud varchar(255), role varchar(255), confirmation_token varchar(255), confirmation_sent_at timestamptz,
  recovery_token varchar(255), email_change_token_new varchar(255), email_change varchar(255),
  email_change_token_current varchar(255) default '', email_change_confirm_status smallint default 0
    check (email_change_confirm_status >= 0 and email_change_confirm_status <= 2),
  phone_change text default '', phone_change_token varchar(255) default '', reauthentication_token varchar(255) default '',
  last_sign_in_at timestamptz, is_anonymous boolean not null default false);
create unique index users_email_partial_key on auth.users (email) where is_sso_user = false;
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text, identity_data jsonb);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), session_id uuid references auth.sessions(id) on delete cascade, token text);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table auth.one_time_tokens (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, token_type text, token_hash text not null);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
create function auth.role() returns text language sql stable as $$ select 'authenticated'::text $$;
create table storage.buckets (id text primary key, name text, public boolean);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create publication supabase_realtime;
grant usage on schema auth, public, storage to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
SQL

# --- Every migration, in order (MAINTAIN is a Postgres 17 privilege; local is 16) -
for f in "$REPO"/supabase/migrations/*.sql; do
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done

A=00000000-0000-0000-0000-0000000000a1
B=00000000-0000-0000-0000-0000000000a2
AD=00000000-0000-0000-0000-0000000000d1
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$B','b@keplercollege.ac.rw','{"role":"student"}'), ('$AD','ad@unipicks.app','{}');
update public.user_roles set role = 'admin' where user_id = '$AD';
insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus)
values ('$A','aline','Aline U','Kepler College','Kigali',true), ('$B','fred','Fred M','Kepler College','Kigali',true);
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }

echo "shape (same as production)"
check "private schema has the 18 functions" "$(q "select count(*) from pg_proc where pronamespace='private'::regnamespace")" "18"
check "old private group copies removed" "$(q "select count(*) from pg_proc where pronamespace='private'::regnamespace and proname in ('create_group_order_with_host','find_open_group_order_by_code')")" "0"
check "public group functions still full versions" "$(q "select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('create_group_order_with_host','find_open_group_order_by_code') and strpos(prosrc,'private.')=0")" "2"
check "18 public wrappers forward to private" "$(q "select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and strpos(p.prosrc,'private.'||p.proname||'(')>0")" "18"
check "nothing still uses the old table name" "$(q "select count(*) from pg_proc where strpos(prosrc,'public.social_notifications')>0")" "0"
check "anon can't run them, signed-in users can" "$(q "select bool_or(has_function_privilege('anon',oid,'execute'))::text||'|'||bool_and(has_function_privilege('authenticated',oid,'execute'))::text from pg_proc where pronamespace='private'::regnamespace")" "false|true"
check "only signed-in users may use the private schema" "$(q "select has_schema_privilege('anon','private','usage')::text||'|'||has_schema_privilege('authenticated','private','usage')::text")" "false|true"

echo "friend and message flow (the path that broke)"
REQ=$(as_user $A "select public.send_friend_request('$B');")
check "Aline sends Fred a friend request" "${#REQ}" "36"
check "Fred is notified" "$(q "select type||'|'||message from public.user_notifications where user_id='$B' and type='friend_request'")" "friend_request|You have a new friend request."
check "Fred sees it in Social → Activity" "$(as_user $B "select json_array_length(public.get_social_activity()->'friend_requests');")" "1"
check "Fred accepts" "$(as_user $B "select public.accept_friend_request('$REQ');")" "t"
check "they are friends; Aline is notified" "$(q "select (select count(*) from public.friendships)||'|'||(select count(*) from public.user_notifications where user_id='$A' and type='friend_request_accepted')")" "1|1"
check "a second request says already friends" "$(as_user $A "select public.send_friend_request('$B');")" "You are already friends"
check "search finds Fred" "$(as_user $A "select username from public.search_students('fre');")" "fred"
check "block removes the friendship" "$(as_user $A "select public.block_student('$B');")|$(q "select count(*) from public.friendships")" "t|0"
check "blocked: message request refused" "$(as_user $B "select public.send_message_request('$A');")" "You cannot message this student"
check "is_admin through the wrapper" "$(as_user $AD "select public.is_admin();")|$(as_user $A "select public.is_admin();")" "t|f"
check "get_my_role through the wrapper" "$(as_user $A "select public.get_my_role();")" "student"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
