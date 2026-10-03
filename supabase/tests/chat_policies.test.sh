#!/usr/bin/env bash
# Local Postgres test for fix 2: chat consent and integrity (migration 20261003280000).
# Builds the schema from every migration on stubbed Supabase internals, then checks who
# may send direct messages (social decisions D2/D3) and that receivers can only mark
# messages read.
#
# Usage: bash supabase/tests/chat_policies.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/chat-test.XXXXXX)"
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

A=00000000-0000-0000-0000-0000000000a1   # student
F=00000000-0000-0000-0000-0000000000a2   # A's friend
R=00000000-0000-0000-0000-0000000000a3   # accepted message request with A
P=00000000-0000-0000-0000-0000000000a4   # pending request only
X=00000000-0000-0000-0000-0000000000a5   # stranger
BL=00000000-0000-0000-0000-0000000000a6  # friend who blocked A
GONE=00000000-0000-0000-0000-0000000000a7 # deleted account (friend)
M=00000000-0000-0000-0000-0000000000b1   # approved merchant, A ordered from M
M2=00000000-0000-0000-0000-0000000000b2  # unapproved merchant
M3=00000000-0000-0000-0000-0000000000b3  # approved merchant, nobody ordered
D=00000000-0000-0000-0000-00000000de01
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$F','f@keplercollege.ac.rw','{"role":"student"}'),
 ('$R','r@keplercollege.ac.rw','{"role":"student"}'), ('$P','p@keplercollege.ac.rw','{"role":"student"}'),
 ('$X','x@keplercollege.ac.rw','{"role":"student"}'), ('$BL','bl@keplercollege.ac.rw','{"role":"student"}'),
 ('$GONE','gone@keplercollege.ac.rw','{"role":"student"}'),
 ('$M','m@shop.rw','{"role":"merchant","business_name":"M"}'), ('$M2','m2@shop.rw','{"role":"merchant","business_name":"M2"}'),
 ('$M3','m3@shop.rw','{"role":"merchant","business_name":"M3"}');
update public.merchant_profiles set approved = true where id in ('$M','$M3');
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"deleted_at":"2026-10-03T00:00:00Z"}' where id = '$GONE';
insert into public.friendships (student_a, student_b) values
 (least('$A'::uuid,'$F'::uuid), greatest('$A'::uuid,'$F'::uuid)),
 (least('$A'::uuid,'$BL'::uuid), greatest('$A'::uuid,'$BL'::uuid)),
 (least('$A'::uuid,'$GONE'::uuid), greatest('$A'::uuid,'$GONE'::uuid));
insert into public.message_requests (sender_id, receiver_id, status) values ('$R','$A','accepted'), ('$A','$P','pending');
insert into public.blocked_students (blocker_id, blocked_id) values ('$BL','$A');
insert into public.deals (id, merchant_id, business_name, title, active, price) values ('$D','$M','M','Wrap',true,1500);
insert into public.orders (student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline)
  values ('$A','$M','$D',1,1500,1500,'redeemed',now());
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
RLS='new row violates row-level security policy for table "chat_messages"'

echo "chat consent (D2/D3)"
check "student → friend: allowed" "$(q "set role authenticated; select set_config('request.jwt.claim.sub','$A',false); select public.can_send_direct_message('$F')" | tail -1)" "t"
check "student → friend: insert works" "$(as_user $A "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$F','hi') returning 'ok';")" "ok"
check "student → accepted request (they asked A): allowed" "$(as_user $A "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$R','hi') returning 'ok';")" "ok"
check "accepted request works both ways" "$(as_user $R "insert into public.chat_messages (sender_id, receiver_id, message) values ('$R','$A','hi') returning 'ok';")" "ok"
check "student → pending request only: rejected" "$(as_user $A "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$P','hi') returning 'ok';")" "$RLS"
check "student → stranger: rejected" "$(as_user $A "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$X','hi') returning 'ok';")" "$RLS"
check "friend who blocked A: A can't message them" "$(as_user $A "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$BL','hi') returning 'ok';")" "$RLS"
check "…and the blocker can't message A either" "$(as_user $BL "insert into public.chat_messages (sender_id, receiver_id, message) values ('$BL','$A','hi') returning 'ok';")" "$RLS"
check "deleted account: rejected even though friends" "$(as_user $A "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$GONE','hi') returning 'ok';")" "$RLS"
check "student → approved merchant: allowed" "$(as_user $X "insert into public.chat_messages (sender_id, receiver_id, message) values ('$X','$M3','is it open?') returning 'ok';")" "ok"
check "student → unapproved merchant: rejected" "$(as_user $X "insert into public.chat_messages (sender_id, receiver_id, message) values ('$X','$M2','hi') returning 'ok';")" "$RLS"
check "merchant → student who ordered: allowed" "$(as_user $M "insert into public.chat_messages (sender_id, receiver_id, message) values ('$M','$A','ready') returning 'ok';")" "ok"
check "merchant → student with no order and no message: rejected (no cold outreach)" "$(as_user $M "insert into public.chat_messages (sender_id, receiver_id, message) values ('$M','$F','promo!') returning 'ok';")" "$RLS"
check "merchant → student who wrote first: reply allowed" "$(as_user $M3 "insert into public.chat_messages (sender_id, receiver_id, message) values ('$M3','$X','yes, open') returning 'ok';")" "ok"
check "merchant → merchant: rejected" "$(as_user $M "insert into public.chat_messages (sender_id, receiver_id, message) values ('$M','$M3','hi') returning 'ok';")" "$RLS"
check "can't send as someone else" "$(as_user $X "insert into public.chat_messages (sender_id, receiver_id, message) values ('$A','$F','spoof') returning 'ok';")" "$RLS"
check "non-member can't post into a group chat any more" "$(q "insert into public.group_orders (id, deal_id, created_by, host_name, join_code, status) values ('00000000-0000-0000-0000-00000000e001','$D','$F','F','GR01','open');" >/dev/null; as_user $X "insert into public.chat_messages (sender_id, group_order_id, message) values ('$X','00000000-0000-0000-0000-00000000e001','hi') returning 'ok';")" "$RLS"
check "service role (Edge Functions) still sends system messages" "$(as_user '' "insert into public.chat_messages (sender_id, receiver_id, message) values ('$M','$F','Your order was accepted') returning 'ok';")" "ok"

echo "message integrity"
MSG=$(q "select id from public.chat_messages where sender_id='$M' and receiver_id='$A' limit 1")
check "receiver can mark a message read" "$(as_user $A "update public.chat_messages set is_read = true where id='$MSG' returning is_read::text;")" "true"
check "receiver can't change the text (e.g. a pickup code)" "$(as_user $A "update public.chat_messages set message = 'Pickup code: 9999' where id='$MSG' returning 'changed';")" "permission denied for table chat_messages"
check "receiver can't change sender or link" "$(as_user $A "update public.chat_messages set sender_id = '$A', link_path = '/x' where id='$MSG' returning 'changed';")" "permission denied for table chat_messages"
check "sender can't mark the receiver's copy read" "$(as_user $M "update public.chat_messages set is_read = false where id='$MSG' returning 'changed';")" ""
check "message text unchanged" "$(q "select message || '|' || is_read::text from public.chat_messages where id='$MSG'")" "ready|true"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
