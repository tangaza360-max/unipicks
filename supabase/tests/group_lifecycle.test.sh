#!/usr/bin/env bash
# Local Postgres test for fix 7: group order lifecycle (migration 20261003310000).
# Builds the schema from every migration on stubbed Supabase internals, then checks the
# 24-hour limit, deal expiry, reopening a group when its order dies, and the member
# notifications.
#
# Usage: bash supabase/tests/group_lifecycle.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/group-test.XXXXXX)"
PORT="${PGPORT_TEST:-54341}"
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

H=00000000-0000-0000-0000-0000000000a1      # host
J=00000000-0000-0000-0000-0000000000a2      # member
K=00000000-0000-0000-0000-0000000000a3      # wants to join
M=00000000-0000-0000-0000-0000000000b1      # merchant
D=00000000-0000-0000-0000-00000000de01      # live deal
DX=00000000-0000-0000-0000-00000000de02     # expired deal
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$H','h@keplercollege.ac.rw','{"role":"student","full_name":"Hana"}'), ('$J','j@keplercollege.ac.rw','{"role":"student","full_name":"Jo"}'),
 ('$K','k@keplercollege.ac.rw','{"role":"student","full_name":"Kim"}'), ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}');
update public.merchant_profiles set approved = true where id = '$M';
insert into public.deals (id, merchant_id, business_name, title, active, price) values ('$D','$M','Mama Rose','Pizza for 4',true,8000);
insert into public.deals (id, merchant_id, business_name, title, active, price, expires_at) values ('$DX','$M','Mama Rose','Old deal',true,8000, now() - interval '1 day');
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
RLS='new row violates row-level security policy for table "group_order_members"'
notes() { q "select count(*) from public.user_notifications where type = '$1' ${2:+and user_id = '$2'}"; }

echo "24-hour limit and deal expiry"
G=$(as_user $H "select (public.create_group_order_with_host('$D', 'pz01')).id;")
check "new group gets expires_at ≈ now + 24h" "$(q "select (expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute')::text from public.group_orders where id = '$G'")" "true"
check "can't start a group on an expired deal" "$(as_user $H "select (public.create_group_order_with_host('$DX', 'old1')).id;")" "This deal has ended, so a new group can't be started."
check "member joins an open group" "$(as_user $J "insert into public.group_order_members (group_order_id, student_id, student_name, quantity) values ('$G','$J','Jo',1) returning 'ok';")" "ok"
q "update public.group_orders set expires_at = now() - interval '1 minute' where id = '$G'" >/dev/null
check "can't join once the 24 hours are over (even before the cron closes it)" "$(as_user $K "insert into public.group_order_members (group_order_id, student_id, student_name, quantity) values ('$G','$K','Kim',1) returning 'ok';")" "$RLS"
check "join code no longer finds it" "$(as_user $K "select count(*) from public.find_open_group_order_by_code('PZ01');")" "0"
check "deal page no longer lists it" "$(as_user $K "select count(*) from public.get_open_groups_for_deal('$D');")" "0"
q "update public.group_orders set status = 'cancelled' where id = '$G'" >/dev/null
check "cron closing it notifies every member" "$(notes group_order_expired)" "2"
check "…with a clear message" "$(q "select message from public.user_notifications where type = 'group_order_expired' and user_id = '$J'")" "Your group for Pizza for 4 closed: it wasn't sent to the business within 24 hours."

echo "host cancelling (before 24 hours) is not reported as an expiry"
G2=$(as_user $H "select (public.create_group_order_with_host('$D', 'pz02')).id;")
q "update public.group_orders set status = 'cancelled' where id = '$G2'" >/dev/null
check "no expiry notification" "$(notes group_order_expired)" "2"

echo "order events"
G3=$(as_user $H "select (public.create_group_order_with_host('$D', 'pz03')).id;")
as_user $J "insert into public.group_order_members (group_order_id, student_id, student_name, quantity) values ('$G3','$J','Jo',2);" >/dev/null
q "update public.group_orders set status = 'closed' where id = '$G3';
   insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, group_order_id)
   values ('00000000-0000-0000-0000-00000000f003','$H','$M','$D',3,8000,24000,'pending_confirmation',now(),'$G3')" >/dev/null
check "submitted: the member is told, the host isn't" "$(notes group_order_submitted $J)|$(notes group_order_submitted $H)" "1|0"
check "submitted message" "$(q "select message from public.user_notifications where type = 'group_order_submitted' and user_id = '$J'")" "Hana sent your group order for Pizza for 4 to Mama Rose."
q "update public.group_orders set expires_at = now() + interval '1 hour' where id = '$G3';
   update public.orders set status = 'declined' where id = '00000000-0000-0000-0000-00000000f003'" >/dev/null
check "declined: the group is open again" "$(q "select status from public.group_orders where id = '$G3'")" "open"
check "…with a fresh 24 hours" "$(q "select (expires_at > now() + interval '23 hours')::text from public.group_orders where id = '$G3'")" "true"
check "…and everyone is told (host and member)" "$(notes group_order_reopened)" "2"
check "host message" "$(q "select message from public.user_notifications where type = 'group_order_reopened' and user_id = '$H'")" "Your group order for Pizza for 4 wasn't completed: Mama Rose declined it. The group is open again, so you can send it again."
check "member message" "$(q "select message from public.user_notifications where type = 'group_order_reopened' and user_id = '$J'")" "Your group order for Pizza for 4 wasn't completed: Mama Rose declined it. The group is open again, so the host can send it again."
q "update public.group_orders set status = 'closed' where id = '$G3';
   insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, group_order_id)
   values ('00000000-0000-0000-0000-00000000f004','$H','$M','$D',3,8000,24000,'pending_confirmation',now(),'$G3');
   update public.orders set status = 'confirmed' where id = '00000000-0000-0000-0000-00000000f004';
   update public.orders set status = 'payment_expired' where id = '00000000-0000-0000-0000-00000000f004'" >/dev/null
check "payment expired: reopened again" "$(q "select status from public.group_orders where id = '$G3'")" "open"
check "payment-expired reason" "$(q "select message from public.user_notifications where type = 'group_order_reopened' and user_id = '$J' order by created_at desc, message limit 1")" "Your group order for Pizza for 4 wasn't completed: it wasn't paid in time. The group is open again, so the host can send it again."
q "update public.group_orders set status = 'closed' where id = '$G3';
   insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, group_order_id)
   values ('00000000-0000-0000-0000-00000000f005','$H','$M','$D',3,8000,24000,'pending_confirmation',now(),'$G3');
   update public.orders set status = 'paid' where id = '00000000-0000-0000-0000-00000000f005'" >/dev/null
check "paid: the member is told the host has the code" "$(q "select message from public.user_notifications where type = 'group_order_paid' and user_id = '$J'")" "Your group order for Pizza for 4 is paid. Hana has the pickup code."
check "paid: the group stays closed" "$(q "select status from public.group_orders where id = '$G3'")" "closed"
check "normal (non-group) orders create no group notifications" "$(q "insert into public.orders (student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline) values ('$K','$M','$D',1,8000,8000,'pending_confirmation',now()); update public.orders set status = 'declined' where student_id = '$K'" >/dev/null; q "select count(*) from public.user_notifications where user_id = '$K'")" "0"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
