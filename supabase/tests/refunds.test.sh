#!/usr/bin/env bash
# Local Postgres test for migration 20261010140000_refunds (refunds, phase 1).
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks who can start, send, fail and stop a refund, the amount rules, what
# each person can read, the alerts, the activity log, the pickup-code block,
# "can't serve this order", and that account deletion waits for open refunds.
#
# Usage: bash supabase/tests/refunds.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/refunds-test.XXXXXX)"
PORT="${PGPORT_TEST:-54364}"
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


# Production's payment-status rule (read 2026-10-10). The tables built from the
# migration files still have an older one (pending / success / failed /
# cancelled) that allows neither "paid" nor "refunded".
q "alter table public.transactions drop constraint transactions_status_check;
   alter table public.transactions add constraint transactions_status_check
     check (status = any (array['pending', 'processing', 'paid', 'failed', 'refunded']));" >/dev/null

S=00000000-0000-0000-0000-0000000000c1      # Sara, student
T=00000000-0000-0000-0000-0000000000c2      # Tom, another student
U=00000000-0000-0000-0000-0000000000c3      # Uwase, student who wants to delete her account
A=00000000-0000-0000-0000-0000000000c9      # admin
M=00000000-0000-0000-0000-0000000000d1      # Mama Rose
N=00000000-0000-0000-0000-0000000000d2      # Nice Cafe (another business)
D=10000000-0000-4000-8000-0000000000e1      # deal "Rolex" at Mama Rose
O1=30000000-0000-4000-8000-0000000000a1     # Sara: paid 4,800, not collected
O2=30000000-0000-4000-8000-0000000000a2     # Sara: collected, 3,000 (and MoMo charged her twice)
O3=30000000-0000-4000-8000-0000000000a3     # Sara: accepted, not paid
O4=30000000-0000-4000-8000-0000000000a4     # Sara: paid 1,500, open dispute
O5=30000000-0000-4000-8000-0000000000a5     # Sara: paid 1,500, business can't serve
O6=30000000-0000-4000-8000-0000000000a6     # Uwase: collected, 1,500
X1=40000000-0000-4000-8000-0000000000a1
X2=40000000-0000-4000-8000-0000000000a2
X4=40000000-0000-4000-8000-0000000000a4
X5=40000000-0000-4000-8000-0000000000a5
X6=40000000-0000-4000-8000-0000000000a6
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
 ('$S','sara@keplercollege.ac.rw','{"role":"student"}','{}'),
 ('$T','tom@keplercollege.ac.rw','{"role":"student"}','{}'),
 ('$U','uwase@keplercollege.ac.rw','{"role":"student"}','{}'),
 ('$A','admin@unipicks.rw','{"role":"student"}','{}'),
 ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}','{}'),
 ('$N','n@shop.rw','{"role":"merchant","business_name":"Nice Cafe"}','{}');
insert into public.user_roles (user_id, role) values ('$A','admin') on conflict (user_id) do update set role = 'admin';
insert into public.merchant_profiles (id, business_name, approved) values ('$M','Mama Rose',true), ('$N','Nice Cafe',true)
  on conflict (id) do update set business_name = excluded.business_name, approved = true;
set session_replication_role = replica;
insert into public.deals (id, merchant_id, business_name, title, active, price) values ('$D','$M','Mama Rose','Rolex',true,1500);
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, student_phone, dispute_status, dispute_reason) values
 ('$O1','$S','$M','$D',1,4800,4800,'paid',now(),'0788000111',null,null),
 ('$O2','$S','$M','$D',2,1500,3000,'redeemed',now(),'0788000111',null,null),
 ('$O3','$S','$M','$D',1,1500,1500,'confirmed',now(),'0788000111',null,null),
 ('$O4','$S','$M','$D',1,1500,1500,'paid',now(),'0788000111','open','wrong_item'),
 ('$O5','$S','$M','$D',1,1500,1500,'paid',now(),'0788000111',null,null),
 ('$O6','$U','$M','$D',1,1500,1500,'redeemed',now(),'0788000222',null,null);
