#!/usr/bin/env bash
# Local Postgres test for orders.ready_at (migration 20261007090000).
#
# "Food ready" is set only by the update-order-status function (service
# role). Checks that students and businesses cannot set it themselves, and
# that a ready order can still be collected with its pickup code.
#
# Usage: bash supabase/tests/order_ready_at.test.sh
# Needs: Postgres 16 server binaries (initdb/pg_ctl) and psql. Run as a
# non-root user, or as root with a `postgres` system user available.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$REPO/supabase/migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/ready-test.XXXXXX)"
PORT="${PGPORT_TEST:-54331}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }

cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)

# --- Supabase stubs ---------------------------------------------------------
"${PSQL[@]}" <<'SQL'
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
-- Supabase grants all table privileges to these roles by default.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.deals (id uuid primary key, merchant_id uuid references auth.users(id), title text);
alter table public.deals enable row level security;
create policy deals_read on public.deals for select using (true);
SQL

# --- Real migrations ----------------------------------------------------------
"${PSQL[@]}" -f "$MIG/20260915073805_create_orders.sql"
"${PSQL[@]}" -f "$MIG/20260830074154_add_redemptions.sql"
"${PSQL[@]}" -c "alter table public.redemptions drop constraint redemptions_status_check;
  alter table public.redemptions add constraint redemptions_status_check
    check (status = any (array['pending','redeemed','confirmed','failed']));
  alter table public.redemptions add column order_id uuid references public.orders(id) on delete set null;"
"${PSQL[@]}" -f "$MIG/20261003145500_revoke_student_redemption_insert.sql"
"${PSQL[@]}" -f "$MIG/20261003170000_add_redeem_pickup_code_rpc.sql"
"${PSQL[@]}" -f "$MIG/20261007090000_order_ready_at.sql"
"${PSQL[@]}" -f "$MIG/20261007090000_order_ready_at.sql"   # runs twice safely

# --- Fixtures -----------------------------------------------------------------
MERCHANT=00000000-0000-0000-0000-0000000000b1
OTHER_MERCHANT=00000000-0000-0000-0000-0000000000b2
STUDENT=00000000-0000-0000-0000-0000000000a1
"${PSQL[@]}" <<SQL
insert into auth.users values ('$MERCHANT'), ('$OTHER_MERCHANT'), ('$STUDENT');
insert into public.deals values ('00000000-0000-0000-0000-0000000000d1', '$MERCHANT', 'Chips + soda combo');
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline) values
  ('00000000-0000-0000-0000-00000000aa01', '$STUDENT', '$MERCHANT', '00000000-0000-0000-0000-0000000000d1', 1, 1500, 1500, 'paid',      now()),
  ('00000000-0000-0000-0000-00000000aa02', '$STUDENT', '$MERCHANT', '00000000-0000-0000-0000-0000000000d1', 1, 1500, 1500, 'confirmed', now()),
  ('00000000-0000-0000-0000-00000000aa03', '$STUDENT', '$MERCHANT', '00000000-0000-0000-0000-0000000000d1', 1, 1500, 1500, 'paid',      now());
insert into public.redemptions (id, deal_id, student_id, student_name, code, status, order_id) values
  ('00000000-0000-0000-0000-00000000cc01', '00000000-0000-0000-0000-0000000000d1', '$STUDENT', 'Aline', '4821', 'pending', '00000000-0000-0000-0000-00000000aa01'),
  ('00000000-0000-0000-0000-00000000cc02', '00000000-0000-0000-0000-0000000000d1', '$STUDENT', 'Aline', '1111', 'pending', '00000000-0000-0000-0000-00000000aa02'),
  ('00000000-0000-0000-0000-00000000cc03', '00000000-0000-0000-0000-0000000000d1', '$STUDENT', 'Aline', '2222', 'pending', '00000000-0000-0000-0000-00000000aa03'),
  ('00000000-0000-0000-0000-00000000cc04', '00000000-0000-0000-0000-0000000000d1', '$STUDENT', 'Aline', '3333', 'pending', null);
SQL

# --- Helpers ------------------------------------------------------------------
PASS=0; FAIL=0
as_user() { # $1 = user id ('' for anon), $2 = SQL. Prints result or the error message.
  local role=authenticated; [ -z "$1" ] && role=anon
  "${PSQL[@]}" -At 2>&1 <<SQL | sed -E 's/^psql:[^:]*:[0-9]+: //; s/^ERROR: +//' | grep -vE '^$|^CONTEXT:' | tail -1
set role $role;
select set_config('request.jwt.claim.sub', '$1', false) \\gset
$2
SQL
}
admin() { "${PSQL[@]}" -At -c "$1"; }
check() { # $1 = name, $2 = actual, $3 = expected
  if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi
}

echo "order ready_at tests"
O1=00000000-0000-0000-0000-00000000aa01
check "column exists, empty by default" "$(admin "select coalesce(ready_at::text,'null') from public.orders where id='$O1'")" "null"
as_user $MERCHANT "update public.orders set ready_at = now() where id='$O1';" >/dev/null || true
check "business cannot set ready_at directly" "$(admin "select coalesce(ready_at::text,'null') from public.orders where id='$O1'")" "null"
as_user $STUDENT "update public.orders set ready_at = now() where id='$O1';" >/dev/null || true
check "student cannot set ready_at directly" "$(admin "select coalesce(ready_at::text,'null') from public.orders where id='$O1'")" "null"
check "no UPDATE policy on orders" "$(admin "select count(*) from pg_policies where tablename='orders' and cmd='UPDATE'")" "0"
admin "set role service_role; update public.orders set ready_at = now() where id='$O1';" >/dev/null
check "server (service role) can set it" "$(admin "select (ready_at is not null)::text from public.orders where id='$O1'")" "true"
check "student can read it on their order" "$(as_user $STUDENT "select (ready_at is not null)::text from public.orders where id='$O1';")" "true"
out=$(as_user $MERCHANT "select order_id from public.redeem_pickup_code('4821');")
check "ready order can still be collected with its code" "$out" "$O1"
check "collected: status redeemed, ready time kept" "$(admin "select status || '|' || (ready_at is not null)::text from public.orders where id='$O1'")" "redeemed|true"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
