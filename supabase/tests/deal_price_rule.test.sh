#!/usr/bin/env bash
# Local Postgres test for migration 20261004130000_deals_require_student_price.
# Builds the schema from EVERY migration, seeds the production deal that had no
# price, applies the migration, then checks that deals without a price the
# student pays are refused and that deals without a discount are allowed.
#
# Usage: bash supabase/tests/deal_price_rule.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/price-rule-test.XXXXXX)"
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
NEW=20261004130000_deals_require_student_price.sql
for f in "$REPO"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$NEW" ] && continue
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; PASS=$((PASS+1)); else echo "  FAIL $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }
M=00000000-0000-0000-0000-0000000000b1
PIZZA=60eb628b-ab9e-4db6-b965-e875d0a99799
q "insert into auth.users (id, email, raw_user_meta_data) values ('$M','chips@x.rw','{\"role\":\"merchant\",\"business_name\":\"Mr. Chips\"}');
   update public.merchant_profiles set approved = true;
   insert into public.deals (id, merchant_id, business_name, title, offer_type, price) values ('$PIZZA','$M','Mr. Chips','30% off all pizzas','percentage', null);"

"${PSQL[@]}" -f "$REPO/supabase/migrations/$NEW" >/dev/null 2>&1 || { echo "migration failed"; "${PSQL[@]}" -f "$REPO/supabase/migrations/$NEW" 2>&1 | grep ERROR; exit 1; }
echo "Existing deal"
check "the pizza deal now has the price students pay (8000)" "$(q "select price from public.deals where id='$PIZZA'")" "8000"
check "  …and no discount" "$(q "select coalesce(discount_percent::text,'none') from public.deals where id='$PIZZA'")" "none"
check "rule is validated for all rows" "$(q "select convalidated from pg_constraint where conname='deals_have_student_price'")" "t"

ins() { as_user $M "insert into public.deals (merchant_id, business_name, title, active, offer_type, price, discount_percent, discount_value, final_price) values ('$M','x','$1', true, $2) returning 'saved';" | sed 's/.*violates check constraint.*/refused/'; }
echo "New deals (as the business, through RLS)"
check "percentage with no price → refused" "$(ins 'a' "'percentage', null, null, null, null")" "refused"
check "price 0 → refused" "$(ins 'b' "'percentage', 0, null, null, null")" "refused"
check "price, no discount → allowed" "$(ins 'c' "'percentage', 8000, null, null, null")" "saved"
check "price, 0% → allowed (shown as no discount)" "$(ins 'd' "'percentage', 8000, 0, null, null")" "saved"
check "price, 20% → allowed" "$(ins 'e' "'percentage', 6000, 20, null, null")" "saved"
check "discount over 100% → refused" "$(ins 'f' "'percentage', 6000, 150, null, null")" "refused"
check "group buy with price → allowed" "$(ins 'g' "'group_buy', 10000, 0, null, null")" "saved"
check "group buy without price → refused" "$(ins 'h' "'group_buy', null, null, null, null")" "refused"
check "save 500 of 3000 → allowed" "$(ins 'i' "'fixed_amount', 3000, null, 500, null")" "saved"
check "save more than the price → refused" "$(ins 'j' "'fixed_amount', 3000, null, 3000, null")" "refused"
check "bundle 7000, no original price → allowed" "$(ins 'k' "'fixed_price', null, null, null, 7000")" "saved"
check "bundle with no price → refused" "$(ins 'l' "'fixed_price', null, null, null, null")" "refused"
check "free delivery needs no price" "$(ins 'm' "'free_shipping', null, null, null, null")" "saved"
echo "Editing"
check "removing the price of a live deal → refused" "$(as_user $M "update public.deals set price=null where title='c' returning 'saved';" | sed 's/.*violates check constraint.*/refused/')" "refused"
check "pausing a deal still works" "$(as_user $M "update public.deals set active=false where id='$PIZZA' returning 'saved';")" "saved"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
