#!/usr/bin/env bash
# Local Postgres test for migration 20261010090000_deal_comments.
# Builds the database from every migration (stubbed Supabase auth/storage) and
# checks who can comment and reply, what each person sees, limits, alerts and erasure.
#
# Usage: bash supabase/tests/deal_comments.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/deal-comments-test.XXXXXX)"
PORT="${PGPORT_TEST:-54361}"
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


A=00000000-0000-0000-0000-0000000000a1      # Aline, student
F=00000000-0000-0000-0000-0000000000a2      # Fred, student
K=00000000-0000-0000-0000-0000000000a4      # Kevin, whom Aline blocked
BAN=00000000-0000-0000-0000-0000000000a5    # banned student
M=00000000-0000-0000-0000-0000000000b1      # Mama Rose, the deal's business
O=00000000-0000-0000-0000-0000000000b2      # another business
AD=00000000-0000-0000-0000-0000000000d1     # admin
D=10000000-0000-4000-8000-000000000001      # live deal of Mama Rose
OFF=10000000-0000-4000-8000-000000000002    # switched-off deal
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, raw_user_meta_data) values
 ('$A','a@keplercollege.ac.rw','{"role":"student"}'), ('$F','f@keplercollege.ac.rw','{"role":"student"}'),
 ('$K','k@keplercollege.ac.rw','{"role":"student"}'), ('$BAN','b@keplercollege.ac.rw','{"role":"student"}'),
 ('$M','m@shop.rw','{"role":"merchant","business_name":"Mama Rose"}'), ('$O','o@shop.rw','{"role":"merchant","business_name":"Other"}'),
 ('$AD','ad@unipicks.app','{}');
update public.user_roles set role = 'admin' where user_id = '$AD';
update auth.users set raw_app_meta_data = raw_app_meta_data || '{"banned": true}' where id = '$BAN';
insert into public.merchant_profiles (id, business_name, approved) values ('$M','Mama Rose',true), ('$O','Other',true)
  on conflict (id) do update set approved = true;
insert into public.deals (id, merchant_id, business_name, title, active, price) values
 ('$D','$M','Mama Rose','Rolex',true,1500), ('$OFF','$M','Mama Rose','Old deal',false,1000);
insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus)
values ('$A','aline','Aline U','Kepler College','Kigali',true), ('$F','fred','Fred M','Kepler College','Kigali',true);
insert into public.blocked_students (blocker_id, blocked_id) values ('$A','$K');
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
say() { as_user "$1" "insert into public.deal_comments (deal_id, author_id, body, parent_id) values ('${4:-$D}', '$1', \$\$$2\$\$, ${3:-null}) returning id;"; }
list() { as_user "$1" "select string_agg(coalesce(author_name,'A student') || ':' || body || case when is_business then '[B]' else '' end || case when is_mine then '[me]' else '' end, ' | ' order by created_at) from public.get_deal_comments('$D');"; }
RLS='new row violates row-level security policy for table "deal_comments"'

echo "deal_comments tests"
echo " writing"
C1=$(say $A "Is it spicy?"); check "student comments on a live deal" "$([ ${#C1} -eq 36 ] && echo ok || echo "$C1")" "ok"
check "text is trimmed; empty refused" "$(say $F "   ")" 'new row for relation "deal_comments" violates check constraint "deal_comments_body_check"'
check "over 500 characters refused" "$(say $F "$(printf 'x%.0s' $(seq 1 501))")" 'new row for relation "deal_comments" violates check constraint "deal_comments_body_check"'
check "not in someone else's name" "$(as_user $F "insert into public.deal_comments (deal_id, author_id, body) values ('$D','$A','hi') returning 1;")" "$RLS"
check "not on a switched-off deal" "$(say $F "hello" null $OFF)" "$RLS"
check "banned student refused" "$(say $BAN "hello")" "$RLS"
check "another business refused" "$(say $O "Come to us instead")" "$RLS"
check "visitors refused" "$("${PSQL[@]}" -At -c "set role anon; insert into public.deal_comments (deal_id, author_id, body) values ('$D','$A','x');" 2>&1 | grep -o 'permission denied.*' | head -1)" "permission denied for table deal_comments"
R1=$(say $M "A little. We can make it mild." "'$C1'"); check "the deal's business replies" "$([ ${#R1} -eq 36 ] && echo ok || echo "$R1")" "ok"
R2=$(say $F "Same question!" "'$C1'"); check "another student replies" "$([ ${#R2} -eq 36 ] && echo ok || echo "$R2")" "ok"
check "no reply to a reply (one level)" "$(say $F "deeper" "'$R1'")" "You can only reply to a comment on this deal."
check "Kevin (blocked by Aline) can't reply to her" "$(say $K "hey" "'$C1'")" "You can't reply to this comment."
C2=$(say $K "Is there a vegan one?")
check "no editing" "$(as_user $A "update public.deal_comments set body = 'x' where id = '$C1' returning 1;")" "permission denied for table deal_comments"

