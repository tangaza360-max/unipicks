#!/usr/bin/env bash
# Local Postgres test for migration 20261005100000_student_stories_friends.
# Builds the schema from every migration on stubbed Supabase internals, then
# checks: only friends see stories, blocks and bans hide them, the database
# sets the 24 hours, photo paths are checked, the photo files are private,
# views and "Seen by", the tray, and story reports.
#
# Usage: bash supabase/tests/student_stories.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/stories-test.XXXXXX)"
PORT="${PGPORT_TEST:-54341}"
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
post() { as_user "$1" "insert into public.student_stories (student_id, media_url, caption, expires_at) values ('$2','$3','$4', now() + interval '30 days') returning extract(epoch from (expires_at - created_at))::int || '|' || visibility || '|' || type;"; }

echo "posting"
check "student posts a photo; the database sets 24 hours (phone asked for 30 days)" "$(post $A $A "$A/p1.jpg" 'Lunch')" "86400|friends|image"
check "the app's insert (no times sent) gets 24 hours" "$(as_user $A "insert into public.student_stories (student_id, media_url) values ('$A','$A/app-1.jpg') returning extract(epoch from (expires_at - created_at))::int;")" "86400"
q "delete from public.student_stories where media_url = '$A/app-1.jpg';"
check "GIF allowed" "$(post $A $A "$A/fun_1.gif" '')" "86400|friends|image"
check "can't post as someone else" "$(post $A $F "$F/x.jpg" '')" "You can only post your own story."
check "can't use a file from another student's folder" "$(post $A $A "$F/x.jpg" '')" "Choose a photo or GIF to post."
check "videos and other files refused" "$(post $A $A "$A/clip.mp4" '')" "Choose a photo or GIF to post."
check "path tricks refused" "$(post $A $A "$A/../$F/x.jpg" '')" "Choose a photo or GIF to post."
check "signed-in role without a user can't post" "$(as_user '' "set role authenticated; insert into public.student_stories (student_id, media_url, expires_at) values ('$A','$A/z.jpg', now() + interval '1 day') returning 1;")" 'new row violates row-level security policy for table "student_stories"'
check "businesses can't post student stories" "$(post $M $M "$M/x.jpg" '')" "Only students can post stories."
check "banned student can't post" "$(post $BAN $BAN "$BAN/x.jpg" '')" "Your account is suspended. Contact support."
check "caption over 200 characters refused" "$(post $A $A "$A/long.jpg" "$(printf 'a%.0s' $(seq 1 201))")" "Keep the caption under 200 characters."
check "stories can't be edited (e.g. to live longer)" "$(as_user $A "update public.student_stories set expires_at = now() + interval '9 days' returning 1;")" ""
# A story Bano posted before the ban (written directly, no signed-in user).
q "insert into public.student_stories (student_id, media_url, created_at, expires_at) values ('$BAN','$BAN/b.jpg', now(), now() + interval '24 hours');"
P1=$(q "select id from public.student_stories where media_url = '$A/p1.jpg'")

echo "who sees"
check "owner sees own 2 stories" "$(as_user $A "select count(*) from public.student_stories where student_id = '$A';")" "2"
check "friend sees them" "$(as_user $F "select count(*) from public.student_stories where student_id = '$A';")" "2"
check "stranger sees nothing" "$(as_user $S "select count(*) from public.student_stories;")" "0"
check "blocked friend sees nothing" "$(as_user $K "select count(*) from public.student_stories where student_id = '$A';")" "0"
check "business sees nothing" "$(as_user $M "select count(*) from public.student_stories;")" "0"
check "banned friend's story is hidden from friends" "$(as_user $A "select count(*) from public.student_stories where student_id = '$BAN';")" "0"
check "admin sees all (for reports)" "$(as_user $AD "select count(*) from public.student_stories;")" "3"
q "update public.student_stories set created_at = now() - interval '25 hours', expires_at = now() - interval '1 hour' where media_url = '$A/fun_1.gif';"
check "after 24 hours the friend no longer sees it" "$(as_user $F "select count(*) from public.student_stories where student_id = '$A';")" "1"
check "the owner still sees it (own archive)" "$(as_user $A "select count(*) from public.student_stories where student_id = '$A';")" "2"

