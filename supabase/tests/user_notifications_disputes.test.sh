#!/usr/bin/env bash
# Local Postgres test for migration 20261003210000_user_notifications_and_dispute_alerts (N3b).
# Applies the REAL migrations for roles, orders, disputes and the social schema
# on stub Supabase auth, seeds data (including a real friend request) BEFORE the
# rename, applies N3b, then checks: zero data loss, renamed objects, existing
# RPCs still working, and dispute notifications via the real RPCs.
#
# Usage: bash supabase/tests/user_notifications_disputes.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
M="$REPO/supabase/migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/n3b-test.XXXXXX)"
PORT="${PGPORT_TEST:-54334}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }
as_user() { # $1 user id, $2 SQL → ERROR line or last result line
  local out
  out=$({ "${PSQL[@]}" -At 2>&1 || true; } <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '$1', false) \\gset
$2
SQL
)
  if echo "$out" | grep -q 'ERROR:'; then echo "$out" | grep 'ERROR:' | head -1 | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//'
  else echo "$out" | grep -vE '^$|^SET$' | tail -1 || true; fi
}

# --- Supabase stubs ------------------------------------------------------------
"${PSQL[@]}" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb, created_at timestamptz default now());
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.deals (id uuid primary key, merchant_id uuid, title text);
SQL

# --- Real migrations (pre-N3b state) -------------------------------------------
for f in 20260914000000_create_trusted_user_roles 20260915073805_create_orders 20260927160000_add_dispute_record \
         20260917130000_create_student_profiles 20260918120000_add_social_activity_functions; do
  "${PSQL[@]}" -f "$M/$f.sql" >/dev/null 2>&1
done

A=00000000-0000-0000-0000-0000000000a1   # student who orders and disputes
B=00000000-0000-0000-0000-0000000000a2   # another student
MER=00000000-0000-0000-0000-0000000000b1
AD1=00000000-0000-0000-0000-0000000000d1
AD2=00000000-0000-0000-0000-0000000000d2
DEAL=00000000-0000-0000-0000-00000000de01
ORD=00000000-0000-0000-0000-00000000cafe

# Users (the real role trigger assigns student/merchant; admins set directly)
q "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@keplercollege.ac.rw','{\"role\":\"student\"}'), ('$B','b@keplercollege.ac.rw','{\"role\":\"student\"}'),
  ('$MER','m@gmail.com','{\"role\":\"merchant\"}'), ('$AD1','ad1@x.rw','{\"role\":\"student\"}'), ('$AD2','ad2@x.rw','{\"role\":\"student\"}');
  update public.user_roles set role='admin' where user_id in ('$AD1','$AD2');
  insert into public.deals values ('$DEAL','$MER','Chips + soda combo');
  insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline)
  values ('$ORD','$A','$MER','$DEAL',1,1500,1500,'paid',now());
  insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus)
  values ('$A','aline','Aline','Kepler College','Kinyinya',true), ('$B','kevin','Kevin','Kepler College','Kinyinya',true);"

# Seed notifications BEFORE the rename: two direct rows + one via the real RPC.
q "insert into public.social_notifications (user_id, type, message) values
  ('$A','friend_request','old row 1'), ('$B','message_request','old row 2');"
as_user $A "select public.send_friend_request('$B');" >/dev/null
BEFORE=$(q "select count(*) from public.social_notifications")
BEFORE_IDS=$(q "select string_agg(id::text, ',' order by id) from public.social_notifications")

# --- Apply N3b ------------------------------------------------------------------
"${PSQL[@]}" -f "$M/20261003210000_user_notifications_and_dispute_alerts.sql" >/dev/null

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }

echo "N3b tests"
echo " rename"
check "row count preserved ($BEFORE rows)" "$(q "select count(*) from public.user_notifications")" "$BEFORE"
check "same row ids preserved" "$(q "select string_agg(id::text, ',' order by id) from public.user_notifications")" "$BEFORE_IDS"
check "old table name gone" "$(q "select (to_regclass('public.social_notifications') is null)::text")" "true"
check "no constraint/index still named social_notifications*" "$(q "select count(*) from pg_class where relname like 'social_notifications%'") $(q "select count(*) from pg_constraint where conname like 'social_notifications%'")" "0 0"
check "indexes renamed" "$(q "select string_agg(indexname, ',' order by indexname) from pg_indexes where tablename='user_notifications'")" "user_notifications_created_idx,user_notifications_pkey,user_notifications_unread_idx,user_notifications_user_idx"
check "policies renamed" "$(q "select string_agg(policyname, ',' order by policyname) from pg_policies where tablename='user_notifications'")" "users_update_own_notifications,users_view_own_notifications"
check "no function body references social_notifications" "$(q "select count(*) from pg_proc where prosrc like '%social_notifications%'")" "0"
check "link_path column added" "$(q "select count(*) from information_schema.columns where table_name='user_notifications' and column_name='link_path'")" "1"

