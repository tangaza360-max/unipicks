#!/usr/bin/env bash
# Local Postgres test for migration 20261010120000_export_my_data.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks what "Download my data" includes and leaves out.
#
# Usage: bash supabase/tests/export_my_data.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/export-data-test.XXXXXX)"
PORT="${PGPORT_TEST:-54362}"
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
F=00000000-0000-0000-0000-0000000000a2      # Fred, her friend
K=00000000-0000-0000-0000-0000000000a4      # Kevin, whom she blocked
M=00000000-0000-0000-0000-0000000000b1      # business
D=10000000-0000-4000-8000-000000000001
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, phone, encrypted_password, raw_user_meta_data) values
 ('$A','aline@keplercollege.ac.rw','250788000111','SECRET-HASH-A','{"role":"student","full_name":"Aline Uwase"}'),
 ('$F','fred@keplercollege.ac.rw',null,'SECRET-HASH-F','{"role":"student"}'),
 ('$K','kevin@keplercollege.ac.rw',null,'x','{"role":"student"}'),
 ('$M','m@shop.rw',null,'x','{"role":"merchant","business_name":"Mama Rose"}');
insert into public.merchant_profiles (id, business_name, approved) values ('$M','Mama Rose',true) on conflict (id) do update set approved = true;
insert into public.deals (id, merchant_id, business_name, title, active, price) values ('$D','$M','Mama Rose','Rolex',true,1500);
insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus) values
 ('$A','aline','Aline U','Kepler College','Kigali',true), ('$F','fred','Fred M','Kepler College','Kigali',true), ('$K','kevin','Kevin N','Kepler College','Kigali',true);
insert into public.student_interests (student_id, interest) values ('$A','pizza');
insert into public.student_saved_items (student_id, item_type, item_id) values ('$A','deal','$D');
insert into public.deal_likes (student_id, deal_id) values ('$A','$D');
insert into public.deal_comments (deal_id, author_id, body) values ('$D','$A','Is it spicy?');
insert into public.friendships (student_a, student_b) values (least('$A'::uuid,'$F'::uuid), greatest('$A'::uuid,'$F'::uuid));
insert into public.blocked_students (blocker_id, blocked_id) values ('$A','$K');
insert into public.user_notifications (user_id, type, actor_id, message) values ('$A','comment_reply','$M','Mama Rose replied to your comment');
insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent) values ('$A','https://push.example/SECRET-ENDPOINT','SECRET-P256','SECRET-AUTH','Android Chrome');
set session_replication_role = replica; -- the rest needs orders/payments; skip their links and triggers here
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline)
  values ('30000000-0000-4000-8000-000000000001','$A','$M','$D',1,1500,1500,'redeemed',now());
insert into public.redemptions (id, student_id, deal_id, status, code) values ('20000000-0000-4000-8000-000000000001','$A','$D','redeemed','4821');
insert into public.ratings (deal_id, merchant_id, student_id, redemption_id, rating, review) values ('$D','$M','$A','20000000-0000-4000-8000-000000000001',5,'Great');
insert into public.chat_messages (sender_id, receiver_id, message) values ('$F','$A','See you at lunch');
insert into public.student_reports (reporter_id, reported_id, category, description, context) values
 ('$A','$K','Spam','He spams me','profile'), ('$F','$A','Harassment','Fred reports Aline (private to admins)','profile');
SQL
# The repo-built payments table is older than production's (columns differ); fill what exists.
"${PSQL[@]}" >/dev/null <<SQL
set session_replication_role = replica;
insert into public.transactions (student_id, deal_id, amount, phone_number, reference, status, provider_response)
values ('$A','$D',1500,'0788000111','UMP-TEST-1','success','{"payer_secret":"SECRET-PAYLOAD"}');
do \$\$ begin
  if exists (select 1 from information_schema.columns where table_name = 'transactions' and column_name = 'webhook_payload') then
    execute \$q\$update public.transactions set webhook_payload = '{"payer_secret":"SECRET-PAYLOAD"}' where reference = 'UMP-TEST-1'\$q\$;
  end if;
end \$\$;
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
ex() { as_user "$1" "select public.export_my_data()::text;"; }
EXA=$(ex $A)
j() { echo "$EXA" | python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

echo "export_my_data tests"
check "Aline gets her account (email, phone, name, role)" "$(j "d['account']['email'], d['account']['phone'], d['account']['details_you_gave']['full_name'], d['role']")" "aline@keplercollege.ac.rw 250788000111 Aline Uwase student"
check "profile, interests, saved, likes, comment" "$(j "d['student_profile']['display_name'], d['interests'], d['saved'][0]['deal'], d['likes'][0]['deal'], d['comments'][0]['text']")" "Aline U ['pizza'] Rolex Rolex Is it spicy?"
check "payments: amount and reference, without the provider's payload" "$(j "d['payments'][0]['amount'], d['payments'][0]['reference'], 'provider_response' in d['payments'][0], 'webhook_payload' in d['payments'][0]")" "1500 UMP-TEST-1 False False"
check "orders, pickup codes, reviews" "$(j "d['orders'][0]['deal'], d['orders'][0]['status'], d['pickup_codes'][0]['code'], d['reviews'][0]['review']")" "Rolex redeemed 4821 Great"
check "friends and people she blocked, by name" "$(j "d['friends'][0]['name'], d['people_you_blocked'][0]['name']")" "Fred M Kevin N"
check "a chat message she received, with who sent it" "$(j "d['chat_messages'][0]['direction'], d['chat_messages'][0]['other_person'], d['chat_messages'][0]['message']")" "received Fred M See you at lunch"
check "alerts and phones with alerts on (device only)" "$(j "d['alerts'][0]['message'], d['phones_with_alerts_on']")" "Mama Rose replied to your comment [{'device': 'Android Chrome', 'added_at': $(j "repr(d['phones_with_alerts_on'][0]['added_at'])")}]"
check "reports she filed, not the one filed against her" "$(j "len(d['reports_you_filed']), d['reports_you_filed'][0]['details']")" "1 He spams me"
check "no password, alert keys, payment payload or the private report" "$(for s in SECRET-HASH SECRET-ENDPOINT SECRET-P256 SECRET-AUTH SECRET-PAYLOAD 'Fred reports Aline'; do echo "$EXA" | grep -c -- "$s"; done | tr '\n' ' ')" "0 0 0 0 0 0 "
check "no one else's email" "$(echo "$EXA" | grep -c 'fred@keplercollege\|kevin@keplercollege\|m@shop.rw')" "0"
check "photos listed" "$(j "sorted(d['photos'].keys())")" "['profile_photo', 'review_photos', 'story_photos']"
check "Fred's export has his own things, not Aline's account" "$(ex $F | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['account']['email'], d['chat_messages'][0]['direction'], 'aline@' in json.dumps(d))")" "fred@keplercollege.ac.rw sent False"
check "visitors can't call it" "$("${PSQL[@]}" -At -c "set role anon; select public.export_my_data();" 2>&1 | grep -o 'permission denied.*' | head -1)" "permission denied for function export_my_data"
check "definer with an empty search path" "$(q "select prosecdef || ' ' || array_to_string(proconfig, ',') from pg_proc where proname = 'export_my_data'")" 'true search_path=""'

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
