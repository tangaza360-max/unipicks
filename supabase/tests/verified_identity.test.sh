#!/usr/bin/env bash
# Local Postgres test for migration 20261003190000_server_owned_verified_identity.
# Stubs only the parts of Supabase the migration touches (auth.users columns,
# auth.uid(), user_roles, is_admin, a minimal student_profiles), applies the REAL
# migration, and checks every behaviour.
#
# Usage: bash supabase/tests/verified_identity.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
MIG="$REPO/supabase/migrations/20261003190000_server_owned_verified_identity.sql"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/identity-test.XXXXXX)"
PORT="${PGPORT_TEST:-54331}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown postgres "$DIR"; RUN="su postgres -s /bin/bash -c"; fi
as_pg() { if [ -n "$RUN" ]; then $RUN "$1"; else bash -c "$1"; fi; }
cleanup() { as_pg "$PGBIN/pg_ctl -D $DIR/data stop -m fast" >/dev/null 2>&1 || true; rm -rf "$DIR"; }
trap cleanup EXIT

as_pg "$PGBIN/initdb -D $DIR/data -U postgres -A trust >/dev/null && $PGBIN/pg_ctl -D $DIR/data -o \"-k $DIR -p $PORT -c listen_addresses=''\" -l $DIR/pg.log start >/dev/null"
PSQL=(psql -h "$DIR" -p "$PORT" -U postgres -X -q -v ON_ERROR_STOP=1)
q() { "${PSQL[@]}" -At -c "$1"; }