echo " existing RPCs still work after the rename"
REQ=$(q "select id from public.friend_requests where sender_id='$A' and receiver_id='$B' and status='pending'")
as_user $B "select public.accept_friend_request('$REQ');" >/dev/null
check "accept_friend_request (recompiled) writes to user_notifications" "$(q "select count(*) from public.user_notifications where user_id='$A' and type='friend_request_accepted'")" "1"
check "get_social_activity (recompiled) reads it" "$(as_user $A "select (public.get_social_activity()::jsonb -> 'notifications' -> 0 ->> 'type');")" "friend_request_accepted"
check "RLS: a student sees only their own rows" "$(as_user $B "select count(*) from public.user_notifications where user_id <> '$B';")" "0"

echo " dispute raised (real raise_order_dispute RPC)"
as_user $A "select public.raise_order_dispute('$ORD', 'quality_issue', 'Chips were cold');" >/dev/null
check "both admins notified" "$(q "select count(*) from public.user_notifications where type='dispute_raised' and user_id in ('$AD1','$AD2') and reference_id='$ORD'")" "2"
check "merchant notified" "$(q "select count(*) from public.user_notifications where type='dispute_raised' and user_id='$MER'")" "1"
check "no one else notified on raise" "$(q "select count(*) from public.user_notifications where type='dispute_raised'")" "3"
check "admin link_path" "$(q "select distinct link_path from public.user_notifications where type='dispute_raised' and user_id='$AD1'")" "/dashboard/disputes"
check "merchant link_path" "$(q "select link_path from public.user_notifications where type='dispute_raised' and user_id='$MER'")" "/dashboard/orders"
check "admin message names order, deal and reason" "$(q "select message from public.user_notifications where type='dispute_raised' and user_id='$AD1'")" "New dispute on order 00000000 (Chips + soda combo): quality issue."

echo " dispute status changes (real resolve_order_dispute RPC)"
as_user $AD1 "select public.resolve_order_dispute('$ORD', 'under_review', null);" >/dev/null
check "under_review: student + merchant notified" "$(q "select string_agg(user_id::text, ',' order by user_id) from public.user_notifications where type='dispute_status_changed'")" "$A,$MER"
as_user $AD1 "select public.resolve_order_dispute('$ORD', 'resolved', 'Refund sent via MoMo');" >/dev/null
check "resolved: 2 more notifications (4 total)" "$(q "select count(*) from public.user_notifications where type='dispute_status_changed'")" "4"
check "student message includes status and note" "$(q "select message from public.user_notifications where type='dispute_status_changed' and user_id='$A' order by created_at desc, message limit 1")" "The dispute on order 00000000 (Chips + soda combo) was resolved. Note: Refund sent via MoMo"
check "student link opens Order History" "$(q "select distinct link_path from public.user_notifications where type='dispute_status_changed' and user_id='$A'")" "/dashboard/profile?view=orders"
check "actor is the resolving admin" "$(q "select distinct actor_id from public.user_notifications where type='dispute_status_changed'")" "$AD1"
check "admins not notified of their own resolution" "$(q "select count(*) from public.user_notifications where type='dispute_status_changed' and user_id in ('$AD1','$AD2')")" "0"

echo "  dashboard bell can read them (fix 5: merchants and admins)"
check "merchant reads its own dispute alerts" "$(as_user $MER "select count(*) from public.user_notifications where user_id='$MER';")" "3"
check "admin reads its own dispute alerts" "$(as_user $AD1 "select count(*) from public.user_notifications where user_id='$AD1';")" "1"
check "merchant can't read the admin's rows" "$(as_user $MER "select count(*) from public.user_notifications where user_id='$AD1';")" "0"
check "merchant marks its alerts read" "$(as_user $MER "update public.user_notifications set is_read = true where user_id='$MER' and is_read = false returning 1;" >/dev/null; q "select count(*) from public.user_notifications where user_id='$MER' and not is_read")" "0"
check "student can mark own dispute notifications read" "$(as_user $A "update public.user_notifications set is_read = true where user_id='$A' and type like 'dispute_%' returning 'ok';" )" "ok"

echo " no noise"
BEFORE_N=$(q "select count(*) from public.user_notifications")
q "update public.orders set status='redeemed', updated_at=now() where id='$ORD'"
check "ordinary order updates create no notifications" "$(q "select count(*) from public.user_notifications")" "$BEFORE_N"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
