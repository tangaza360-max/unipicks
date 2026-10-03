#!/usr/bin/env bash
# Local Postgres test for public.redeem_pickup_code (migration 20261003170000).
#
# Spins up a throwaway Postgres 16 cluster, applies the REAL migrations for
# orders, redemptions and the RPC (stubbing only Supabase's auth.uid(), roles
# and a minimal deals table), then checks each scenario as the
# `authenticated` role, the way PostgREST would run it.
#
# Usage: bash supabase/tests/redeem_pickup_code.test.sh
# Needs: Postgres 16 server binaries (initdb/pg_ctl) and psql. Run as a
# non-root user, or as root with a `postgres` system user available.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$REPO/supabase/migrations"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/redeem-test.XXXXXX)"
PORT="${PGPORT_TEST:-54330}"
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

echo "redeem_pickup_code tests"

# 1. Paid order + owning merchant → both rows become redeemed.
out=$(as_user $MERCHANT "select redemption_id || '|' || order_id from public.redeem_pickup_code(' 4821 ');")
check "paid order: RPC returns redemption + order ids" "$out" "00000000-0000-0000-0000-00000000cc01|00000000-0000-0000-0000-00000000aa01"
check "paid order: redemption.status = redeemed" "$(admin "select status from public.redemptions where code='4821'")" "redeemed"
check "paid order: redemption.redeemed_at set" "$(admin "select (redeemed_at is not null)::text from public.redemptions where code='4821'")" "true"
check "paid order: order.status = redeemed" "$(admin "select status from public.orders where id='00000000-0000-0000-0000-00000000aa01'")" "redeemed"

# 2. Already redeemed → rejected.
check "already redeemed: rejected" "$(as_user $MERCHANT "select * from public.redeem_pickup_code('4821');")" "This code has already been redeemed"

# 3. Unpaid order → rejected, nothing changes.
check "unpaid order: rejected" "$(as_user $MERCHANT "select * from public.redeem_pickup_code('1111');")" "This code is not linked to a paid order"
check "unpaid order: redemption untouched" "$(admin "select status from public.redemptions where code='1111'")" "pending"
check "unpaid order: order untouched" "$(admin "select status from public.orders where id='00000000-0000-0000-0000-00000000aa02'")" "confirmed"

# 4. Code with no parent order (e.g. self-made) → rejected.
check "no parent order: rejected" "$(as_user $MERCHANT "select * from public.redeem_pickup_code('3333');")" "This code is not linked to a paid order"

# 5. Wrong merchant → rejected, nothing changes.
check "wrong merchant: rejected" "$(as_user $OTHER_MERCHANT "select * from public.redeem_pickup_code('2222');")" "Not your code to redeem"
check "wrong merchant: redemption untouched" "$(admin "select status from public.redemptions where code='2222'")" "pending"
check "wrong merchant: order untouched" "$(admin "select status from public.orders where id='00000000-0000-0000-0000-00000000aa03'")" "paid"

# 6. Unknown code / anonymous caller.
check "unknown code: rejected" "$(as_user $MERCHANT "select * from public.redeem_pickup_code('9999');")" "Pickup code not found"
check "anon cannot execute the RPC" "$(as_user '' "select * from public.redeem_pickup_code('2222');")" "permission denied for function redeem_pickup_code"

# 7. Merchants can no longer UPDATE redemptions directly.
check "merchant direct UPDATE on redemptions denied" \
  "$(as_user $MERCHANT "update public.redemptions set status='redeemed' where code='2222';")" \
  "permission denied for table redemptions"
check "merchant direct UPDATE: row untouched" "$(admin "select status from public.redemptions where code='2222'")" "pending"
check "no UPDATE policy left on redemptions" "$(admin "select count(*) from pg_policies where tablename='redemptions' and cmd='UPDATE'")" "0"

# 8. Students still cannot insert codes (regression check for 20261003145500).
check "student direct INSERT on redemptions denied" \
  "$(as_user $STUDENT "insert into public.redemptions (deal_id, student_id, code) values ('00000000-0000-0000-0000-0000000000d1', '$STUDENT', '5555');")" \
  "permission denied for table redemptions"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