insert into public.transactions (id, student_id, deal_id, amount, status, normal_order_id, created_at, phone_number, reference) values
 ('$X1','$S','$D',4800,'paid','$O1', now() - interval '5 min', '0788000111', 'UMP-$X1'),
 ('$X2','$S','$D',3000,'paid','$O2', now() - interval '4 min', '0788000111', 'UMP-$X2'),
 ('$X4','$S','$D',1500,'paid','$O4', now(), '0788000111', 'UMP-$X4'),
 ('$X5','$S','$D',1500,'paid','$O5', now(), '0788000111', 'UMP-$X5'),
 ('$X6','$U','$D',1500,'paid','$O6', now(), '0788000111', 'UMP-$X6');
insert into public.redemptions (id, deal_id, student_id, student_name, code, status, order_id) values
 ('50000000-0000-4000-8000-0000000000a1','$D','$S','Sara','4821','pending','$O1');
set session_replication_role = origin;
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
anon() { "${PSQL[@]}" -At -c "set role anon; $1" 2>&1 | grep -vE '^SET$' | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//' | head -1; }
MIGRATION="$REPO/supabase/migrations/20261010140000_refunds.sql"

echo "refunds tests"

check "running the migration again is fine" "$(sed 's/MAINTAIN, //' "$MIGRATION" | "${PSQL[@]}" 2>&1 | grep -c ERROR)" "0"
check "money in plain words" "$(q "select public.format_rwf(4800) || ' / ' || public.format_rwf(1234567)")" "4,800 RWF / 1,234,567 RWF"
check "every link to another table has an index" "$(q "select count(*) from pg_indexes where tablename = 'refunds' and indexname in ('refunds_order_id_idx','refunds_student_id_idx','refunds_merchant_id_idx','refunds_transaction_id_idx','refunds_started_by_idx','refunds_sent_by_idx')")" "6"
check "the two helpers can't be called from the app" \
  "$(q "select bool_or(has_function_privilege(r, f, 'execute'))::text from unnest(array['anon','authenticated']) r,
        unnest(array['public.format_rwf(numeric)', 'public.refundable_amount(uuid,boolean)']) f")" "false"
check "every new function is definer with an empty search path" \
  "$(q "select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where p.proname in ('request_cant_serve','admin_start_refund','admin_mark_refund_sent','admin_mark_refund_failed',
                            'admin_cancel_refund','block_pickup_during_refund')
          and p.prosecdef and p.proconfig = array['search_path=\"\"']")" "6"

echo "• who may do what"
check "visitors can't read refunds" "$(anon "select count(*) from public.refunds")" "permission denied for table refunds"
check "nobody writes the table directly" \
  "$(as_user "$A" "insert into public.refunds (order_id, transaction_id, student_id, merchant_id, amount, reason, charged_to) values ('$O1','$X1','$S','$M',1,'other','unipicks')")" \
  "permission denied for table refunds"
check "a student can't start a refund" "$(as_user "$S" "select public.admin_start_refund('$O1', 4800, 'other', 'unipicks', 'please')")" "Admin only"
check "a business can't start a refund" "$(as_user "$M" "select public.admin_start_refund('$O1', 4800, 'other', 'unipicks', 'please')")" "Admin only"

echo "• starting a refund: the amount rules"
check "an unpaid order can't be refunded" "$(as_user "$A" "select public.admin_start_refund('$O3', 1500, 'cant_serve', 'business')")" "This order has no payment to refund."
check "0 RWF is refused" "$(as_user "$A" "select public.admin_start_refund('$O1', 0, 'cant_serve', 'business')")" "The amount must be a whole number of RWF, more than 0."
check "part of a franc is refused" "$(as_user "$A" "select public.admin_start_refund('$O1', 10.5, 'cant_serve', 'business')")" "The amount must be a whole number of RWF, more than 0."
check "more than was paid is refused" "$(as_user "$A" "select public.admin_start_refund('$O1', 5000, 'cant_serve', 'business')")" "The most you can refund on this payment is 4,800 RWF."
check "'Other' needs a note" "$(as_user "$A" "select public.admin_start_refund('$O1', 4800, 'other', 'business')")" "Add a note for the student when the reason is Other."
check "'dispute' needs a dispute" "$(as_user "$A" "select public.admin_start_refund('$O1', 4800, 'dispute', 'business')")" "This order has no dispute."
check "who pays must be chosen" "$(as_user "$A" "select public.admin_start_refund('$O1', 4800, 'cant_serve', 'nobody')")" "Choose who pays for this refund."
R1=$(as_user "$A" "select public.admin_start_refund('$O1', 4800, 'cant_serve', 'business', 'Sold out today')")
check "the admin starts a full refund" "$(q "select status || ' ' || amount || ' ' || charged_to || ' ' || started_by from public.refunds where id = '$R1'")" "to_send 4800 business $A"
check "only one open refund per order" "$(as_user "$A" "select public.admin_start_refund('$O1', 100, 'cant_serve', 'business')")" "This order already has a refund in progress."
REF1=$(echo "$O1" | cut -c1-8 | tr a-z A-Z)
check "the student is told" "$(q "select message from public.user_notifications where user_id = '$S' and type = 'refund_started'")" \
  "We are refunding 4,800 RWF for order $REF1 (Rolex). We will send it to the MoMo number you paid with and tell you when it is sent."
check "the business is told, and that it pays" "$(q "select message from public.user_notifications where user_id = '$M' and type = 'refund_started'")" \
  "Unipicks is refunding 4,800 RWF to the student for order $REF1 (Rolex). This refund is charged to your business."
check "the start is in the admin log" "$(q "select action || ' ' || (details->>'amount') || ' ' || (details->>'charged_to') from public.activity_logs where action = 'refund_started'")" "refund_started 4800 business"

echo "• who can read it"
check "the student sees her refund" "$(as_user "$S" "select count(*) from public.refunds")" "1"
check "another student sees nothing" "$(as_user "$T" "select count(*) from public.refunds")" "0"
check "the business sees refunds of its orders" "$(as_user "$M" "select count(*) from public.refunds")" "1"
check "another business sees nothing" "$(as_user "$N" "select count(*) from public.refunds")" "0"
check "the admin sees all" "$(as_user "$A" "select count(*) from public.refunds")" "1"

echo "• the pickup code during a refund"
check "the code is refused while the refund is open" "$(as_user "$M" "select public.redeem_pickup_code('4821')")" "This order is being refunded. Do not hand over the item."
check "…and nothing changed" "$(q "select o.status || ' ' || r.status from public.orders o join public.redemptions r on r.order_id = o.id where o.id = '$O1'")" "paid pending"

echo "• failed, then sent"
check "a student can't mark it" "$(as_user "$S" "select public.admin_mark_refund_failed('$R1', 'x')")" "Admin only"
as_user "$A" "select public.admin_mark_refund_failed('$R1', 'Number not registered for MoMo')" >/dev/null
check "marked failed" "$(q "select status from public.refunds where id = '$R1'")" "failed"
check "the failure note stays in the admin log" "$(q "select details->>'note' from public.activity_logs where action = 'refund_failed'")" "Number not registered for MoMo"
check "the student gets no alert for a failure" "$(q "select count(*) from public.user_notifications where user_id = '$S' and type like 'refund_%'")" "1"
check "failed twice is refused" "$(as_user "$A" "select public.admin_mark_refund_failed('$R1')")" "Only a refund waiting to be sent can be marked as failed."
check "sent needs the MoMo reference" "$(as_user "$A" "select public.admin_mark_refund_sent('$R1', '  ')")" "Type the MoMo reference of the transfer."
check "a business can't mark it sent" "$(as_user "$M" "select public.admin_mark_refund_sent('$R1', 'X')")" "Admin only"
as_user "$A" "select public.admin_mark_refund_sent('$R1', 'MP241010.1234')" >/dev/null
check "sent, with the reference, by the admin" "$(q "select status || ' ' || momo_reference || ' ' || sent_by || ' ' || (sent_at is not null) from public.refunds where id = '$R1'")" "sent MP241010.1234 $A true"
check "the payment and the order are refunded" "$(q "select t.status || ' ' || o.status from public.transactions t join public.orders o on o.id = t.normal_order_id where t.id = '$X1'")" "refunded refunded"
check "the student is told, with the reference" "$(q "select message from public.user_notifications where user_id = '$S' and type = 'refund_sent'")" \
  "Refund sent: 4,800 RWF for order $REF1 (Rolex). MoMo reference MP241010.1234."
check "the business is told" "$(q "select count(*) from public.user_notifications where user_id = '$M' and type = 'refund_sent'")" "1"
check "sent twice is refused" "$(as_user "$A" "select public.admin_mark_refund_sent('$R1', 'again')")" "This refund is already sent."
check "nothing is left to refund" "$(as_user "$A" "select public.admin_start_refund('$O1', 1, 'other', 'unipicks', 'x')")" "This payment has already been refunded in full."
check "the pickup code no longer works" "$(as_user "$M" "select public.redeem_pickup_code('4821')")" "This code is not linked to a paid order"

echo "• part refunds and a double charge"
R2=$(as_user "$A" "select public.admin_start_refund('$O2', 1000, 'other', 'business', 'Wrong side dish')")
as_user "$A" "select public.admin_mark_refund_sent('$R2', 'MP-2')" >/dev/null
check "after a part refund the payment and order stay as they were" "$(q "select (select status from public.transactions where id = '$X2') || ' ' || status from public.orders where id = '$O2'")" "paid redeemed"
check "the next refund is capped at what is left" "$(as_user "$A" "select public.admin_start_refund('$O2', 2500, 'other', 'business', 'x')")" "The most you can refund on this payment is 2,000 RWF."
R3=$(as_user "$A" "select public.admin_start_refund('$O2', 3000, 'double_payment', 'unipicks', null, '$X2')")
check "a double charge is counted on its own (up to one payment)" "$(q "select amount || ' ' || charged_to from public.refunds where id = '$R3'")" "3000 unipicks"
as_user "$A" "select public.admin_mark_refund_sent('$R3', 'MP-3')" >/dev/null
check "refunding the double charge leaves the order collected" "$(q "select (select status from public.transactions where id = '$X2') || ' ' || status from public.orders where id = '$O2'")" "paid redeemed"
check "a double charge is refunded once" "$(as_user "$A" "select public.admin_start_refund('$O2', 1, 'double_payment', 'unipicks')")" "This double charge has already been refunded."
check "the rest of the order can still be refunded" "$(as_user "$A" "select public.admin_start_refund('$O2', 2001, 'other', 'business', 'x')")" "The most you can refund on this payment is 2,000 RWF."
R7=$(as_user "$A" "select public.admin_start_refund('$O2', 2000, 'other', 'business', 'Rest of the order')")
as_user "$A" "select public.admin_mark_refund_sent('$R7', 'MP-7')" >/dev/null
check "when all of it is back, the payment and order are refunded" "$(q "select (select status from public.transactions where id = '$X2') || ' ' || status from public.orders where id = '$O2'")" "refunded refunded"
check "a payment of another order can't be used" "$(as_user "$A" "select public.admin_start_refund('$O4', 100, 'other', 'business', 'x', '$X1')")" "This order has no payment to refund."

echo "• a dispute decided with a refund, then stopped"
R4=$(as_user "$A" "select public.admin_start_refund('$O4', 1500, 'dispute', 'business', 'You got the wrong item')")
check "'Resolve and refund' resolves the dispute" "$(q "select dispute_status || ' / ' || dispute_resolution_note from public.orders where id = '$O4'")" "resolved / You got the wrong item"
check "the student hears the dispute was resolved" "$(q "select count(*) from public.user_notifications where user_id = '$S' and type = 'dispute_status_changed'")" "1"
check "stopping needs a reason" "$(as_user "$A" "select public.admin_cancel_refund('$R4', '')")" "Say why the refund is stopped (the student will see it)."
as_user "$A" "select public.admin_cancel_refund('$R4', 'Started by mistake, the business is replacing the item')" >/dev/null
check "stopped" "$(q "select status from public.refunds where id = '$R4'")" "cancelled"
check "the student is told why" "$(q "select message from public.user_notifications where user_id = '$S' and type = 'refund_cancelled'")" \
  "The refund of 1,500 RWF for order $(echo "$O4" | cut -c1-8 | tr a-z A-Z) was stopped: Started by mistake, the business is replacing the item"
check "the order is unchanged" "$(q "select status from public.orders where id = '$O4'")" "paid"
check "a stopped refund can't be sent" "$(as_user "$A" "select public.admin_mark_refund_sent('$R4', 'X')")" "This refund is already cancelled."
check "a new refund can start after a stopped one" "$(q "select count(*) from public.refunds where order_id = '$O4'")" "1"
R5=$(as_user "$A" "select public.admin_start_refund('$O4', 1500, 'dispute', 'business', 'Refund after all')")
check "…and it starts" "$(q "select status from public.refunds where id = '$R5'")" "to_send"

echo "• \"can't serve this order\" (business)"
check "another business can't use it" "$(as_user "$N" "select public.request_cant_serve('$O5', 'sold_out')")" "Order not found"
check "the student can't use it" "$(as_user "$S" "select public.request_cant_serve('$O5', 'sold_out')")" "Order not found"
check "an unpaid order is refused" "$(as_user "$M" "select public.request_cant_serve('$O3', 'sold_out')")" "Only a paid order that is not collected yet can be marked \"can't serve\"."
check "'Other' needs a note" "$(as_user "$M" "select public.request_cant_serve('$O5', 'other')")" "Please say why when you choose Other."
check "an unknown reason is refused" "$(as_user "$M" "select public.request_cant_serve('$O5', 'bored')")" "Choose a reason."
as_user "$M" "select public.request_cant_serve('$O5', 'sold_out')" >/dev/null
check "recorded on the order, no refund yet (an admin decides)" \
  "$(q "select cant_serve_reason || ' ' || (cant_serve_at is not null) || ' ' || status || ' ' || (select count(*) from public.refunds where order_id = '$O5') from public.orders where id = '$O5'")" "sold_out true paid 0"
check "the student is told" "$(q "select message from public.user_notifications where user_id = '$S' and type = 'order_cant_serve'")" \
  "Mama Rose can't serve your order $(echo "$O5" | cut -c1-8 | tr a-z A-Z) (Rolex): sold out. Unipicks will contact you about your money within 24 hours."
check "every admin is told, with a link to Refunds" "$(q "select count(*) || ' ' || min(link_path) from public.user_notifications where user_id = '$A' and type = 'order_cant_serve'")" "1 /dashboard/refunds"
check "asked twice is refused" "$(as_user "$M" "select public.request_cant_serve('$O5', 'closed')")" "You already told Unipicks you can't serve this order."
q "update auth.users set raw_app_meta_data = '{\"banned\":true}' where id = '$M'" >/dev/null
check "a suspended business can't use it" "$(as_user "$M" "select public.request_cant_serve('$O1', 'sold_out')")" "Your account is suspended. Contact support."
q "update auth.users set raw_app_meta_data = '{}' where id = '$M'" >/dev/null

echo "• deleting an account waits for open refunds"
R6=$(as_user "$A" "select public.admin_start_refund('$O6', 500, 'other', 'business', 'Cold food')")
# Called as the database owner, like the delete-my-account function does with its service key.
del() { "${PSQL[@]}" -At -c "select public.tombstone_user_core('$1')->>'status'" 2>&1 | grep -m1 -E 'ERROR|deleted' | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//'; }
check "refused while a refund is open" "$(del "$U")" \
  "A refund for one of your orders is still being sent. Wait for it to finish before deleting your account."
check "the business can't delete either" "$(del "$M")" "You have active orders. Finish, collect or cancel them before deleting your account."
as_user "$A" "select public.admin_mark_refund_sent('$R6', 'MP-6')" >/dev/null
check "allowed once it is sent" "$(del "$U")" "deleted"
check "the refund record is kept" "$(q "select status || ' ' || amount from public.refunds where id = '$R6'")" "sent 500"

echo
echo "refunds: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