echo "photo files"
q "insert into storage.objects (bucket_id, name) values ('student-stories','$A/p1.jpg'), ('student-stories','$A/fun_1.gif'), ('student-stories','$A/never-posted.jpg');"
check "bucket is private" "$(q "select public from storage.buckets where id = 'student-stories'")" "f"
check "friend can open the photo of a live story" "$(as_user $F "select count(*) from storage.objects where bucket_id = 'student-stories' and name = '$A/p1.jpg';")" "1"
check "friend can't open an expired story's photo" "$(as_user $F "select count(*) from storage.objects where name = '$A/fun_1.gif';")" "0"
check "friend can't open a file that was never posted" "$(as_user $F "select count(*) from storage.objects where name = '$A/never-posted.jpg';")" "0"
check "stranger can't open the photo, even with the link" "$(as_user $S "select count(*) from storage.objects where name = '$A/p1.jpg';")" "0"
check "owner sees all own files" "$(as_user $A "select count(*) from storage.objects where bucket_id = 'student-stories';")" "3"
check "student uploads into own folder" "$(as_user $F "insert into storage.objects (bucket_id, name) values ('student-stories','$F/me.jpg') returning 1;")" "1"
check "can't upload into someone else's folder" "$(as_user $F "insert into storage.objects (bucket_id, name) values ('student-stories','$A/fake.jpg') returning 1;")" 'new row violates row-level security policy for table "objects"'
check "business can't upload student story photos" "$(as_user $M "insert into storage.objects (bucket_id, name) values ('student-stories','$M/x.jpg') returning 1;")" 'new row violates row-level security policy for table "objects"'

echo "views (Seen by)"
check "friend records a view" "$(as_user $F "insert into public.student_story_views (story_id, viewer_id) values ('$P1','$F') returning 1;")" "1"
check "stranger can't record a view" "$(as_user $S "insert into public.student_story_views (story_id, viewer_id) values ('$P1','$S') returning 1;")" 'new row violates row-level security policy for table "student_story_views"'
check "owner's own view isn't counted" "$(as_user $A "insert into public.student_story_views (story_id, viewer_id) values ('$P1','$A') returning 1;")" 'new row violates row-level security policy for table "student_story_views"'
check "owner sees who viewed (Seen by 1)" "$(as_user $A "select count(*) from public.student_story_views where story_id = '$P1';")" "1"

echo "tray"
check "friend's tray: Aline, 1 live story, already seen" "$(as_user $F "select display_name || '|' || story_count || '|' || has_unseen || '|' || is_me from public.get_story_tray();")" "Aline U|1|false|false"
post $A $A "$A/p2.png" '' >/dev/null
check "a new story makes the ring unseen again" "$(as_user $F "select story_count || '|' || has_unseen from public.get_story_tray();")" "2|true"
check "owner's tray shows themselves first" "$(as_user $A "select string_agg(display_name || ':' || is_me, ',') from public.get_story_tray();")" "Aline U:true"
check "stranger's tray is empty" "$(as_user $S "select count(*) from public.get_story_tray();")" "0"
check "blocked friend's tray is empty" "$(as_user $K "select count(*) from public.get_story_tray();")" "0"
check "admin's tray is empty (admin access is for reports only)" "$(as_user $AD "select count(*) from public.get_story_tray();")" "0"

