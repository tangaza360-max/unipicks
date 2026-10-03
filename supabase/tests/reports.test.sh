#!/usr/bin/env bash
# Local Postgres test for fix 8: reports and the admin queue (migration 20261003300000).
# Builds the schema from every migration on stubbed Supabase internals, then checks who
# can file reports, that admins are alerted and can read and review them, and that
# nobody else can.
#
# Usage: bash supabase/tests/reports.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/reports-test.XXXXXX)"
PORT="${PGPORT_TEST:-54340}"
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

S=00000000-0000-0000-0000-0000000000a1      # student reporter
T=00000000-0000-0000-0000-0000000000a2      # reported student
BAN=00000000-0000-0000-0000-0000000000a3    # banned student
M=00000000-0000-0000-0000-0000000000b1      # merchant
AD1=00000000-0000-0000-0000-0000000000d1
AD2=00000000-0000-0000-0000-0000000000d2
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$S','s@keplercollege.ac.rw','{"role":"student","full_name":"Aline"}'), ('$T','t@keplercollege.ac.rw','{"role":"student","full_name":"Kevin"}'),
 ('$BAN','ban@keplercollege.ac.rw','{"role":"student"}'), ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}'),
 ('$AD1','ad1@unipicks.app','{}'), ('$AD2','ad2@unipicks.app','{}');
update public.user_roles set role = 'admin' where user_id in ('$AD1','$AD2');
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"banned": true}' where id = '$BAN';
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
RLS='new row violates row-level security policy for table "student_reports"'

echo "filing"
check "student reports a student (chat)" "$(as_user $S "insert into public.student_reports (reporter_id, reported_id, category, description, context) values ('$S','$T','Harassment','Rude messages','chat') returning status;")" "pending"
check "merchant reports a student" "$(as_user $M "insert into public.student_reports (reporter_id, reported_id, category, context) values ('$M','$T','Spam','chat') returning status;")" "pending"
check "student reports a business" "$(as_user $S "insert into public.student_reports (reporter_id, reported_id, category, context) values ('$S','$M','Other','business') returning status;")" "pending"
check "can't file as someone else" "$(as_user $S "insert into public.student_reports (reporter_id, reported_id, category) values ('$T','$M','Spam') returning 1;")" "$RLS"
check "can't file a report already 'resolved'" "$(as_user $S "insert into public.student_reports (reporter_id, reported_id, category, status) values ('$S','$T','Spam','resolved') returning 1;")" "$RLS"
check "can't report yourself" "$(as_user $S "insert into public.student_reports (reporter_id, reported_id, category) values ('$S','$S','Spam') returning 1;")" 'new row for relation "student_reports" violates check constraint "student_reports_no_self"'
check "banned user can't file reports" "$(as_user $BAN "insert into public.student_reports (reporter_id, reported_id, category) values ('$BAN','$T','Spam') returning 1;")" "Your account is suspended. Contact support."

echo "admins alerted"
check "every admin gets one alert per report (3 reports × 2 admins)" "$(q "select count(*) from public.user_notifications where type = 'report_filed'")" "6"
check "alert links to the Reports tab and names the category" "$(q "select link_path || ' | ' || message from public.user_notifications where type = 'report_filed' and user_id = '$AD1' and message like '%Harassment%'")" "/dashboard/reports | New report: Harassment. Please respond within 24 hours."
check "students and merchants get no report alerts" "$(q "select count(*) from public.user_notifications where type = 'report_filed' and user_id not in ('$AD1','$AD2')")" "0"

echo "reading"
check "reporter sees only their own reports" "$(as_user $S "select count(*) from public.student_reports;")" "2"
check "the reported student sees none" "$(as_user $T "select count(*) from public.student_reports;")" "0"
check "admin sees all reports" "$(as_user $AD1 "select count(*) from public.student_reports;")" "3"
check "admin queue has names and roles" "$(as_user $AD1 "select reporter_name || ' (' || reporter_role || ') → ' || reported_name || ' (' || reported_role || ')' from public.get_admin_reports() where category = 'Other';")" "Aline (student) → Mama Rose (merchant)"
check "non-admin can't read the queue" "$(as_user $S "select count(*) from public.get_admin_reports();")" "Only admins can view reports"

echo "reviewing"
R=$(q "select id from public.student_reports where category = 'Harassment'")
check "non-admin can't review" "$(as_user $S "select public.review_report('$R', 'dismissed');")" "Only admins can review reports"
check "invalid status rejected" "$(as_user $AD1 "select public.review_report('$R', 'pending');")" "Invalid report status"
as_user $AD1 "select public.review_report('$R', 'resolved', 'Warned the user');" >/dev/null
check "admin resolves with a note" "$(q "select status || ' | ' || admin_note || ' | ' || (reviewed_by = '$AD1')::text || ' | ' || (reviewed_at is not null)::text from public.student_reports where id = '$R'")" "resolved | Warned the user | true | true"
check "decision logged in activity_logs" "$(q "select action || ' | ' || (admin_id = '$AD1')::text || ' | ' || (target_id = '$T')::text from public.activity_logs where action like 'report_%'")" "report_resolved | true | true"
check "reporter can't change a report" "$(as_user $S "update public.student_reports set status = 'dismissed' where id = '$R' returning 1;")" ""
check "status unchanged after reporter's attempt" "$(q "select status from public.student_reports where id = '$R'")" "resolved"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
