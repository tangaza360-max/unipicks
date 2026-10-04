#!/usr/bin/env bash
# Local Postgres test for migration 20261004120000_merchant_profile_self_edit.
# Builds the schema from EVERY migration (same stubs as delete_account.test.sh).
# First shows the bug on the old policy (an approved business cannot save its
# profile), then applies the migration and checks: free edits of phone, address,
# logo and MoMo code; no self-approval; a name or RDB change sends the business
# back for approval, hides its deals and notifies admins; admins and the service
# role are unaffected; nobody edits someone else's profile.
#
# Usage: bash supabase/tests/merchant_profile_edit.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/profile-edit-test.XXXXXX)"
PORT="${PGPORT_TEST:-54339}"
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
NEW=20261004120000_merchant_profile_self_edit.sql
for f in "$REPO"/supabase/migrations/*.sql; do
  [ "$(basename "$f")" = "$NEW" ] && continue
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ok   $1"; PASS=$((PASS+1)); else echo "  FAIL $1: expected [$3], got [$2]"; FAIL=$((FAIL+1)); fi; }
as_anon() { local out; out=$({ "${PSQL[@]}" -At 2>&1 || true; } <<<"set role anon; $1"); echo "$out" | grep -vE '^$|^SET$' | tail -1; }

M1=00000000-0000-0000-0000-0000000000b1   # Mr. Chips (approved)
M2=00000000-0000-0000-0000-0000000000b2   # new business (not approved)
AD=00000000-0000-0000-0000-0000000000d1   # admin
ST=00000000-0000-0000-0000-0000000000a1   # student
q "alter table public.merchant_profiles add column if not exists phone text, add column if not exists address text,
  add column if not exists rdb_number text, add column if not exists logo_url text, add column if not exists updated_at timestamptz;"
q "insert into auth.users (id, email, raw_user_meta_data) values
  ('$M1','chips@x.rw','{\"role\":\"merchant\",\"business_name\":\"Mr. Chips\"}'),
  ('$M2','cafe@x.rw','{\"role\":\"merchant\",\"business_name\":\"Campus Cafe\"}'),
  ('$AD','admin@x.rw','{\"role\":\"student\"}'),
  ('$ST','s@keplercollege.ac.rw','{\"role\":\"student\"}');
  update public.user_roles set role='admin' where user_id='$AD';
  update public.merchant_profiles set approved = true, rdb_number = '123456789' where id='$M1';
  insert into public.deals (merchant_id, business_name, title, active) values ('$M1','Mr. Chips','Burger Thursday', true);"
deals_seen_by_students() { as_anon "select count(*) from public.deals where merchant_id='$M1';"; }

echo "Before the fix (old policy)"
check "approved business saving its MoMo code is refused" \
  "$(as_user $M1 "update public.merchant_profiles set momo_pay_code='123456' where id='$M1';" | grep -o 'violates row-level security' )" "violates row-level security"

"${PSQL[@]}" -f "$REPO/supabase/migrations/$NEW" >/dev/null 2>&1

echo "After the fix: free edits"
as_user $M1 "update public.merchant_profiles set momo_pay_code='123456', phone='0789000000', address='KG 9 Ave', logo_url='https://x/logo.png' where id='$M1';" >/dev/null
check "phone, address, logo and MoMo code saved" "$(q "select momo_pay_code||'|'||phone||'|'||address||'|'||logo_url from public.merchant_profiles where id='$M1'")" "123456|0789000000|KG 9 Ave|https://x/logo.png"
check "still approved" "$(q "select approved from public.merchant_profiles where id='$M1'")" "t"
check "deals still visible to students" "$(deals_seen_by_students)" "1"
as_user $M1 "update public.merchant_profiles set business_name='  Mr. Chips  ' where id='$M1';" >/dev/null
check "same name with spaces is not a change" "$(q "select approved from public.merchant_profiles where id='$M1'")" "t"

echo "No self-approval"
check "unapproved business cannot approve itself" "$(as_user $M2 "update public.merchant_profiles set approved=true where id='$M2';")" "Only Unipicks can approve a business."
check "approved business cannot change its own approval" "$(as_user $M1 "update public.merchant_profiles set approved=false where id='$M1';")" "Only Unipicks can approve a business."
check "nobody edits another business's profile" "$(as_user $M2 "update public.merchant_profiles set momo_pay_code='999' where id='$M1' returning id;")" ""
check "  …MoMo code unchanged" "$(q "select momo_pay_code from public.merchant_profiles where id='$M1'")" "123456"
check "students cannot edit business profiles" "$(as_user $ST "update public.merchant_profiles set phone='1' where id='$M1' returning id;")" ""

echo "Rename → back to approval (option A)"
as_user $M1 "update public.merchant_profiles set business_name='KFC Kigali' where id='$M1';" >/dev/null
check "name saved" "$(q "select business_name from public.merchant_profiles where id='$M1'")" "KFC Kigali"
check "business is waiting for approval again" "$(q "select approved from public.merchant_profiles where id='$M1'")" "f"
check "its deals are hidden from students" "$(deals_seen_by_students)" "0"
check "the business still sees its own deal" "$(as_user $M1 "select count(*) from public.deals where merchant_id='$M1';")" "1"
check "every admin is notified, with a link to Approvals" "$(q "select count(*)||'|'||max(link_path) from public.user_notifications where user_id='$AD' and type='merchant_reapproval'")" "1|/dashboard/approvals"
check "  …message names old and new name" "$(q "select message from public.user_notifications where user_id='$AD' and type='merchant_reapproval'")" "KFC Kigali changed its business name or RDB number and needs approval again (was: Mr. Chips)."

echo "Admin approves again"
as_user $AD "update public.merchant_profiles set approved=true where id='$M1';" >/dev/null
check "admin can approve" "$(q "select approved from public.merchant_profiles where id='$M1'")" "t"
check "deals visible again" "$(deals_seen_by_students)" "1"
as_user $AD "update public.merchant_profiles set business_name='Mr. Chips' where id='$M1';" >/dev/null
check "admin renaming a business does not un-approve it" "$(q "select approved from public.merchant_profiles where id='$M1'")" "t"

echo "RDB number change"
as_user $M1 "update public.merchant_profiles set rdb_number='987654321' where id='$M1';" >/dev/null
check "RDB change also needs approval again" "$(q "select approved from public.merchant_profiles where id='$M1'")" "f"
check "  …second admin notification" "$(q "select count(*) from public.user_notifications where user_id='$AD' and type='merchant_reapproval'")" "2"

echo "Unapproved business renames"
as_user $M2 "update public.merchant_profiles set business_name='Campus Cafe Ltd' where id='$M2';" >/dev/null
check "a business not yet approved renames without extra notification" "$(q "select count(*) from public.user_notifications where type='merchant_reapproval'")" "2"

echo "Service role"
as_user '' "update public.merchant_profiles set approved=true where id='$M1';" >/dev/null
check "service role can approve" "$(q "select approved from public.merchant_profiles where id='$M1'")" "t"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" = "0" ]
