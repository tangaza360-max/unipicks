#!/usr/bin/env bash
# Local Postgres test for migration 20261006090000_fix_private_social_functions.
# Production keeps the real friend / message-request code in a `private`
# schema; this rebuilds that shape (a public wrapper calling a private
# function that still writes to the old social_notifications name), applies
# the migration, and checks the function now writes to user_notifications,
# keeps its settings (security definer, grants), and that the migration is
# safe to run twice and where no private schema exists.
#
# Usage: bash supabase/tests/private_social_functions.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/private-social-test.XXXXXX)"
PORT="${PGPORT_TEST:-54343}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }
M="$REPO/supabase/migrations/20261006090000_fix_private_social_functions.sql"

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }

echo "no private schema (local databases)"
"${PSQL[@]}" -f "$M" >/dev/null && check "runs without error" "ok" "ok"

echo "production shape"
"${PSQL[@]}" >/dev/null <<'SQL'
create role authenticated nologin;
create table public.user_notifications (id serial primary key, user_id uuid, type text, message text);
create schema private;
create function private.send_friend_request(target_student uuid) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.social_notifications (user_id, type, message)
  values (target_student, 'friend_request', 'Someone sent you a friend request.');
end;
$$;
revoke all on function private.send_friend_request(uuid) from public;
grant execute on function private.send_friend_request(uuid) to authenticated;
create function public.send_friend_request(target_student uuid) returns void
language sql security definer as $$ select private.send_friend_request(target_student); $$;
create function private.untouched() returns int language sql as $$ select 1 $$;
SQL
check "before the fix: the old table name makes it fail" \
  "$("${PSQL[@]}" -At -c "select public.send_friend_request('00000000-0000-0000-0000-000000000001');" 2>&1 | grep -o 'relation "public.social_notifications" does not exist' | head -1)" \
  'relation "public.social_notifications" does not exist'

"${PSQL[@]}" -f "$M" >/dev/null
check "private function now uses user_notifications" "$(q "select strpos(prosrc,'social_notifications')=0 and strpos(prosrc,'public.user_notifications')>0 from pg_proc where proname='send_friend_request' and pronamespace='private'::regnamespace")" "t"
q "select public.send_friend_request('00000000-0000-0000-0000-000000000001');" >/dev/null
check "Add Friend works and writes the notification" "$(q "select count(*) || '|' || max(type) from public.user_notifications")" "1|friend_request"
check "still security definer" "$(q "select prosecdef from pg_proc where proname='send_friend_request' and pronamespace='private'::regnamespace")" "t"
check "grants kept (signed-in users only)" "$(q "select has_function_privilege('authenticated','private.send_friend_request(uuid)','execute')::text || '|' || has_function_privilege('public','private.send_friend_request(uuid)','execute')::text")" "true|false"
check "other private functions untouched" "$(q "select private.untouched()")" "1"
"${PSQL[@]}" -f "$M" >/dev/null && check "running it again is safe" "ok" "ok"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
