#!/usr/bin/env bash
# Local Postgres test for migration 20261004110000_deal_seller_name_from_profile.
# Builds the schema from EVERY migration (same stubs as delete_account.test.sh),
# then checks that a deal's seller name always comes from the business profile:
# backfill of placeholder names, insert and edit ignore the client's name, a
# profile rename updates all deals, other businesses are untouched.
#
# Usage: bash supabase/tests/deal_seller_name.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/seller-name-test.XXXXXX)"
PORT="${PGPORT_TEST:-54338}"
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
NEW=20261004110000_deal_seller_name_from_profile.sql
for f in "$REPO"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$NEW" ] && continue
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; PASS=$((PASS+1)); else echo "  FAIL $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }

M1=00000000-0000-0000-0000-0000000000b1   # Mr. Chips
M2=00000000-0000-0000-0000-0000000000b2   # another business
q "insert into auth.users (id, email, raw_user_meta_data) values
  ('$M1','chips@x.rw','{\"role\":\"merchant\",\"business_name\":\"Mr. Chips\"}'),
  ('$M2','cafe@x.rw','{\"role\":\"merchant\",\"business_name\":\"Campus Cafe\"}');
  update public.merchant_profiles set approved = true;"
check "profiles created by the signup trigger" "$(q "select string_agg(business_name, ',' order by business_name) from public.merchant_profiles")" "Campus Cafe,Mr. Chips"

# Production state before the fix: placeholder and wrong names on deals.
q "insert into public.deals (id, merchant_id, business_name, title) values
  ('00000000-0000-0000-0000-00000000d001','$M1','Your Business','Burger Thursday'),
  ('00000000-0000-0000-0000-00000000d002','$M1','Mr. Chips','After Class Thursday'),
  ('00000000-0000-0000-0000-00000000d003','$M2','Your Business','Cafe deal');"

echo "Backfill"
"${PSQL[@]}" -f "$REPO/supabase/migrations/$NEW" >/dev/null 2>&1
check "placeholder replaced by the real name" "$(q "select business_name from public.deals where id='00000000-0000-0000-0000-00000000d001'")" "Mr. Chips"
check "each business gets its own name" "$(q "select business_name from public.deals where id='00000000-0000-0000-0000-00000000d003'")" "Campus Cafe"
check "no deal says 'Your Business' any more" "$(q "select count(*) from public.deals where business_name = 'Your Business'")" "0"

echo "New and edited deals (as the business itself, through RLS)"
as_user $M1 "insert into public.deals (merchant_id, business_name, title, active) values ('$M1','Your Business','AI deal', true);" >/dev/null
check "insert with placeholder → profile name" "$(q "select business_name from public.deals where title='AI deal'")" "Mr. Chips"
as_user $M1 "insert into public.deals (merchant_id, business_name, title, active) values ('$M1','KFC','Fake brand', true);" >/dev/null
check "insert with another brand's name → profile name" "$(q "select business_name from public.deals where title='Fake brand'")" "Mr. Chips"
as_user $M1 "update public.deals set business_name='Pizza Hut' where id='00000000-0000-0000-0000-00000000d002';" >/dev/null
check "editing the name on a deal is ignored" "$(q "select business_name from public.deals where id='00000000-0000-0000-0000-00000000d002'")" "Mr. Chips"
as_user $M1 "update public.deals set active=false where id='00000000-0000-0000-0000-00000000d002';" >/dev/null
check "pausing a deal still works" "$(q "select active from public.deals where id='00000000-0000-0000-0000-00000000d002'")" "f"

echo "Business is renamed"
# As the service role: today an approved business cannot update its own
# profile (policy "Merchants can update own profile" requires approved = false;
# reported separately). The trigger is what is tested here.
as_user '' "update public.merchant_profiles set business_name='Mr. Chips Kigali' where id='$M1';" >/dev/null
check "profile renamed" "$(q "select business_name from public.merchant_profiles where id='$M1'")" "Mr. Chips Kigali"
check "all 4 of its deals follow" "$(q "select count(*) from public.deals where merchant_id='$M1' and business_name='Mr. Chips Kigali'")" "4"
check "the other business is untouched" "$(q "select business_name from public.deals where merchant_id='$M2'")" "Campus Cafe"

echo "Profile without a name"
q "update public.merchant_profiles set business_name=null where id='$M2'"
check "clearing the profile name keeps the deals' names" "$(q "select business_name from public.deals where merchant_id='$M2'")" "Campus Cafe"
as_user $M2 "insert into public.deals (merchant_id, business_name, title, active) values ('$M2','Campus Cafe Two','No-profile deal', true);" >/dev/null
check "no profile name → the sent name is kept (column is required)" "$(q "select business_name from public.deals where title='No-profile deal'")" "Campus Cafe Two"

echo "Permissions"
check "clients cannot call the trigger functions" "$(as_user $M1 "select public.sync_deal_business_names();")" "permission denied for function sync_deal_business_names"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
