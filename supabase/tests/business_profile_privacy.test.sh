#!/usr/bin/env bash
# Local Postgres test for migration 20261010130000_business_profile_privacy.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks who may see which business details (founder rule 2026-10-10).
#
# Usage: bash supabase/tests/business_profile_privacy.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/biz-privacy-test.XXXXXX)"
PORT="${PGPORT_TEST:-54363}"
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


A=00000000-0000-0000-0000-0000000000a1      # Aline, asks for her data

S=00000000-0000-0000-0000-0000000000c1      # Sara, active student
B=00000000-0000-0000-0000-0000000000c2      # Ben, banned student
T=00000000-0000-0000-0000-0000000000c3      # Tom, another student (not on the order)
A=00000000-0000-0000-0000-0000000000c9      # admin
M=00000000-0000-0000-0000-0000000000d1      # Mama Rose, approved
N=00000000-0000-0000-0000-0000000000d2      # Nice Cafe, approved (another business)
P=00000000-0000-0000-0000-0000000000d3      # Pending Grill, waiting for approval
O=30000000-0000-4000-8000-0000000000e1      # Sara's order at Mama Rose
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('$S','sara@keplercollege.ac.rw','{"role":"student"}','{}'),
 ('$B','ben@keplercollege.ac.rw','{"role":"student"}','{"banned":true}'),
 ('$T','tom@keplercollege.ac.rw','{"role":"student"}','{}'),
 ('$A','admin@unipicks.rw','{"role":"student"}','{}'),
 ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose","full_name":"Rose Mukamana","address":"KG 11 Ave"}','{}'),
 ('$N','n@shop.rw','{"role":"merchant","business_name":"Nice Cafe","full_name":"Nina K","address":"KN 3 Rd"}','{}'),
 ('$P','p@shop.rw','{"role":"merchant","business_name":"Pending Grill","full_name":"Paul G","address":"KK 5 St"}','{}');
update public.user_roles set role = 'admin' where user_id = '$A';
insert into public.user_roles (user_id, role) values ('$A','admin') on conflict (user_id) do update set role = 'admin';
insert into public.merchant_profiles (id, business_name, approved, phone, address, rdb_number, momo_pay_code, logo_url) values
 ('$M','Mama Rose',true,'0788111222','KG 11 Ave','RDB-111','MOMO-111','https://img/m.png'),
 ('$N','Nice Cafe',true,'0788333444','KN 3 Rd','RDB-222','MOMO-222',null),
 ('$P','Pending Grill',false,'0788555666','KK 5 St','RDB-333','MOMO-333',null)
on conflict (id) do update set business_name = excluded.business_name, approved = excluded.approved, phone = excluded.phone,
  address = excluded.address, rdb_number = excluded.rdb_number, momo_pay_code = excluded.momo_pay_code, logo_url = excluded.logo_url;
set session_replication_role = replica;
insert into public.deals (id, merchant_id, business_name, title, active, price) values ('10000000-0000-4000-8000-0000000000e1','$M','Mama Rose','Rolex',true,1500);
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline)
  values ('$O','$S','$M','10000000-0000-4000-8000-0000000000e1',1,1500,1500,'paid',now());
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
anon() { "${PSQL[@]}" -At -c "set role anon; $1" 2>&1 | grep -vE '^SET$' | tr '\n' ' ' | sed 's/ $//'; }
rows() { as_user "$1" "select coalesce(string_agg($2, ' ' order by 1), '-') from ($3) x;"; }

echo "business_profile_privacy tests"

# Production had an extra open rule that no migration created; recreate it, run
# the migration again, and check it is gone.
q "create policy \"Anyone can view merchant profiles\" on public.merchant_profiles for select using (true);" >/dev/null
check "the open rule existed (as in production)" "$(q "select count(*) from pg_policies where policyname = 'Anyone can view merchant profiles'")" "1"
sed 's/MAINTAIN, //' "$REPO/supabase/migrations/20261010130000_business_profile_privacy.sql" | "${PSQL[@]}" >/dev/null
check "running the migration removes it" "$(q "select count(*) from pg_policies where policyname = 'Anyone can view merchant profiles'")" "0"
check "running it twice is fine" "$(sed 's/MAINTAIN, //' "$REPO/supabase/migrations/20261010130000_business_profile_privacy.sql" | "${PSQL[@]}" 2>&1 | grep -c ERROR)" "0"

