#!/usr/bin/env bash
# Local Postgres test for migration 20261009140000_deal_likes.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks who can like a deal, what others can see, and the feed numbers.
#
# Usage: bash supabase/tests/deal_likes.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/deal-likes-test.XXXXXX)"
PORT="${PGPORT_TEST:-54358}"
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


A=00000000-0000-0000-0000-0000000000a1      # Aline, student
F=00000000-0000-0000-0000-0000000000a2      # Fred, student
BAN=00000000-0000-0000-0000-0000000000a5    # banned student
M=00000000-0000-0000-0000-0000000000b1      # business
D=10000000-0000-4000-8000-000000000001      # live deal
OFF=10000000-0000-4000-8000-000000000002    # switched-off deal
N=00000000-0000-0000-0000-0000000000b2      # business not approved yet
ND=10000000-0000-4000-8000-000000000003     # live deal of the unapproved business
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$F','f@keplercollege.ac.rw','{"role":"student"}'),
 ('$BAN','b@keplercollege.ac.rw','{"role":"student"}'), ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}'),
 ('$N','n@shop.rw','{"role":"merchant","business_name":"New Shop"}');
insert into public.merchant_profiles (id, business_name, approved) values ('$M','Mama Rose',true), ('$N','New Shop',false)
  on conflict (id) do update set approved = excluded.approved;
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"banned": true}' where id = '$BAN';
insert into public.deals (id, merchant_id, business_name, title, active, price) values
 ('$D','$M','Mama Rose','Rolex',true,1500), ('$OFF','$M','Mama Rose','Old deal',false,1000), ('$ND','$N','New Shop','Chapati',true,500);
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
like() { as_user "$1" "insert into public.deal_likes (student_id, deal_id) values ('${3:-$1}', '$2') returning 1;"; }
social() { as_user "$1" "select string_agg(like_count || ' ' || liked_by_me || ' ' || saved_by_me, ',' order by deal_id) from public.get_deals_social(array['$D','$OFF','$ND']::uuid[]);"; }
RLS='new row violates row-level security policy for table "deal_likes"'

echo "deal_likes tests"
echo " liking"
check "student likes a live deal" "$(like $A $D)" "1"
check "same student can't like twice" "$(like $A $D)" 'duplicate key value violates unique constraint "deal_likes_pkey"'
check "another student likes it too" "$(like $F $D)" "1"
check "can't like in someone else's name" "$(like $A $D $M)" "$RLS"
check "switched-off deal can't be liked" "$(like $A $OFF)" "$RLS"
check "deal of a business not approved yet can't be liked" "$(like $A $ND)" "$RLS"
check "business can't like" "$(like $M $D)" "$RLS"
check "banned student can't like" "$(like $BAN $D)" "$RLS"
check "visitors (anon) can't like" "$("${PSQL[@]}" -At -c "set role anon; insert into public.deal_likes (student_id, deal_id) values ('$A','$D');" 2>&1 | grep -o 'permission denied.*' | head -1)" "permission denied for table deal_likes"
check "likes can't be edited (no update)" "$(as_user $A "update public.deal_likes set created_at = now() where student_id = '$A' returning 1;")" "permission denied for table deal_likes"

echo " who sees what"
check "a student sees only their own like rows" "$(as_user $A "select count(*) from public.deal_likes;")" "1"
check "Fred can't remove Aline's like" "$(as_user $F "delete from public.deal_likes where student_id = '$A' returning 1;")" ""

echo " feed numbers"
as_user $A "insert into public.student_saved_items (student_id, item_type, item_id) values ('$A','deal','$D');" >/dev/null
check "Aline: 2 likes, liked, saved; switched-off and unapproved deals not listed" "$(social $A)" "2 true true"
check "Fred: 2 likes, liked, not saved" "$(social $F)" "2 true false"
check "business sees the count only" "$(social $M)" "2 false false"
check "visitors can't call it" "$("${PSQL[@]}" -At -c "set role anon; select * from public.get_deals_social(array['$D']::uuid[]);" 2>&1 | grep -o 'permission denied.*' | head -1)" "permission denied for function get_deals_social"
check "more than 200 deals refused" "$(as_user $A "select count(*) from public.get_deals_social(array(select gen_random_uuid() from generate_series(1,201)));")" "Ask for at most 200 deals at a time."
check "unlike removes it" "$(as_user $A "delete from public.deal_likes where deal_id = '$D' returning 1;")" "1"
check "count goes down" "$(social $F)" "1 true false"
check "function: empty search path, definer" "$(q "select prosecdef || ' ' || array_to_string(proconfig, ',') from pg_proc where proname = 'get_deals_social'")" 'true search_path=""'

echo " erasure"
like $A $D >/dev/null
check "deleting Aline's account removes her likes" "$(q "select public.tombstone_user_core('$A') ->> 'status'; select count(*) from public.deal_likes where student_id = '$A';" | tail -1)" "0"
check "deleting the deal removes its likes" "$(q "delete from public.deals where id = '$D'; select count(*) from public.deal_likes;" | tail -1)" "0"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