# --- Supabase stubs -----------------------------------------------------------
"${PSQL[@]}" <<'SQL'
create role anon nologin; create role authenticated nologin;
create schema auth;
create table auth.users (
  id uuid primary key, email text,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable
  as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth, public to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
create table public.user_roles (user_id uuid primary key, role text);
create function public.is_admin() returns boolean language sql stable security definer
  as $$ select exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin') $$;
grant execute on function public.is_admin() to authenticated;
create table public.student_profiles (user_id uuid primary key, username text, university text not null, campus text);
grant select, update on public.student_profiles to authenticated;
SQL

# --- Users that exist BEFORE the migration (backfill) -------------------------
q "insert into auth.users values
  ('00000000-0000-0000-0000-0000000000e1', 'old.student@keplercollege.ac.rw', '{\"university\":\"Harvard\",\"student_id\":\"K-OLD-1\"}', '{\"provider\":\"email\"}'),
  ('00000000-0000-0000-0000-0000000000e2', 'shop@gmail.com', '{\"business_name\":\"Campus Chips\"}', '{\"provider\":\"email\"}'),
  ('00000000-0000-0000-0000-0000000000ad', 'admin@keplercollege.ac.rw', '{}', '{}');
  insert into public.user_roles values
  ('00000000-0000-0000-0000-0000000000e1','student'), ('00000000-0000-0000-0000-0000000000e2','merchant'), ('00000000-0000-0000-0000-0000000000ad','admin');
  insert into public.student_profiles values ('00000000-0000-0000-0000-0000000000e1', 'old', 'Harvard', 'Kinyinya');"

# --- Apply the real migration --------------------------------------------------
"${PSQL[@]}" -f "$MIG"

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
app() { q "select coalesce(raw_app_meta_data->>'$2','∅') from auth.users where id='$1'"; }
OLD=00000000-0000-0000-0000-0000000000e1; SHOP=00000000-0000-0000-0000-0000000000e2
NEW=00000000-0000-0000-0000-0000000000a1; ADMIN=00000000-0000-0000-0000-0000000000ad

echo "verified identity tests"

# Backfill
check "backfill: university derived from email, not the self-typed 'Harvard'" "$(app $OLD university)" "Kepler College"
check "backfill: verified_email_domain set" "$(app $OLD verified_email_domain)" "keplercollege.ac.rw"
check "backfill: student_id copied once from current metadata" "$(app $OLD student_id)" "K-OLD-1"
check "backfill: existing app_metadata keys preserved" "$(app $OLD provider)" "email"
check "backfill: non-university email gets no university" "$(app $SHOP university)" "∅"
check "backfill: merchant gets no student_id" "$(app $SHOP student_id)" "∅"
check "backfill: student_profiles.university corrected" "$(q "select university from public.student_profiles where user_id='$OLD'")" "Kepler College"

# New signup (what the auth server inserts)
q "insert into auth.users (id, email, raw_user_meta_data, raw_app_meta_data) values
   ('$NEW', 'Aline@KeplerCollege.ac.rw', '{\"role\":\"student\",\"university\":\"Fake University\",\"student_id\":\" K123 \"}', '{\"provider\":\"email\",\"providers\":[\"email\"]}');
   insert into public.user_roles values ('$NEW','student');"
check "signup: university from email domain (case-insensitive), ignoring form value" "$(app $NEW university)" "Kepler College"
check "signup: student_id captured from signup form (trimmed)" "$(app $NEW student_id)" "K123"
check "signup: provider keys kept" "$(app $NEW providers)" '["email"]'

# Student tampers with user_metadata (what supabase.auth.updateUser({data}) does)
q "update auth.users set raw_user_meta_data = raw_user_meta_data || '{\"university\":\"Harvard\",\"student_id\":\"STOLEN-ID\"}' where id='$NEW'"
check "tamper: university unchanged after editing user_metadata" "$(app $NEW university)" "Kepler College"
check "tamper: student_id unchanged after editing user_metadata" "$(app $NEW student_id)" "K123"

# Auth server rewrites app_metadata from its in-memory copy (drops our keys)
q "update auth.users set raw_app_meta_data = '{\"provider\":\"email\",\"providers\":[\"email\"]}' where id='$NEW'"
check "auth-server rewrite: university re-derived" "$(app $NEW university)" "Kepler College"
check "auth-server rewrite: student_id kept" "$(app $NEW student_id)" "K123"
check "auth-server rewrite: its own keys kept" "$(app $NEW provider)" "email"

# Even a forged app_metadata university is overridden by the email domain
q "update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"university\":\"Harvard\"}' where id='$NEW'"
check "forged app_metadata university overridden by email domain" "$(app $NEW university)" "Kepler College"

# Admin correction via SQL (founder decision: corrections are manual)
q "update auth.users set raw_app_meta_data = raw_app_meta_data || '{\"student_id\":\"K124\"}' where id='$NEW'"
check "admin SQL correction of student_id is kept" "$(app $NEW student_id)" "K124"

# student_profiles: a student edits their own university
q "insert into public.student_profiles values ('$NEW', 'aline', 'Kepler College', 'Kinyinya')"
"${PSQL[@]}" -At <<SQL >/dev/null
set role authenticated;
select set_config('request.jwt.claim.sub', '$NEW', false);
update public.student_profiles set university = 'Harvard' where user_id = '$NEW';
SQL
check "student cannot change student_profiles.university" "$(q "select university from public.student_profiles where user_id='$NEW'")" "Kepler College"
check "insert with a wrong university is corrected" \
  "$(q "update public.student_profiles set university='X' where user_id='$OLD' returning university")" "Kepler College"

# Admin list reads verified values
ADMIN_OUT=$("${PSQL[@]}" -At <<SQL
set role authenticated;
select set_config('request.jwt.claim.sub', '$ADMIN', false) \\gset
select (e->>'university') || '|' || (e->>'student_id')
  from jsonb_array_elements(public.get_all_students()) e where e->>'id' = '$NEW';
SQL
)
check "get_all_students returns verified university|student_id" "$(echo "$ADMIN_OUT" | tail -1)" "Kepler College|K124"
NOT_ADMIN=$( { "${PSQL[@]}" -At 2>&1 || true; } <<SQL | grep -vE '^$|^CONTEXT' | tail -1 | sed -E 's/^ERROR: +//'
set role authenticated;
select set_config('request.jwt.claim.sub', '$NEW', false) \\gset
select public.get_all_students();
SQL
) || true
check "get_all_students still admin-only" "$NOT_ADMIN" "Only admins can view student list"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
