#!/usr/bin/env bash
# Local Postgres test for migration 20261003200000_enforce_bans (P4).
# Applies the REAL P1 (20261003190000) and P4 migrations on stub versions of the
# tables they touch, then checks backfill, flag integrity, admin functions and
# enforcement on every protected write, including inside a SECURITY DEFINER
# function (where RLS would not apply).
#
# Usage: bash supabase/tests/ban_enforcement.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$REPO/supabase/migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/ban-test.XXXXXX)"
PORT="${PGPORT_TEST:-54332}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }

BANNED=00000000-0000-0000-0000-0000000000b0   # banned before the migration (legacy flag)
OK=00000000-0000-0000-0000-0000000000a1
LATER=00000000-0000-0000-0000-0000000000a2    # banned later via admin_ban_user
ADMIN=00000000-0000-0000-0000-0000000000ad

# --- Stubs ---------------------------------------------------------------------
"${PSQL[@]}" <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (id uuid primary key, email varchar(255), created_at timestamptz default now(),
  raw_user_meta_data jsonb default '{}'::jsonb, raw_app_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.user_roles (user_id uuid primary key, role text);
create function public.is_admin() returns boolean language sql stable security definer
  as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') $$;
grant execute on function public.is_admin() to authenticated;
create table public.student_profiles (user_id uuid primary key, university text not null);
create table public.merchant_profiles (id uuid primary key, approved boolean);
create table public.chat_messages (id serial primary key, sender_id uuid, receiver_id uuid, message text);
create table public.friend_requests (id serial primary key, sender_id uuid, receiver_id uuid);
create table public.message_requests (id serial primary key, sender_id uuid, receiver_id uuid);
create table public.merchant_stories (id serial primary key, merchant_id uuid);
create table public.student_stories (id serial primary key, student_id uuid);
create table public.orders (id serial primary key, student_id uuid, dispute_status text,
  dispute_raised_at timestamptz, dispute_resolution_note text);
create table public.group_orders (id serial primary key, created_by uuid);
create table public.group_order_members (id serial primary key, student_id uuid);
grant select, insert, update on all tables in schema public to authenticated;
grant usage on all sequences in schema public to authenticated;
-- Stand-in for send_friend_request: SECURITY DEFINER, so RLS would not apply.
create function public.send_friend_request_stub(p_to uuid) returns void language plpgsql security definer
  as $$ begin insert into public.friend_requests (sender_id, receiver_id) values (auth.uid(), p_to); end $$;
grant execute on function public.send_friend_request_stub(uuid) to authenticated;
SQL

q "insert into auth.users (id, email, raw_user_meta_data) values
  ('$BANNED', 'banned@keplercollege.ac.rw', '{\"banned\": true, \"student_id\": \"K-B\"}'),
  ('$OK',     'ok@keplercollege.ac.rw',     '{\"banned\": false, \"student_id\": \"K-OK\"}'),
  ('$LATER',  'shop@gmail.com',             '{}'),
  ('$ADMIN',  'admin@keplercollege.ac.rw',  '{}');
  insert into public.user_roles values ('$BANNED','student'), ('$OK','student'), ('$LATER','merchant'), ('$ADMIN','admin');
  insert into public.merchant_profiles values ('$LATER', true);
  insert into public.orders (student_id) values ('$BANNED'), ('$OK');"

"${PSQL[@]}" -f "$MIG/20261003190000_server_owned_verified_identity.sql" 2>&1 | grep -v NOTICE || true
"${PSQL[@]}" -f "$MIG/20261003200000_enforce_bans.sql" 2>&1 | grep -v NOTICE || true

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
as_user() { # $1 user id ('' = service role, i.e. no JWT), $2 SQL → last line of output or error
  local role=authenticated; [ -z "$1" ] && role=postgres
  local out
  out=$({ "${PSQL[@]}" -At 2>&1 || true; } <<SQL

set role $role;
select set_config('request.jwt.claim.sub', '$1', false) \\gset
$2
SQL
)
  # Prefer the ERROR line (CONTEXT blocks can span several lines), else the last result line.
  if echo "$out" | grep -q 'ERROR:'; then
    echo "$out" | grep 'ERROR:' | head -1 | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//'
  else
    echo "$out" | grep -vE '^$|^SET$' | tail -1
  fi
}
SUSPENDED="Your account is suspended. Contact support."

echo "ban enforcement tests"

# Backfill and flag integrity
check "backfill: legacy user_metadata ban moved to app_metadata" "$(q "select raw_app_meta_data->>'banned' from auth.users where id='$BANNED'")" "true"
check "backfill: user-editable copy removed (banned user)" "$(q "select (raw_user_meta_data ? 'banned')::text from auth.users where id='$BANNED'")" "false"
check "backfill: user-editable copy removed (banned=false user)" "$(q "select (raw_user_meta_data ? 'banned')::text from auth.users where id='$OK'")" "false"
check "backfill: unbanned user not banned" "$(q "select public.is_banned('$OK')::text")" "false"
check "P1 values still intact after P4" "$(q "select raw_app_meta_data->>'university' || '|' || (raw_app_meta_data->>'student_id') from auth.users where id='$BANNED'")" "Kepler College|K-B"
q "update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"banned\": false}' where id='$BANNED'"
check "banned user clearing user_metadata.banned stays banned" "$(q "select public.is_banned('$BANNED')::text")" "true"
q "update auth.users set raw_app_meta_data = '{\"provider\":\"email\"}' where id='$BANNED'"
check "auth-server app_metadata rewrite keeps the ban" "$(q "select public.is_banned('$BANNED')::text")" "true"

# Enforcement for the banned user
check "banned: send chat message"     "$(as_user $BANNED "insert into public.chat_messages (sender_id, receiver_id, message) values ('$BANNED', '$OK', 'hi');")" "$SUSPENDED"
check "banned: friend request via SECURITY DEFINER RPC" "$(as_user $BANNED "select public.send_friend_request_stub('$OK');")" "$SUSPENDED"
check "banned: message request"       "$(as_user $BANNED "insert into public.message_requests (sender_id, receiver_id) values ('$BANNED', '$OK');")" "$SUSPENDED"
check "banned: student story"         "$(as_user $BANNED "insert into public.student_stories (student_id) values ('$BANNED');")" "$SUSPENDED"
check "banned: raise dispute"         "$(as_user $BANNED "update public.orders set dispute_status='open', dispute_raised_at=now() where student_id='$BANNED';")" "$SUSPENDED"
check "banned: start group order"     "$(as_user $BANNED "insert into public.group_orders (created_by) values ('$BANNED');")" "$SUSPENDED"
check "banned: join group order"      "$(as_user $BANNED "insert into public.group_order_members (student_id) values ('$BANNED');")" "$SUSPENDED"
check "banned: nothing was written"   "$(q "select (select count(*) from public.chat_messages) + (select count(*) from public.friend_requests) + (select count(*) from public.message_requests) + (select count(*) from public.student_stories) + (select count(*) from public.group_orders) + (select count(*) from public.group_order_members) + (select count(*) from public.orders where dispute_raised_at is not null)")" "0"

# Service role (Edge Functions: no JWT) can still write system messages
check "service role can still post system chat messages" "$(as_user '' "insert into public.chat_messages (sender_id, receiver_id, message) values ('$LATER', '$BANNED', 'Your order was declined') returning 'ok';")" "ok"

# Normal user unaffected
check "normal: send chat message"   "$(as_user $OK "insert into public.chat_messages (sender_id, receiver_id, message) values ('$OK', '$BANNED', 'hi') returning 'ok';")" "ok"
check "normal: friend request via RPC" "$(as_user $OK "select 'ok' from public.send_friend_request_stub('$BANNED');")" "ok"
check "normal: raise dispute"       "$(as_user $OK "update public.orders set dispute_status='open', dispute_raised_at=now() where student_id='$OK' returning 'ok';")" "ok"

# Admin ban / unban
check "non-admin cannot ban" "$(as_user $OK "select public.admin_ban_user('$LATER');")" "Only admins can perform this action"
as_user $ADMIN "select public.admin_ban_user('$LATER');" >/dev/null
check "admin_ban_user writes app_metadata" "$(q "select public.is_banned('$LATER')::text")" "true"
check "banned merchant: post story" "$(as_user $LATER "insert into public.merchant_stories (merchant_id) values ('$LATER');")" "$SUSPENDED"
check "get_all_merchants shows banned" "$(as_user $ADMIN "select banned::text from public.get_all_merchants() where id='$LATER';")" "true"
check "get_all_students shows banned" "$(as_user $ADMIN "select (e->>'banned') from jsonb_array_elements(public.get_all_students()) e where e->>'id'='$BANNED';")" "true"
as_user $ADMIN "select public.admin_unban_user('$LATER');" >/dev/null
check "admin_unban_user lifts the ban" "$(q "select public.is_banned('$LATER')::text")" "false"
q "update auth.users set raw_app_meta_data = '{\"provider\":\"email\"}' where id='$LATER'"
check "unban not resurrected by an app_metadata rewrite" "$(q "select public.is_banned('$LATER')::text")" "false"
check "unbanned merchant can post story" "$(as_user $LATER "insert into public.merchant_stories (merchant_id) values ('$LATER') returning 'ok';")" "ok"
check "admin can still resolve a banned user's dispute" "$(as_user '' "update public.orders set dispute_status='resolved' where student_id='$OK' returning 'ok';")" "ok"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
