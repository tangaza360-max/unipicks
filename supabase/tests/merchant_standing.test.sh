#!/usr/bin/env bash
# Local Postgres test for fix 6: merchant standing (migration 20261003290000).
# Builds the schema from every migration on stubbed Supabase internals, then checks that
# deals of banned / deactivated / deleted merchants are hidden, and that banned merchants
# can't write deals or redeem pickup codes.
#
# Usage: bash supabase/tests/merchant_standing.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/standing-test.XXXXXX)"
PORT="${PGPORT_TEST:-54339}"
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

S=00000000-0000-0000-0000-0000000000a1      # student to delete
B=00000000-0000-0000-0000-0000000000a2      # another student (counterparty)
X=00000000-0000-0000-0000-0000000000a3      # student S blocked
M=00000000-0000-0000-0000-0000000000b1      # merchant (deleted later by an admin)
AD=00000000-0000-0000-0000-0000000000d1     # admin
ACT=00000000-0000-0000-0000-0000000000c1    # blocked: active order
DIS=00000000-0000-0000-0000-0000000000c2    # blocked: open dispute
HOST=00000000-0000-0000-0000-0000000000c3   # blocked: hosting an open group
D=00000000-0000-0000-0000-00000000de01
O1=00000000-0000-0000-0000-0000000000f1
OG=00000000-0000-0000-0000-0000000000f2
GC=00000000-0000-0000-0000-0000000000e1
GO=00000000-0000-0000-0000-0000000000e2
SEMAIL='aline@keplercollege.ac.rw'
# A realistic UmunotaPay webhook_payload (every key production stores); $1 phone, $2 reference.
payload() {
  printf '%s' '{"id":"pay_9f2c","items":[{"name":"Chicken wrap","quantity":1,"unit_price":2500}],"phone":"'"$1"'","amount":2500,
"status":"success","is_test":true,"currency":"RWF","reference":"'"$2"'","wallet_id":"wal_0788","created_at":"2026-10-01T10:00:00Z",
"product_id":"prod_1","request_id":"req_77","updated_at":"2026-10-01T10:00:05Z","description":"Payment by Aline U","itecpay_fee":25,
"service_fee":50,"wallet_name":"Aline Uwase","total_to_pay":2575,"income_splits":[{"sub_account_id":"sub_m1","amount":2450}],
"account_number":"'"$1"'","charged_amount":2575,"correlation_id":"corr_42","sub_account_id":"sub_m1","transfer_scope":"merchant",
"umunotapay_fee":25,"wallet_debited":true,"transaction_fee":50,"wallet_credited":true,"itecpay_trans_id":"itc_5531","payment_provider":"mtn_momo"}'
}
PAYLOAD_S=$(payload 0788123456 ref-1)
PAYLOAD_B=$(payload 0789999999 ref-b)

OK=00000000-0000-0000-0000-0000000000b1     # approved merchant
OFF=00000000-0000-0000-0000-0000000000b2    # deactivated (approved = false)
BAN=00000000-0000-0000-0000-0000000000b3    # approved but banned
GONE=00000000-0000-0000-0000-0000000000b4   # approved but deleted
S=00000000-0000-0000-0000-0000000000a1      # student
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$OK','ok@shop.rw','{"role":"merchant","business_name":"OK"}'), ('$OFF','off@shop.rw','{"role":"merchant","business_name":"OFF"}'),
 ('$BAN','ban@shop.rw','{"role":"merchant","business_name":"BAN"}'), ('$GONE','gone@shop.rw','{"role":"merchant","business_name":"GONE"}'),
 ('$S','s@keplercollege.ac.rw','{"role":"student"}');
update public.merchant_profiles set approved = true where id in ('$OK','$BAN','$GONE');
insert into public.deals (merchant_id, business_name, title, active, price) values
 ('$OK','OK','ok deal',true,1000), ('$OFF','OFF','off deal',true,1000), ('$BAN','BAN','ban deal',true,1000), ('$GONE','GONE','gone deal',true,1000),
 ('$OK','OK','ok inactive',false,1000);
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"banned": true}' where id = '$BAN';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"deleted_at":"2026-10-03T00:00:00Z"}' where id = '$GONE';
-- A paid order with a pickup code on the banned merchant's deal
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline)
  select '00000000-0000-0000-0000-00000000f001', '$S', '$BAN', id, 1, 1000, 1000, 'paid', now() from public.deals where title = 'ban deal';
insert into public.redemptions (deal_id, student_id, code, status, order_id)
  select id, '$S', 'BANC', 'pending', '00000000-0000-0000-0000-00000000f001' from public.deals where title = 'ban deal';
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
anon() { { "${PSQL[@]}" -At 2>&1 || true; } <<<"set role anon; $1" | grep -v '^SET$' | tail -1; }

echo "deal visibility"
check "anon sees only the good-standing merchant's active deal" "$(anon "select string_agg(title, ',' order by title) from public.deals;")" "ok deal"
check "student sees the same" "$(as_user $S "select string_agg(title, ',' order by title) from public.deals;")" "ok deal"
check "deactivated merchant still sees their own deal" "$(as_user $OFF "select string_agg(title, ',' order by title) from public.deals where merchant_id = '$OFF';")" "off deal"
check "merchant sees their own inactive deals too" "$(as_user $OK "select string_agg(title, ',' order by title) from public.deals where merchant_id = '$OK';")" "ok deal,ok inactive"
check "re-approval brings the deal back" "$(q "update public.merchant_profiles set approved = true where id = '$OFF'" >/dev/null; anon "select count(*) from public.deals where title = 'off deal';")" "1"
q "update public.merchant_profiles set approved = false where id = '$OFF'" >/dev/null

echo "banned merchant can't act"
check "banned merchant can't create a deal" "$(as_user $BAN "insert into public.deals (merchant_id, business_name, title, active, price) values ('$BAN','BAN','new',true,1000) returning 'ok';")" "Your account is suspended. Contact support."
check "banned merchant can't edit a deal" "$(as_user $BAN "update public.deals set price = 1 where merchant_id = '$BAN' returning 'ok';")" "Your account is suspended. Contact support."
check "banned merchant can't redeem a pickup code" "$(as_user $BAN "select order_id from public.redeem_pickup_code('BANC');")" "Your account is suspended. Contact support."
check "…and the code stays unredeemed" "$(q "select status from public.redemptions where code = 'BANC'")" "pending"
check "good-standing merchant can still edit their deal" "$(as_user $OK "update public.deals set price = 900 where title = 'ok deal' returning 'ok';")" "ok"
check "service role can still update deals (e.g. account deletion)" "$(as_user '' "update public.deals set active = false where merchant_id = '$BAN' returning 'ok';")" "ok"
check "is_merchant_in_good_standing: ok, off, banned, deleted" "$(q "select string_agg(public.is_merchant_in_good_standing(id)::text, ',' order by id) from (values ('$OK'::uuid),('$OFF'::uuid),('$BAN'::uuid),('$GONE'::uuid)) v(id)")" "true,false,false,false"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
