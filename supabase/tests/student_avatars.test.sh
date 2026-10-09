#!/usr/bin/env bash
# Local Postgres test for migration 20261009110000_student_avatars.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks who can set, see and remove a student's profile picture.
#
# Usage: bash supabase/tests/student_avatars.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/student-avatars-test.XXXXXX)"
PORT="${PGPORT_TEST:-54353}"
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
for f in "$REPO"/supabase/migrations/*.sql; do
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done

A=00000000-0000-0000-0000-0000000000a1      # Aline, posts stories
F=00000000-0000-0000-0000-0000000000a2      # Fred, Aline's friend
S=00000000-0000-0000-0000-0000000000a3      # Sam, a stranger
K=00000000-0000-0000-0000-0000000000a4      # Kevin, friend whom Aline blocked
BAN=00000000-0000-0000-0000-0000000000a5    # banned friend
M=00000000-0000-0000-0000-0000000000b1      # business
AD=00000000-0000-0000-0000-0000000000d1     # admin
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$F','f@keplercollege.ac.rw','{"role":"student"}'),
 ('$S','s@keplercollege.ac.rw','{"role":"student"}'), ('$K','k@keplercollege.ac.rw','{"role":"student"}'),
 ('$BAN','b@keplercollege.ac.rw','{"role":"student"}'), ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}'),
 ('$AD','ad@unipicks.app','{}');
update public.user_roles set role = 'admin' where user_id = '$AD';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"banned": true}' where id = '$BAN';
-- Supabase grants table access on storage.objects; RLS decides the rows.
grant select, insert, update, delete on storage.objects to authenticated;
insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus)
values ('$A','aline','Aline U','Kepler College','Kigali',true), ('$F','fred','Fred M','Kepler College','Kigali',true),
       ('$BAN','bano','Bano','Kepler College','Kigali',true);
insert into public.friendships (student_a, student_b) values
 (least('$A'::uuid,'$F'::uuid), greatest('$A'::uuid,'$F'::uuid)),
 (least('$A'::uuid,'$K'::uuid), greatest('$A'::uuid,'$K'::uuid)),
 (least('$A'::uuid,'$BAN'::uuid), greatest('$A'::uuid,'$BAN'::uuid));
insert into public.blocked_students (blocker_id, blocked_id) values ('$A','$K');
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
PIC="$A/11111111-1111-4111-8111-111111111111.jpg"

echo "student_avatars tests"
check "bucket is private" "$(q "select public from storage.buckets where id = 'student-avatars'")" "f"

echo " uploading"
check "student uploads into their own folder" "$(as_user $A "insert into storage.objects (bucket_id, name) values ('student-avatars', '$PIC') returning 1;")" "1"
check "not into someone else's folder" "$(as_user $A "insert into storage.objects (bucket_id, name) values ('student-avatars', '$F/22222222-2222-4222-8222-222222222222.jpg') returning 1;")" 'new row violates row-level security policy for table "objects"'
check "a business can't upload a student picture" "$(as_user $M "insert into storage.objects (bucket_id, name) values ('student-avatars', '$M/33333333-3333-4333-8333-333333333333.jpg') returning 1;")" 'new row violates row-level security policy for table "objects"'
check "a banned student can't upload" "$(as_user $BAN "insert into storage.objects (bucket_id, name) values ('student-avatars', '$BAN/44444444-4444-4444-8444-444444444444.jpg') returning 1;")" 'new row violates row-level security policy for table "objects"'

echo " the profile points to the picture"
check "student sets their own picture" "$(as_user $A "update public.student_profiles set avatar_path = '$PIC' where user_id = '$A' returning 1;")" "1"
check "can't point to a file in another student's folder" "$(as_user $F "update public.student_profiles set avatar_path = '$A/11111111-1111-4111-8111-111111111111.jpg' where user_id = '$F' returning 1;" | grep -o 'student_profiles_avatar_in_own_folder')" "student_profiles_avatar_in_own_folder"
check "can't use another file type or path trick" "$(as_user $F "update public.student_profiles set avatar_path = '$F/../x.png' where user_id = '$F' returning 1;" | grep -o 'student_profiles_avatar_in_own_folder')" "student_profiles_avatar_in_own_folder"
check "can't change someone else's profile" "$(as_user $F "update public.student_profiles set avatar_path = null where user_id = '$A' returning 1;")" ""

echo " who sees it (founder decision: all signed-in students, not businesses)"
see() { as_user "$1" "select count(*) from storage.objects where bucket_id = 'student-avatars' and name = '$PIC';"; }
check "the owner" "$(see $A)" "1"
check "a friend" "$(see $F)" "1"
check "a stranger student" "$(see $S)" "1"
check "an admin" "$(see $AD)" "1"
check "not a business" "$(see $M)" "0"
check "not someone the owner blocked" "$(see $K)" "0"
q "grant select on storage.objects to anon" >/dev/null  # as on Supabase; the rules decide
check "not a visitor (not signed in)" "$(as_user '' "set role anon; select count(*) from storage.objects where bucket_id = 'student-avatars';")" "0"
look() { as_user "$1" "select coalesce(string_agg(user_id::text || '=' || avatar_path, ','), 'none') from public.get_student_avatars(array['$A','$F']::uuid[]);"; }
check "lookup: a student gets Aline's picture (Fred has none)" "$(look $S)" "$A=$PIC"
check "lookup: the blocked student gets nothing" "$(look $K)" "none"
check "lookup: a business gets nothing" "$(look $M)" "none"
check "lookup: visitors can't call it" "$(as_user '' "set role anon; select count(*) from public.get_student_avatars(array['$A']::uuid[]);")" "permission denied for function get_student_avatars"
check "a folder that is not an id (other buckets) never breaks the rule" "$(as_user $S "select count(*) from storage.objects where bucket_id = 'student-avatars' and name = 'merchants/x.jpg';")" "0"

echo " removing"
check "a friend can't delete the picture" "$(as_user $F "delete from storage.objects where bucket_id = 'student-avatars' and name = '$PIC' returning 1;")" ""
check "the owner can" "$(as_user $A "delete from storage.objects where bucket_id = 'student-avatars' and name = '$PIC' returning 1;")" "1"

echo " deleting the account empties the picture folder"
TOMB=$(as_user '' "select public.tombstone_user('$A', null)::text;")
check "student-avatars folder is on the clean-up list" "$(echo "$TOMB" | grep -o "\"bucket\": \"student-avatars\", \"prefix\": \"$A\"")" "\"bucket\": \"student-avatars\", \"prefix\": \"$A\""
check "student-stories folder too" "$(echo "$TOMB" | grep -o "\"bucket\": \"student-stories\", \"prefix\": \"$A\"")" "\"bucket\": \"student-stories\", \"prefix\": \"$A\""

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