echo "-- the table itself"
check "visitors read no business rows" "$(anon "select count(*) from public.merchant_profiles;")" "0"
check "a student reads no business rows directly" "$(rows $S "business_name" "select business_name from public.merchant_profiles")" "-"
check "another business reads only itself" "$(rows $N "business_name" "select business_name from public.merchant_profiles")" "Nice Cafe"
check "the business reads its own RDB and MoMo code" "$(rows $M "rdb_number || '/' || momo_pay_code" "select rdb_number, momo_pay_code from public.merchant_profiles where id = '$M'")" "RDB-111/MOMO-111"
check "a pending business still reads itself" "$(rows $P "business_name" "select business_name from public.merchant_profiles")" "Pending Grill"
check "admin reads every business, pending included, with RDB" "$(rows $A "business_name || ':' || rdb_number" "select business_name, rdb_number from public.merchant_profiles")" "Mama Rose:RDB-111 Nice Cafe:RDB-222 Pending Grill:RDB-333"

echo "-- get_businesses (name and logo for all; contacts for active students)"
check "visitors: approved names and logos, no phone or address" "$(anon "select string_agg(business_name || ':' || coalesce(logo_url,'') || ':' || coalesce(phone,'-') || ':' || coalesce(address,'-'), ' ' order by business_name) from public.get_businesses();")" "Mama Rose:https://img/m.png:-:- Nice Cafe::-:-"
check "active student: phone and address too" "$(rows $S "business_name || ':' || phone || ':' || address" "select * from public.get_businesses()")" "Mama Rose:0788111222:KG 11 Ave Nice Cafe:0788333444:KN 3 Rd"
check "banned student: names only" "$(rows $B "business_name || ':' || coalesce(phone,'-')" "select * from public.get_businesses()")" "Mama Rose:- Nice Cafe:-"
check "another business: names only" "$(rows $N "business_name || ':' || coalesce(phone,'-')" "select * from public.get_businesses()")" "Mama Rose:- Nice Cafe:-"
check "admin: contacts shown" "$(rows $A "business_name || ':' || phone" "select * from public.get_businesses()")" "Mama Rose:0788111222 Nice Cafe:0788333444"
check "pending business never listed (asked by id too)" "$(rows $S "business_name" "select * from public.get_businesses(array['$P']::uuid[])")" "-"
check "by id: only the ones asked" "$(rows $S "business_name" "select * from public.get_businesses(array['$N']::uuid[])")" "Nice Cafe"
check "no RDB number or MoMo code in its result" "$(q "select pg_get_function_result('public.get_businesses(uuid[])'::regprocedure) ~* 'rdb|momo'")" "f"

echo "-- get_receipt_seller (the seller on a receipt)"
check "Sara's own receipt: name, address, RDB number" "$(rows $S "business_name || ':' || address || ':' || rdb_number" "select * from public.get_receipt_seller('$O')")" "Mama Rose:KG 11 Ave:RDB-111"
check "another student: nothing" "$(rows $T "business_name" "select * from public.get_receipt_seller('$O')")" "-"
check "the business itself: its receipt" "$(rows $M "business_name" "select * from public.get_receipt_seller('$O')")" "Mama Rose"
check "another business: nothing" "$(rows $N "business_name" "select * from public.get_receipt_seller('$O')")" "-"
check "admin: yes" "$(rows $A "business_name" "select * from public.get_receipt_seller('$O')")" "Mama Rose"
check "visitors can't call it" "$(anon "select * from public.get_receipt_seller('$O');" | grep -o 'permission denied for function get_receipt_seller')" "permission denied for function get_receipt_seller"

echo "-- search_merchants (Search → Businesses)"
check "active student: name and address" "$(rows $S "business_name || ':' || address" "select * from public.search_merchants('mama')")" "Mama Rose:KG 11 Ave"
check "another business: name, no address" "$(rows $N "business_name || ':' || address" "select * from public.search_merchants('mama')")" "Mama Rose:"
check "owner's personal name never returned" "$(rows $S "'['||full_name||']'" "select * from public.search_merchants('a')")" "[] []"
check "can't find a business by its owner's personal name" "$(rows $S "business_name" "select * from public.search_merchants('mukamana')")" "-"
check "pending business not found" "$(rows $S "business_name" "select * from public.search_merchants('grill')")" "-"
check "visitors can't call it" "$(anon "select * from public.search_merchants('mama');" | grep -o 'permission denied for function search_merchants')" "permission denied for function search_merchants"

echo "-- safety"
check "get_businesses and get_receipt_seller: definer, empty search path" "$(q "select string_agg(proname || ' ' || prosecdef || ' ' || array_to_string(proconfig, ','), ' | ' order by proname) from pg_proc where proname in ('get_businesses','get_receipt_seller')")" 'get_businesses true search_path="" | get_receipt_seller true search_path=""'

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
