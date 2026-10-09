#!/usr/bin/env bash
# Local Postgres test for migration 20261009130000_deal_rating_stats_many.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks that the home feed gets every deal's stars in one call.
#
# Usage: bash supabase/tests/deal_rating_stats.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/deal-ratings-test.XXXXXX)"
PORT="${PGPORT_TEST:-54357}"
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

for f in "$REPO"/supabase/migrations/*.sql; do
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done

A=00000000-0000-0000-0000-0000000000a1      # student
M=00000000-0000-0000-0000-0000000000b1      # business
D1=10000000-0000-4000-8000-000000000001     # 3 ratings: 5, 4, 4
D2=10000000-0000-4000-8000-000000000002     # 1 rating: 2
D3=10000000-0000-4000-8000-000000000003     # no ratings
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}');
-- Ratings need a redemption; skip foreign keys and triggers for this setup only.
set session_replication_role = replica;
insert into public.ratings (deal_id, merchant_id, student_id, redemption_id, rating) values
 ('$D1','$M','$A',gen_random_uuid(),5), ('$D1','$M','$A',gen_random_uuid(),4), ('$D1','$M','$A',gen_random_uuid(),4),
 ('$D2','$M','$A',gen_random_uuid(),2);
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
many() { as_user "$1" "select string_agg(deal_id || ' ' || average_rating || ' ' || review_count, ',' order by deal_id) from public.get_deals_rating_stats($2);"; }

echo "deal_rating_stats tests"
check "one call returns every rated deal (average, count)" "$(many $A "array['$D1','$D2','$D3']::uuid[]")" "$D1 4.3 3,$D2 2.0 1"
check "same numbers as the one-deal function" "$(as_user $A "select average_rating || ' ' || review_count from public.get_deal_rating_stats('$D1');")" "4.3 3"
check "deal without ratings: no row" "$(many $A "array['$D3']::uuid[]")" ""
check "empty list: no rows, no error" "$(many $A "array[]::uuid[]")" ""
check "visitors (anon) can read stars too, like the one-deal function" "$("${PSQL[@]}" -At -c "set role anon; select count(*) from public.get_deals_rating_stats(array['$D1','$D2']::uuid[]);")" "2"
check "more than 200 deals refused" "$(as_user $A "select count(*) from public.get_deals_rating_stats(array(select gen_random_uuid() from generate_series(1,201)));")" "Ask for at most 200 deals at a time."
check "200 deals accepted" "$(as_user $A "select count(*) from public.get_deals_rating_stats(array(select gen_random_uuid() from generate_series(1,200)));")" "0"
check "runs with an empty search path (no hijacking)" "$(q "select array_to_string(proconfig, ',') from pg_proc where proname = 'get_deals_rating_stats'")" 'search_path=""'
check "security invoker (ratings rules still apply)" "$(q "select prosecdef from pg_proc where proname = 'get_deals_rating_stats'")" "f"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