echo "reports"
check "friend reports a story" "$(as_user $F "insert into public.student_reports (reporter_id, reported_id, category, story_id) values ('$F','$A','Inappropriate behavior','$P1') returning context;")" "story"
check "stranger can't report a story they can't see" "$(as_user $S "insert into public.student_reports (reporter_id, reported_id, category, story_id) values ('$S','$A','Spam','$P1') returning 1;")" "You can only report a story you can see."
check "story must belong to the reported student" "$(as_user $F "insert into public.student_reports (reporter_id, reported_id, category, story_id) values ('$F','$S','Spam','$P1') returning 1;")" "You can only report a story you can see."
check "context 'story' needs a story" "$(as_user $F "insert into public.student_reports (reporter_id, reported_id, category, context) values ('$F','$A','Spam','story') returning 1;")" "Choose the story to report."
echo "reported stories are kept until reviewed"
check "owner's Delete on a reported story deletes nothing" "$(as_user $A "delete from public.student_stories where id = '$P1' returning 1;")" ""
check "... but hides it from friends at once" "$(as_user $F "select count(*) from public.student_stories where id = '$P1';")" "0"
check "... and from the owner's tray (1 live story left of 2)" "$(as_user $A "select story_count from public.get_story_tray() where is_me;")" "1"
check "the row is kept for the admin" "$(q "select count(*) from public.student_stories where id = '$P1'")" "1"
check "owner can't delete the reported photo file" "$(as_user $A "delete from storage.objects where name = '$A/p1.jpg' returning 1;")" ""
check "the photo file is kept" "$(q "select count(*) from storage.objects where name = '$A/p1.jpg'")" "1"
check "owner can still delete an unreported photo file" "$(as_user $A "delete from storage.objects where name = '$A/never-posted.jpg' returning 1;")" "1"
echo "admin reports show the story"
RID=$(q "select id from public.student_reports where context = 'story' limit 1")
check "admin's report list includes the photo path and caption" "$(as_user $AD "select story_media_path || '|' || story_caption || '|' || story_removed from public.get_admin_reports() where id = '$RID';")" "$A/p1.jpg|Lunch|false"
check "students can't read the admin list" "$(as_user $F "select count(*) from public.get_admin_reports();")" "Only admins can view reports"
check "admin can open the reported photo file" "$(as_user $AD "select count(*) from storage.objects where name = '$A/p1.jpg';")" "1"
check "students can't remove stories through the admin action" "$(as_user $F "select public.admin_remove_story('$RID');")" "Only admins can remove stories"
check "admin removes the story; gets the photo path back" "$(as_user $AD "select public.admin_remove_story('$RID');")" "$A/p1.jpg"
check "story deleted" "$(q "select count(*) from public.student_stories where id = '$P1'")" "0"
check "removal written to the admin log" "$(q "select action || '|' || target_type || '|' || target_id || '|' || (details->>'report_id') from public.activity_logs where action = 'remove_story'")" "remove_story|student|$A|$RID"
check "report now says the story was removed" "$(as_user $AD "select story_removed || '|' || coalesce(story_media_path, 'none') from public.get_admin_reports() where id = '$RID';")" "true|none"
check "removing twice gives a clear message" "$(as_user $AD "select public.admin_remove_story('$RID');")" "This story was already removed."
# Put the story back for the remaining checks.
q "insert into public.student_stories (id, student_id, media_url, caption, created_at, expires_at) values ('$P1','$A','$A/p1.jpg','Lunch', now(), now() + interval '24 hours'); update public.student_reports set story_id = '$P1' where id = '$RID';"
check "admin can remove the story" "$(as_user $AD "delete from public.student_stories where id = '$P1' returning 1;")" "1"
check "report kept after removal (story link cleared)" "$(q "select count(*) || '|' || count(story_id) from public.student_reports where context = 'story'")" "1|0"
P2=$(q "select id from public.student_stories where media_url = '$A/p2.png'")
as_user $F "insert into public.student_reports (reporter_id, reported_id, category, story_id) values ('$F','$A','Spam','$P2');" >/dev/null
check "a dismissed report no longer protects the story" "$(as_user $AD "select public.review_report((select id from public.student_reports where story_id = '$P2'), 'dismissed', null);")" ""
check "owner deletes own story" "$(as_user $A "delete from public.student_stories where media_url = '$A/p2.png' returning 1;")" "1"
check "friend can't delete it" "$(as_user $F "delete from public.student_stories where student_id = '$A' returning 1;")" ""

echo "clean-up of ended stories"
q "insert into public.student_stories (id, student_id, media_url, created_at, expires_at) values
  ('00000000-0000-0000-0000-00000000c001','$A','$A/old.jpg', now() - interval '4 days', now() - interval '3 days'),
  ('00000000-0000-0000-0000-00000000c002','$A','$A/recent.jpg', now() - interval '30 hours', now() - interval '6 hours'),
  ('00000000-0000-0000-0000-00000000c003','$F','$F/reported-old.jpg', now() - interval '4 days', now() - interval '3 days');"
# An open report on the third one (triggers off: written directly as test data).
q "set session_replication_role = replica; insert into public.student_reports (reporter_id, reported_id, category, story_id, context, status) values ('$A','$F','Spam','00000000-0000-0000-0000-00000000c003','story','pending');"
check "server lists only stories ended 48 h+ ago without an open report" "$(as_user '' "select string_agg(media_url, ',' order by media_url) from public.student_stories_to_clean(100);")" "$A/old.jpg"
check "students can't call it" "$(as_user $A "select count(*) from public.student_stories_to_clean(100);")" "permission denied for function student_stories_to_clean"
q "update public.student_reports set status = 'dismissed' where story_id = '00000000-0000-0000-0000-00000000c003';"
check "after the report is closed, that story is cleaned too" "$(as_user '' "select count(*) from public.student_stories_to_clean(100);")" "2"
check "server can delete the rows (no signed-in user)" "$(as_user '' "delete from public.student_stories where id in (select id from public.student_stories_to_clean(100)) returning 1;" | tail -1)" "1"
check "recent ended story is kept" "$(q "select count(*) from public.student_stories where media_url = '$A/recent.jpg'")" "1"

echo
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
