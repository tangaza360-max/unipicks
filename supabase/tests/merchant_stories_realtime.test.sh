#!/usr/bin/env bash
# Local Postgres test for migration 20261005130000_merchant_stories_realtime:
# merchant_stories is in the Realtime publication, the migration can run twice,
# and the tables that were already live stay live.
#
# Usage: bash supabase/tests/merchant_stories_realtime.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/realtime-test.XXXXXX)"
PORT="${PGPORT_TEST:-54342}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }

"${PSQL[@]}" >/dev/null <<'SQL'
create publication supabase_realtime;
create table public.orders (id int primary key);
create table public.merchant_stories (id int primary key);
alter publication supabase_realtime add table public.orders;
SQL

M="$REPO/supabase/migrations/20261005130000_merchant_stories_realtime.sql"
"${PSQL[@]}" -f "$M" >/dev/null
check "merchant_stories is live" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='merchant_stories'")" "1"
check "orders is still live" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='orders'")" "1"
"${PSQL[@]}" -f "$M" >/dev/null && check "running it again is safe" "ok" "ok"
check "still exactly one entry" "$(q "select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='merchant_stories'")" "1"

q "drop publication supabase_realtime;"
"${PSQL[@]}" -f "$M" >/dev/null && check "no publication (local database): no error" "ok" "ok"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
