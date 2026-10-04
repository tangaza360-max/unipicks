#!/usr/bin/env bash
# Local Postgres test for migration 20261004100000_add_push_subscriptions.
# Applies the REAL user_roles migration and the push migration on stub
# Supabase auth, then checks: saving through the RPC, input checks, own-rows-only
# access, a phone moving to a new user, the 10-phone cap, and cleanup when an
# account is deleted (user_roles row removed).
#
# Usage: bash supabase/tests/push_subscriptions.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
M="$REPO/supabase/migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/push-test.XXXXXX)"
PORT="${PGPORT_TEST:-54336}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }
as_role() { # $1 role, $2 user id, $3 SQL → ERROR line or last result line
  local out
  out=$({ "${PSQL[@]}" -At 2>&1 || true; } <<SQL
set role $1;
select set_config('request.jwt.claim.sub', '$2', false) \\gset
$3
SQL
)
  if echo "$out" | grep -q 'ERROR:'; then echo "$out" | grep 'ERROR:' | head -1 | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//'
  else echo "$out" | grep -vE '^$|^SET$' | tail -1 || true; fi
}
as_user() { as_role authenticated "$1" "$2"; }

PASS=0; FAIL=0
check() { # $1 label, $2 expected, $3 actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "  ok   $1"
  else FAIL=$((FAIL+1)); echo "  FAIL $1: expected [$2], got [$3]"; fi
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
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
SQL

"${PSQL[@]}" -f "$M/20260914000000_create_trusted_user_roles.sql" >/dev/null 2>&1
"${PSQL[@]}" -f "$M/20261004100000_add_push_subscriptions.sql" >/dev/null

A=00000000-0000-0000-0000-0000000000a1
B=00000000-0000-0000-0000-0000000000a2
q "insert into auth.users (id, email, raw_user_meta_data) values
  ('$A','a@keplercollege.ac.rw','{\"role\":\"student\"}'), ('$B','m@gmail.com','{\"role\":\"merchant\"}');"
check "user_roles rows exist (real role trigger)" "2" "$(q "select count(*) from public.user_roles")"

EP=https://fcm.googleapis.com/fcm/send/phone-1
echo "Saving"
ID=$(as_user $A "select public.save_push_subscription('$EP','key1','auth1','Chrome Android');")
check "A saves a phone (returns id)" "36" "${#ID}"
check "row belongs to A" "$A" "$(q "select user_id from public.push_subscriptions where endpoint='$EP'")"
as_user $A "select public.save_push_subscription('$EP','key2','auth2','Chrome Android');" >/dev/null
check "saving again updates, no duplicate" "1|key2" "$(q "select count(*), max(p256dh) from public.push_subscriptions")"

echo "Input checks"
check "anon cannot call it" "permission denied for function save_push_subscription" \
  "$(as_role anon '' "select public.save_push_subscription('$EP','k','a');")"
check "signed-in role without a user → refused" "Not signed in" \
  "$(as_user '' "select public.save_push_subscription('$EP','k','a');")"
check "http endpoint refused" "Invalid push subscription" "$(as_user $A "select public.save_push_subscription('http://x.example/1','k','a');")"
check "empty key refused" "Invalid push subscription" "$(as_user $A "select public.save_push_subscription('https://x.example/1','','a');")"
check "very long endpoint refused" "Invalid push subscription" \
  "$(as_user $A "select public.save_push_subscription('https://x.example/' || repeat('a',1000),'k','a');")"

echo "Own rows only"
check "A sees own row" "1" "$(as_user $A "select count(*) from public.push_subscriptions;")"
check "B sees nothing of A" "0" "$(as_user $B "select count(*) from public.push_subscriptions;")"
check "B cannot insert directly" "permission denied for table push_subscriptions" \
  "$(as_user $B "insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('$B','https://x.example/2','k','a');")"
check "B cannot update directly" "permission denied for table push_subscriptions" \
  "$(as_user $B "update public.push_subscriptions set user_id='$B';")"
as_user $B "delete from public.push_subscriptions;" >/dev/null
check "B's delete does not touch A's row" "1" "$(q "select count(*) from public.push_subscriptions where user_id='$A'")"
check "anon sees nothing" "permission denied for table push_subscriptions" "$(as_role anon '' "select count(*) from public.push_subscriptions;")"

echo "Same phone, new user"
as_user $B "select public.save_push_subscription('$EP','key3','auth3','Chrome Android');" >/dev/null
check "phone moved to B" "$B|1" "$(q "select user_id, count(*) over () from public.push_subscriptions where endpoint='$EP'")"
check "A no longer has it" "0" "$(as_user $A "select count(*) from public.push_subscriptions;")"

echo "10-phone cap"
for i in $(seq 1 12); do as_user $A "select public.save_push_subscription('https://x.example/a$i','k','a');" >/dev/null; done
check "A keeps 10 phones" "10" "$(q "select count(*) from public.push_subscriptions where user_id='$A'")"
check "oldest two dropped" "0" "$(q "select count(*) from public.push_subscriptions where endpoint in ('https://x.example/a1','https://x.example/a2')")"
check "newest kept" "1" "$(q "select count(*) from public.push_subscriptions where endpoint='https://x.example/a12'")"

echo "Account deletion"
as_user $A "delete from public.push_subscriptions where endpoint='https://x.example/a12';" >/dev/null
check "A deletes own phone (log out)" "9" "$(q "select count(*) from public.push_subscriptions where user_id='$A'")"
q "delete from public.user_roles where user_id='$A'"
check "role removed → A's phones removed" "0" "$(q "select count(*) from public.push_subscriptions where user_id='$A'")"
check "B's phone kept" "1" "$(q "select count(*) from public.push_subscriptions where user_id='$B'")"
q "delete from auth.users where id='$B'"
check "auth user deleted → cascade" "0" "$(q "select count(*) from public.push_subscriptions")"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