echo " reading"
check "Fred sees all, names, business badge" "$(list $F)" "Aline U:Is it spicy? | Mama Rose:A little. We can make it mild.[B] | Fred M:Same question![me] | A student:Is there a vegan one?"
check "Aline doesn't see Kevin (she blocked him) and sees hers marked" "$(list $A)" "Aline U:Is it spicy?[me] | Mama Rose:A little. We can make it mild.[B] | Fred M:Same question!"
check "the business sees comments without student names" "$(list $M)" "A student:Is it spicy? | Mama Rose:A little. We can make it mild.[B][me] | A student:Same question! | A student:Is there a vegan one?"
check "visitors can't read comments" "$("${PSQL[@]}" -At -c "set role anon; select count(*) from public.get_deal_comments('$D');" 2>&1 | grep -o 'permission denied.*' | head -1)" "permission denied for function get_deal_comments"
check "visitors get the number" "$("${PSQL[@]}" -At -c "set role anon; select public.get_deal_comment_count('$D');" 2>&1 | tail -1)" "4"
check "the table shows only your own rows" "$(as_user $F "select count(*) from public.deal_comments;")" "1"
check "admins see all rows (to delete them)" "$(as_user $AD "select count(*) from public.deal_comments;")" "4"
check "no author ids for businesses or blocked people" "$(as_user $M "select count(*) from public.get_deal_comments('$D') where author_id is not null;")" "0"
check "functions: definer, empty search path" "$(q "select string_agg(proname || ' ' || prosecdef || ' ' || array_to_string(proconfig, ','), '; ' order by proname) from pg_proc where proname in ('get_deal_comments','get_deal_comment_count')")" 'get_deal_comment_count true search_path=""; get_deal_comments true search_path=""'

echo " alerts"
check "the business heard about the new comment" "$(q "select message || ' → ' || link_path from public.user_notifications where user_id = '$M' and type = 'deal_comment' order by created_at limit 1")" "New comment on Rolex: “Is it spicy?” → /deal/$D"
check "Aline heard the business replied (by name)" "$(q "select message from public.user_notifications where user_id = '$A' and type = 'comment_reply' order by created_at limit 1")" "Mama Rose replied to your comment on Rolex: “A little. We can make it mild.”"
check "a student's reply says 'Someone', not the name" "$(q "select message from public.user_notifications where user_id = '$A' and type = 'comment_reply' order by created_at offset 1 limit 1")" "Someone replied to your comment on Rolex: “Same question!”"
check "the business isn't alerted about its own replies" "$(q "select count(*) from public.user_notifications where user_id = '$M' and actor_id = '$M'")" "0"

echo " reporting a comment"
rep() { as_user "$1" "insert into public.student_reports (reporter_id, reported_id, category, context, comment_id) values ('$1', ${3:-null}, 'Spam', '${4:-comment}', ${2}) returning reported_id;"; }
check "Fred reports Kevin's comment; the database fills in who wrote it" "$(rep $F "'$C2'")" "$K"
check "a wrong 'who' from the phone is replaced" "$(rep $M "'$C2'" "'$A'")" "$K"
check "you can't report your own comment" "$(rep $K "'$C2'")" "You can't report your own comment."
check "a comment that doesn't exist" "$(rep $F "'30000000-0000-4000-8000-000000000009'")" "This comment no longer exists."
check "other report types can't carry a comment" "$(as_user $F "insert into public.student_reports (reporter_id, reported_id, category, context, comment_id) values ('$F','$A','Spam','profile','$C2') returning coalesce(comment_id::text,'none');")" "none"
CREP=$(q "select id from public.student_reports where reporter_id = '$F' and context = 'comment'")
check "admin queue shows the comment copy" "$(as_user $AD "select comment_text || '|' || comment_removed from public.get_admin_reports() where id = '$CREP';")" "Is there a vegan one?|false"
check "only admins can remove a comment" "$(as_user $F "select public.admin_remove_comment('$CREP');")" "Only admins can remove comments"
check "admin removes it" "$(as_user $AD "select public.admin_remove_comment('$CREP'); select count(*) from public.deal_comments where id = '$C2';" )" "0"
check "queue now says removed; logged" "$(as_user $AD "select comment_removed from public.get_admin_reports() where id = '$CREP';")|$(q "select count(*) from public.activity_logs where action = 'remove_comment' and target_id = '$K'")" "t|1"
C2=$(say $K "Is there a vegan one?")   # again, for the delete checks below

echo " deleting"
check "Fred can't delete Aline's comment" "$(as_user $F "delete from public.deal_comments where id = '$C1' returning 1;")" ""
check "the business can't delete students' comments" "$(as_user $M "delete from public.deal_comments where id = '$C1' returning 1;")" ""
check "Fred deletes his own" "$(as_user $F "delete from public.deal_comments where id = '$R2' returning 1;")" "1"
check "admin deletes any" "$(as_user $AD "delete from public.deal_comments where id = '$C2' returning 1;")" "1"

echo " speed limit"
# Fred's reply above was deleted, so it doesn't count.
for i in 1 2 3 4 5 6 7 8 9; do say $F "msg $i" >/dev/null; done
check "the 10th in 10 minutes is accepted" "$(say $F "msg 10" | wc -c | tr -d ' ')" "37"
check "the 11th is refused" "$(say $F "msg 11")" "Slow down: you can post 10 comments every 10 minutes."

echo " erasure"
check "deleting Aline's account removes her comment and its replies" "$(q "select public.tombstone_user_core('$A') ->> 'status'; select count(*) from public.deal_comments where id in ('$C1','$R1');" | tail -1)" "0"
check "deleting the deal removes its comments" "$(q "delete from public.deals where id = '$D'; select count(*) from public.deal_comments;" | tail -1)" "0"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
