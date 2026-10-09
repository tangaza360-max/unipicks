#!/usr/bin/env bash
# Local Postgres test for migration 20261009150000_review_photos.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks review photos: who uploads, who sees, names in reviews, erasure.
#
# Usage: bash supabase/tests/review_photos.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/review-photos-test.XXXXXX)"
PORT="${PGPORT_TEST:-54359}"
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

for f in "$REPO"/supabase/migrations/*.sql; do
  sed 's/MAINTAIN, //' "$f" | "${PSQL[@]}" >/dev/null 2>&1 || { echo "migration failed: $(basename "$f")"; "${PSQL[@]}" -f <(sed 's/MAINTAIN, //' "$f") 2>&1 | grep ERROR | head -3; exit 1; }
done


A=00000000-0000-0000-0000-0000000000a1      # Aline, reviews the deal
F=00000000-0000-0000-0000-0000000000a2      # Fred, another student
K=00000000-0000-0000-0000-0000000000a4      # Kevin, whom Aline blocked
BAN=00000000-0000-0000-0000-0000000000a5    # banned student
M=00000000-0000-0000-0000-0000000000b1      # business
AD=00000000-0000-0000-0000-0000000000d1     # admin
D=10000000-0000-4000-8000-000000000001
R1=20000000-0000-4000-8000-000000000001     # Aline's redemption
R2=20000000-0000-4000-8000-000000000002     # Fred's redemption
PIC="$A/11111111-1111-4111-8111-111111111111.jpg"
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$F','f@keplercollege.ac.rw','{"role":"student"}'),
 ('$K','k@keplercollege.ac.rw','{"role":"student"}'), ('$BAN','b@keplercollege.ac.rw','{"role":"student"}'),
 ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}'), ('$AD','ad@unipicks.app','{}');
update public.user_roles set role = 'admin' where user_id = '$AD';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"banned": true}' where id = '$BAN';
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.objects to anon; -- as on Supabase; the rules decide the rows
insert into public.merchant_profiles (id, business_name, approved) values ('$M','Mama Rose',true) on conflict (id) do update set approved = true;
insert into public.deals (id, merchant_id, business_name, title, active, price) values ('$D','$M','Mama Rose','Rolex',true,1500);
insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus)
values ('$A','aline','Aline U','Kepler College','Kigali',true);
insert into public.blocked_students (blocker_id, blocked_id) values ('$A','$K');
-- Collected orders (pickup codes used); skip foreign keys for this setup only.
set session_replication_role = replica;
insert into public.redemptions (id, student_id, deal_id, status, code) values ('$R1','$A','$D','redeemed','4821'), ('$R2','$F','$D','redeemed','5932');
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
up() { as_user "$1" "insert into storage.objects (bucket_id, name) values ('review-photos', '$2') returning 1;"; }
reviews() { as_user "$1" "select string_agg(rating || '|' || coalesce(review,'-') || '|' || coalesce(photo_path,'-') || '|' || coalesce(reviewer_name,'-') || '|' || is_mine, ' ; ' order by created_at desc) from public.get_deal_reviews('$D');"; }
RLS='new row violates row-level security policy for table "objects"'

echo "review_photos tests"
check "bucket is private (1 MB JPEG limit set where Supabase has those columns)" "$(q "select public from storage.buckets where id = 'review-photos'")" "f"

echo " uploading"
check "student uploads into their own folder" "$(up $A "$PIC")" "1"
check "not into someone else's folder" "$(up $A "$F/22222222-2222-4222-8222-222222222222.jpg")" "$RLS"
check "business can't upload" "$(up $M "$M/33333333-3333-4333-8333-333333333333.jpg")" "$RLS"
check "banned student can't upload" "$(up $BAN "$BAN/44444444-4444-4444-8444-444444444444.jpg")" "$RLS"

echo " who sees the photo file"
check "another student sees it" "$(as_user $F "select count(*) from storage.objects where bucket_id = 'review-photos';")" "1"
check "the business sees it" "$(as_user $M "select count(*) from storage.objects where bucket_id = 'review-photos';")" "1"
check "visitors (anon) can't" "$("${PSQL[@]}" -At -c "set role anon; select count(*) from storage.objects where bucket_id = 'review-photos';" 2>&1 | tail -1)" "0"

echo " the review"
check "Aline reviews with her photo" "$(as_user $A "insert into public.ratings (deal_id, merchant_id, student_id, redemption_id, rating, review, photo_path) values ('$D','$M','$A','$R1',5,'Best rolex!','$PIC') returning 1;")" "1"
check "a photo from another student's folder is refused" "$(as_user $F "insert into public.ratings (deal_id, merchant_id, student_id, redemption_id, rating, photo_path) values ('$D','$M','$F','$R2',4,'$PIC') returning 1;")" 'new row for relation "ratings" violates check constraint "ratings_photo_in_own_folder"'
check "Fred rates with stars only" "$(as_user $F "insert into public.ratings (deal_id, merchant_id, student_id, redemption_id, rating, review) values ('$D','$M','$F','$R2',3,'   ') returning 1;")" "1"

echo " get_deal_reviews"
check "Fred sees Aline's review, photo and name; stars-only and blank text not listed" "$(reviews $F)" "5|Best rolex!|$PIC|Aline U|false"
check "Aline sees hers marked as hers" "$(reviews $A)" "5|Best rolex!|$PIC|Aline U|true"
check "Kevin (blocked by Aline) sees the review without her name" "$(reviews $K)" "5|Best rolex!|$PIC|-|false"
check "the business sees the review and photo, not the name" "$(reviews $M)" "5|Best rolex!|$PIC|-|false"
check "admin sees the name" "$(reviews $AD)" "5|Best rolex!|$PIC|Aline U|false"
check "visitors see stars and text only" "$("${PSQL[@]}" -At -c "set role anon; select rating || '|' || review || '|' || coalesce(photo_path,'-') || '|' || coalesce(reviewer_name,'-') from public.get_deal_reviews('$D');" 2>&1 | tail -1)" "5|Best rolex!|-|-"
check "limit is capped at 50" "$(q "select pg_get_functiondef('public.get_deal_reviews(uuid,integer)'::regprocedure) ~ 'least\(greatest\(coalesce\(p_limit, 20\), 1\), 50\)'")" "t"
check "function: definer, empty search path" "$(q "select prosecdef || ' ' || array_to_string(proconfig, ',') from pg_proc where proname = 'get_deal_reviews'")" 'true search_path=""'

echo " removing"
check "Fred can't delete Aline's photo" "$(as_user $F "delete from storage.objects where bucket_id = 'review-photos' returning 1;")" ""
check "Aline can delete her own" "$(as_user $A "delete from storage.objects where bucket_id = 'review-photos' and name = '$PIC' returning 1;")" "1"

echo " reporting a review"
q "insert into storage.objects (bucket_id, name) values ('review-photos', '$PIC');" >/dev/null   # the photo again
RID=$(q "select id from public.ratings where student_id = '$A'")
rep() { as_user "$1" "insert into public.student_reports (reporter_id, reported_id, category, context, rating_id) values ('$1', ${3:-null}, 'Inappropriate behavior', '${4:-review}', ${2}) returning reported_id;"; }
check "Fred reports Aline's review; the database fills in who wrote it" "$(rep $F "'$RID'")" "$A"
check "a wrong 'who' from the phone is replaced" "$(rep $K "'$RID'" "'$M'")" "$A"
check "the business can report a review of its deal" "$(rep $M "'$RID'")" "$A"
check "you can't report your own review" "$(rep $A "'$RID'")" "You can't report your own review."
check "a review that doesn't exist" "$(rep $F "'30000000-0000-4000-8000-000000000009'")" "This review no longer exists."
check "other report types can't carry a review" "$(as_user $F "insert into public.student_reports (reporter_id, reported_id, category, context, rating_id) values ('$F','$A','Spam','profile','$RID') returning coalesce(rating_id::text,'none');")" "none"
check "the report keeps a copy of the text and photo" "$(q "select review_text || '|' || review_photo_path from public.student_reports where reporter_id = '$F' and context = 'review'")" "Best rolex!|$PIC"
as_user $A "update public.ratings set review = 'edited' where id = '$RID';" >/dev/null
check "editing the review later doesn't change the copy" "$(q "select review_text from public.student_reports where reporter_id = '$F' and context = 'review'")" "Best rolex!"
check "while reported, Aline can't delete that photo file" "$(as_user $A "delete from storage.objects where bucket_id = 'review-photos' and name = '$PIC' returning 1;")" ""
REP=$(q "select id from public.student_reports where reporter_id = '$F' and context = 'review'")
check "admin queue shows the review (stars, copy, photo)" "$(as_user $AD "select review_rating || '|' || review_text || '|' || review_photo_path || '|' || review_removed from public.get_admin_reports() where id = '$REP';")" "5|Best rolex!|$PIC|false"
check "only admins can remove a review" "$(as_user $F "select public.admin_remove_review('$REP');")" "Only admins can remove reviews"
check "admin_remove_review refuses other reports" "$(as_user $AD "select public.admin_remove_review((select id from public.student_reports where context = 'profile' limit 1));")" "This report is not about a review."
check "admin removes it: returns the photo to delete" "$(as_user $AD "select public.admin_remove_review('$REP');")" "$PIC"
check "text and photo cleared, stars kept" "$(q "select coalesce(review,'-') || '|' || coalesce(photo_path,'-') || '|' || rating from public.ratings where id = '$RID'")" "-|-|5"
check "queue now says removed" "$(as_user $AD "select review_removed from public.get_admin_reports() where id = '$REP';")" "t"
check "logged as remove_review" "$(q "select count(*) from public.activity_logs where action = 'remove_review' and target_id = '$A'")" "1"
check "admin can delete the file" "$(as_user $AD "delete from storage.objects where bucket_id = 'review-photos' and name = '$PIC' returning 1;")" "1"
check "get_admin_reports: definer, admins only" "$(as_user $F "select count(*) from public.get_admin_reports();")" "Only admins can view reports"

echo " erasure"
check "account deletion empties the review-photos folder" "$(q "select public.tombstone_user_core('$A') -> 'storage' @> '[{\"bucket\":\"review-photos\",\"prefix\":\"$A\"}]'")" "t"
check "and clears the text and photo on her kept rating" "$(q "select coalesce(review,'-') || '|' || coalesce(photo_path,'-') || '|' || rating from public.ratings where student_id = '$A'")" "-|-|5"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
