#!/usr/bin/env bash
# Local Postgres test for migration 20261009090000_rls_initplan_and_fk_indexes.
# Builds the database from every earlier migration, records every access rule,
# applies the migration, and proves each rule changed only by wrapping
# auth.uid() as (SELECT auth.uid()). Then runs it again (nothing to change)
# and checks the new indexes.
#
# Usage: bash supabase/tests/rls_initplan.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/rls-initplan-test.XXXXXX)"
PORT="${PGPORT_TEST:-54351}"
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
NEW="$REPO/supabase/migrations/20261009090000_rls_initplan_and_fk_indexes.sql"
# Every earlier migration, in order (MAINTAIN is a Postgres 17 privilege; local is 16).
for f in "$REPO"/supabase/migrations/*.sql; do
  [ "$f" = "$NEW" ] && continue
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; exit 1; }
done

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }

SNAP="select tablename||'.'||policyname||'|'||cmd||'|'||coalesce(qual,'∅')||'|'||coalesce(with_check,'∅') from pg_policies where schemaname='public' order by 1"
q "create table public._before as select tablename, policyname, cmd, roles, permissive, qual, with_check from pg_policies where schemaname='public'"
before_slow=$(q "select count(*) from pg_policies where schemaname='public' and (coalesce(qual,'') ~ '(?<!SELECT )auth\.uid\(\)' or coalesce(with_check,'') ~ '(?<!SELECT )auth\.uid\(\)')")
echo "rls_initplan tests ($before_slow slow rules in the local build)"
check "the local build has slow rules to fix" "$([ "$before_slow" -gt 0 ] && echo yes)" "yes"

out=$("${PSQL[@]}" -f "$NEW" 2>&1 | grep -o 'access rules made faster: [0-9]*')
check "migration rewrites every slow rule" "$out" "access rules made faster: $before_slow"
check "no slow rule left" "$(q "select count(*) from pg_policies where schemaname='public' and (coalesce(qual,'') ~ '(?<!SELECT )auth\.uid\(\)' or coalesce(with_check,'') ~ '(?<!SELECT )auth\.uid\(\)')")" "0"
check "same number of rules" "$(q "select count(*) from pg_policies where schemaname='public'")" "$(q "select count(*) from public._before")"
diff=$(q "select count(*) from public._before b join pg_policies a on a.schemaname='public' and a.tablename=b.tablename and a.policyname=b.policyname
  where a.cmd is distinct from b.cmd or a.roles is distinct from b.roles or a.permissive is distinct from b.permissive
     or regexp_replace(coalesce(a.qual,''), '\( SELECT auth\.uid\(\) AS uid\)', 'auth.uid()', 'g') is distinct from coalesce(b.qual,'')
     or regexp_replace(coalesce(a.with_check,''), '\( SELECT auth\.uid\(\) AS uid\)', 'auth.uid()', 'g') is distinct from coalesce(b.with_check,'')")
check "every rule is the same apart from the (SELECT auth.uid()) wrapper (command, roles, logic)" "$diff" "0"
check "rules that were already fast are untouched" "$(q "select count(*) from public._before b join pg_policies a using (tablename, policyname) where a.schemaname='public' and (coalesce(b.qual,'')||coalesce(b.with_check,'')) ~ 'SELECT auth\.uid\(\)' and (a.qual is distinct from b.qual or a.with_check is distinct from b.with_check)")" "0"

out2=$("${PSQL[@]}" -f "$NEW" 2>&1 | grep -o 'access rules made faster: [0-9]*')
check "running it again changes nothing" "$out2" "access rules made faster: 0"

# Behaviour spot-check: a student sees only their own orders, a business only its own.
S1=00000000-0000-0000-0000-00000000a001; S2=00000000-0000-0000-0000-00000000a002; M1=00000000-0000-0000-0000-00000000b001
q "insert into auth.users (id) values ('$S1'),('$S2'),('$M1') on conflict do nothing" >/dev/null
if q "select 1 from information_schema.tables where table_schema='public' and table_name='orders'" | grep -q 1; then
  q "insert into public.deals (id, merchant_id, title, business_name, price) values ('00000000-0000-0000-0000-0000000000d1', '$M1', 'Chips', 'Mr. Chips', 1000) on conflict do nothing" >/dev/null 2>&1 || true
  q "insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline) values
     ('00000000-0000-0000-0000-0000000000e1','$S1','$M1','00000000-0000-0000-0000-0000000000d1',1,1000,1000,'paid',now()),
     ('00000000-0000-0000-0000-0000000000e2','$S2','$M1','00000000-0000-0000-0000-0000000000d1',1,1000,1000,'paid',now())" >/dev/null 2>&1 || true
  check "student 1 sees only their order" "$(as_user $S1 "select count(*) from public.orders;")" "1"
  check "business sees both orders for its deal" "$(as_user $M1 "select count(*) from public.orders;")" "2"
fi

idx=$(q "select count(*) from pg_indexes where schemaname='public' and indexname like 'idx\_%' and indexname in (
  'idx_activity_logs_admin_id','idx_chat_messages_deal_id','idx_chat_messages_receiver_id','idx_deals_merchant_id','idx_group_order_members_student_id',
  'idx_group_orders_created_by','idx_group_orders_deal_id','idx_merchant_stories_merchant_id','idx_notifications_deal_id','idx_orders_dispute_raised_by',
  'idx_ratings_student_id','idx_redemptions_deal_id','idx_redemptions_student_id','idx_redemptions_transaction_id','idx_student_reports_reviewed_by',
  'idx_student_reports_story_id','idx_system_settings_updated_by','idx_transactions_deal_id','idx_user_notifications_actor_id')")
expected=$(q "select count(*) from (values ('activity_logs','admin_id'),('chat_messages','deal_id'),('chat_messages','receiver_id'),('deals','merchant_id'),('group_order_members','student_id'),('group_orders','created_by'),('group_orders','deal_id'),('merchant_stories','merchant_id'),('notifications','deal_id'),('orders','dispute_raised_by'),('ratings','student_id'),('redemptions','deal_id'),('redemptions','student_id'),('redemptions','transaction_id'),('student_reports','reviewed_by'),('student_reports','story_id'),('system_settings','updated_by'),('transactions','deal_id'),('user_notifications','actor_id')) v(t,c) join information_schema.columns ic on ic.table_schema='public' and ic.table_name=v.t and ic.column_name=v.c")
check "an index for every link that exists locally ($expected of 19)" "$idx" "$expected"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
