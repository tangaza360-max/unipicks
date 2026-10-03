#!/usr/bin/env bash
# Local Postgres test for P3/B1: migration 20261003220000_delete_account_tombstone.
# Builds the schema from EVERY migration in supabase/migrations (in order) on top of
# stubbed Supabase internals (auth, storage, realtime), seeds a realistic student and
# merchant, then checks pre-checks, deletion, anonymisation, kept records, the auth
# tombstone, re-signup, P1/P4 interplay, the admin path, permissions and idempotency.
#
# Usage: bash supabase/tests/delete_account.test.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
DIR="$(mktemp -d /tmp/delete-test.XXXXXX)"
PORT="${PGPORT_TEST:-54337}"
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
  raw_app_meta_data jsonb default '{}'::jsonb, is_sso_user boolean not null default false);
create unique index users_email_partial_key on auth.users (email) where is_sso_user = false;
create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade, provider text, identity_data jsonb);
create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
create table auth.refresh_tokens (id bigserial primary key, user_id varchar(255), session_id uuid references auth.sessions(id) on delete cascade, token text);
create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id) on delete cascade);
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

S=00000000-0000-0000-0000-0000000000a1      # student to delete
B=00000000-0000-0000-0000-0000000000a2      # another student (counterparty)
X=00000000-0000-0000-0000-0000000000a3      # student S blocked
M=00000000-0000-0000-0000-0000000000b1      # merchant (deleted later by an admin)
AD=00000000-0000-0000-0000-0000000000d1     # admin
ACT=00000000-0000-0000-0000-0000000000c1    # blocked: active order
DIS=00000000-0000-0000-0000-0000000000c2    # blocked: open dispute
HOST=00000000-0000-0000-0000-0000000000c3   # blocked: hosting an open group
D=00000000-0000-0000-0000-00000000de01
O1=00000000-0000-0000-0000-0000000000f1
OG=00000000-0000-0000-0000-0000000000f2
GC=00000000-0000-0000-0000-0000000000e1
GO=00000000-0000-0000-0000-0000000000e2
SEMAIL='aline@keplercollege.ac.rw'

# --- Fixtures -----------------------------------------------------------------------
"${PSQL[@]}" >/dev/null <<SQL
insert into auth.users (id, email, phone, encrypted_password, raw_user_meta_data) values
 ('$S','$SEMAIL','250788123456','\$2a\$10\$hash','{"role":"student","full_name":"Aline U","student_id":"K123","phone":"0788123456"}'),
 ('$B','kevin@keplercollege.ac.rw',null,'h','{"role":"student"}'),
 ('$X','x@keplercollege.ac.rw',null,'h','{"role":"student"}'),
 ('$M','shop@gmail.com',null,'h','{"role":"merchant","full_name":"Mama Rose","phone":"0790000000"}'),
 ('$AD','admin@unipicks.app',null,'h','{"role":"student"}'),
 ('$ACT','act@keplercollege.ac.rw',null,'h','{"role":"student"}'),
 ('$DIS','dis@keplercollege.ac.rw',null,'h','{"role":"student"}'),
 ('$HOST','host@keplercollege.ac.rw',null,'h','{"role":"student"}');
update public.user_roles set role='admin' where user_id='$AD';
insert into auth.identities (user_id, provider, identity_data) values ('$S','email','{"email":"$SEMAIL"}');
insert into auth.sessions (id, user_id) values ('00000000-0000-0000-0000-00000000aaaa','$S');
insert into auth.refresh_tokens (user_id, session_id, token) values ('$S','00000000-0000-0000-0000-00000000aaaa','tok');
insert into auth.mfa_factors (user_id) values ('$S');

insert into public.merchant_profiles (id, business_name, approved, momo_pay_code) values ('$M','Mama Rose Kitchen',true,'123456');
insert into public.deals (id, merchant_id, business_name, title, active, price, image_url)
  values ('$D','$M','Mama Rose Kitchen','Lunch plate',true,2500,'https://x/deal-images/$M/a.jpg');
insert into public.merchant_stories (merchant_id, media_url) values ('$M','https://x/story-images/merchants/$M/s.jpg');

insert into public.student_profiles (user_id, username, display_name, university, campus, is_18_plus) values
 ('$S','aline','Aline','x','Kinyinya',true), ('$B','kevin','Kevin','x','Kinyinya',true);
insert into public.friend_requests (sender_id, receiver_id, status) values ('$S','$X','pending');
insert into public.friendships (student_a, student_b) values ('$S','$B');
insert into public.blocked_students (blocker_id, blocked_id) values ('$S','$X'), ('$B','$S');
insert into public.message_requests (sender_id, receiver_id, status) values ('$B','$S','pending');
insert into public.student_stories (id, student_id, media_url, expires_at) values ('00000000-0000-0000-0000-00000000ab01','$S','m',now()+interval '1 day'), ('00000000-0000-0000-0000-00000000ab02','$B','m',now()+interval '1 day');
insert into public.student_story_views (story_id, viewer_id) values ('00000000-0000-0000-0000-00000000ab02','$S'), ('00000000-0000-0000-0000-00000000ab01','$B');
insert into public.business_follows (student_id, merchant_id) values ('$S','$M');
insert into public.student_saved_items (student_id, item_type, item_id) values ('$S','deal','$D');
insert into public.deal_views (deal_id, student_id) values ('$D','$S');
insert into public.deal_searches (student_id, search_query) values ('$S','chips');
insert into public.user_notifications (user_id, type, actor_id, message) values
 ('$S','friend_request','$B','Kevin sent you a request'),
 ('$B','friend_request_accepted','$S','Aline accepted your request'),
 ('$M','dispute_raised','$S','New dispute on order X');

-- A completed order with redemption, payment, rating
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, student_phone, merchant_phone)
  values ('$O1','$S','$M','$D',1,2500,2500,'redeemed',now(),'0788123456','0790000000');
insert into public.redemptions (id, deal_id, student_id, student_name, code, status, order_id)
  values ('00000000-0000-0000-0000-00000000ee01','$D','$S','Aline U','4821','redeemed','$O1');
insert into public.transactions (student_id, deal_id, amount, phone_number, reference, status, normal_order_id)
  values ('$S','$D',2500,'0788123456','ref-1','success','$O1');
insert into public.ratings (deal_id, merchant_id, student_id, redemption_id, rating, review)
  values ('$D','$M','$S','00000000-0000-0000-0000-00000000ee01',5,'Great, ask for Aline');
insert into public.notifications (merchant_id, deal_id, student_name, student_email, message, type)
  values ('$M','$D','Aline U','$SEMAIL','New order from Aline U for 1 item.','order_pending');

-- Groups: one submitted (closed, with an order), one still open (S is a member, B hosts)
insert into public.group_orders (id, deal_id, created_by, host_name, join_code, status) values
 ('$GC','$D','$B','Kevin','GC01','closed'), ('$GO','$D','$B','Kevin','GO01','open');
insert into public.group_order_members (group_order_id, student_id, student_name, quantity) values
 ('$GC','$S','Aline U',1), ('$GO','$S','Aline U',1), ('$GO','$B','Kevin',1);
insert into public.orders (id, student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, group_order_id)
  values ('$OG','$B','$M','$D',2,2000,4000,'completed',now(),'$GC');

-- Chat both ways (kept for the counterparty)
insert into public.chat_messages (sender_id, receiver_id, message) values
 ('$S','$M','Hi, I am Aline, 0788123456'), ('$M','$S','Pickup code: 4821');
insert into public.student_reports (reporter_id, reported_id, category) values ('$B','$S','Spam'), ('$S','$X','Spam');
insert into public.activity_logs (admin_id, action, target_type, target_id, target_name) values ('$AD','approve','student','$S','Aline U');

-- Blockers
insert into public.orders (student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline)
  values ('$ACT','$M','$D',1,2500,2500,'paid',now());
insert into public.orders (student_id, merchant_id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, dispute_status, dispute_raised_by, dispute_raised_at, dispute_reason)
  values ('$DIS','$M','$D',1,2500,2500,'redeemed',now(),'under_review','$DIS',now(),'quality_issue');
insert into public.group_orders (deal_id, created_by, host_name, join_code, status) values ('$D','$HOST','Host','HO01','open');
SQL

PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then echo "  ✅ $1"; PASS=$((PASS+1)); else echo "  ❌ $1"; echo "     expected: $3"; echo "     actual:   $2"; FAIL=$((FAIL+1)); fi; }
tomb() { as_user '' "select public.tombstone_user('$1', $2)::jsonb ->> 'status';"; }

echo "delete account (B1) tests"
echo " permissions"
check "authenticated users cannot call tombstone_user directly" "$(as_user $S "select public.tombstone_user('$S');")" "permission denied for function tombstone_user"
check "a raw DELETE FROM auth.users still fails on NO ACTION FKs (why we tombstone)" "$(q "begin; delete from auth.users where id='$S'; rollback;" 2>&1 | grep -oE 'violates foreign key constraint' | head -1)" "violates foreign key constraint"

echo " pre-checks (nothing in flight)"
check "active (paid, unredeemed) order blocks" "$(tomb $ACT null)" "You have active orders. Finish, collect or cancel them before deleting your account."
check "open dispute blocks" "$(tomb $DIS null)" "You have an open dispute. Wait for it to be resolved before deleting your account."
check "hosting an open group blocks" "$(tomb $HOST null)" "You are hosting an open group order. Submit or cancel it before deleting your account."
check "admin account blocks" "$(tomb $AD null)" "Admin accounts cannot be deleted. Remove the admin role first."
check "a merchant with an active order is blocked" "$(tomb $M null)" "You have active orders. Finish, collect or cancel them before deleting your account."
check "blocked attempts changed nothing" "$(q "select count(*) from auth.users where raw_app_meta_data ? 'deleted_at'")" "0"

echo " self-service deletion of student S"
CHATS_BEFORE=$(q "select count(*) from public.chat_messages")
check "tombstone_user returns deleted" "$(tomb $S null)" "deleted"

echo "  deleted (personal / social)"
for t in "student_profiles:user_id" "friend_requests:sender_id" "friendships:student_a" "message_requests:receiver_id" \
         "student_stories:student_id" "student_saved_items:student_id" "deal_views:student_id" "deal_searches:student_id" \
         "business_follows:student_id" "user_roles:user_id"; do
  tbl=${t%%:*}; col=${t##*:}
  check "$tbl rows for S" "$(q "select count(*) from public.$tbl where $col='$S'")" "0"
done
check "S's views of others' stories deleted" "$(q "select count(*) from public.student_story_views where viewer_id='$S'")" "0"
check "S's own block deleted; B's block on S kept" "$(q "select count(*) filter (where blocker_id='$S') || '/' || count(*) filter (where blocked_id='$S') from public.blocked_students")" "0/1"
check "S's inbox deleted" "$(q "select count(*) from public.user_notifications where user_id='$S'")" "0"
check "others' social notifications naming S deleted" "$(q "select count(*) from public.user_notifications where user_id='$B' and type='friend_request_accepted'")" "0"
check "others' non-social notifications kept, actor cleared" "$(q "select count(*) || '/' || count(actor_id) from public.user_notifications where user_id='$M' and type='dispute_raised'")" "1/0"
check "membership in the OPEN group removed" "$(q "select count(*) from public.group_order_members where group_order_id='$GO' and student_id='$S'")" "0"

echo "  kept, anonymised (financial / transactional)"
check "order kept; student phone removed; merchant phone kept" "$(q "select status || '|' || coalesce(student_phone,'∅') || '|' || coalesce(merchant_phone,'∅') from public.orders where id='$O1'")" "redeemed|∅|0790000000"
check "transaction kept, phone masked 078****456" "$(q "select status || '|' || amount || '|' || phone_number from public.transactions where reference='ref-1'")" "success|2500|078****456"
check "redemption kept (code), name removed" "$(q "select code || '|' || coalesce(student_name,'∅') from public.redemptions where order_id='$O1'")" "4821|∅"
check "rating score kept, review text removed" "$(q "select rating || '|' || coalesce(review,'∅') from public.ratings where student_id='$S'")" "5|∅"
check "submitted group membership kept as 'Deleted user'" "$(q "select student_name from public.group_order_members where group_order_id='$GC' and student_id='$S'")" "Deleted user"
check "merchant inbox rows naming S scrubbed" "$(q "select count(*) from public.notifications where student_email ilike '$SEMAIL' or student_name ilike '%Aline%' or message ilike '%Aline%'")" "0"
check "activity log target name scrubbed" "$(q "select string_agg(distinct target_name, ',') from public.activity_logs where target_id='$S'")" "Deleted user"
check "chat history kept for the counterparty" "$(q "select count(*) from public.chat_messages")" "$CHATS_BEFORE"
check "reports by and against S kept" "$(q "select count(*) from public.student_reports where reporter_id='$S' or reported_id='$S'")" "2"

echo "  auth tombstone"
check "email replaced with placeholder" "$(q "select email from auth.users where id='$S'")" "deleted-$S@deleted.unipicks.invalid"
check "phone and user_metadata cleared" "$(q "select coalesce(phone,'∅') || '|' || raw_user_meta_data::text from auth.users where id='$S'")" "∅|{}"
check "app_metadata: deleted_at + banned, no student_id/university" "$(q "select (raw_app_meta_data ? 'deleted_at')::text || '|' || (raw_app_meta_data->>'banned') || '|' || (raw_app_meta_data ? 'student_id')::text || '|' || (raw_app_meta_data ? 'university')::text from auth.users where id='$S'")" "true|true|false|false"
check "email kept only as sha256" "$(q "select raw_app_meta_data->>'deleted_email_sha256' = encode(sha256(convert_to('$SEMAIL','UTF8')),'hex') from auth.users where id='$S'")" "t"
check "password hash replaced (unusable)" "$(q "select encrypted_password like 'deleted:%' from auth.users where id='$S'")" "t"
check "banned_until set far in the future" "$(q "select banned_until > now() + interval '50 years' from auth.users where id='$S'")" "t"
check "sessions, refresh tokens, identities, MFA removed" "$(q "select (select count(*) from auth.sessions where user_id='$S') + (select count(*) from auth.refresh_tokens where user_id='$S') + (select count(*) from auth.identities where user_id='$S') + (select count(*) from auth.mfa_factors where user_id='$S')")" "0"
check "is_banned() (P4) is true" "$(q "select public.is_banned('$S')::text")" "true"
check "a live token can't write (P4 guard)" "$(as_user $S "insert into public.chat_messages (sender_id, receiver_id, message) values ('$S','$M','hi');")" "Your account is suspended. Contact support."
check "audit log entry without personal data" "$(q "select action || '|' || target_name || '|' || (details->>'by') || '|' || coalesce(admin_id::text,'∅') from public.activity_logs where action='account_deleted' and target_id='$S'")" "account_deleted|Deleted user|self|∅"

echo "  re-signup and trigger interplay"
check "same email can sign up again as a new account" "$(q "insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000a9','$SEMAIL','{\"role\":\"student\",\"student_id\":\"K999\"}') returning 'ok'")" "ok"
check "new account gets fresh verified identity (P1)" "$(q "select raw_app_meta_data->>'university' || '|' || (raw_app_meta_data->>'student_id') from auth.users where id='00000000-0000-0000-0000-0000000000a9'")" "Kepler College|K999"
q "update auth.users set raw_app_meta_data = '{\"provider\":\"email\"}' where id='$S'" >/dev/null
check "auth-server app_metadata rewrite can't resurrect student_id or unban (P1 fix)" "$(q "select (raw_app_meta_data ? 'deleted_at')::text || '|' || (raw_app_meta_data->>'banned') || '|' || (raw_app_meta_data ? 'student_id')::text from auth.users where id='$S'")" "true|true|false"
check "second call is idempotent" "$(tomb $S null)" "already_deleted"

echo " admin deletion of merchant M (admin_delete_user, previously a raw DELETE)"
q "update public.orders set status='completed' where student_id='$ACT'" >/dev/null
check "a merchant with an open dispute (as merchant) is blocked" "$(tomb $M "'$AD'")" "You have an open dispute. Wait for it to be resolved before deleting your account."
q "update public.orders set dispute_status='resolved' where student_id='$DIS'" >/dev/null
check "non-admin cannot use admin_delete_user" "$(as_user $B "select public.admin_delete_user('$M');")" "Only admins can perform this action"
check "admin cannot delete themselves" "$(as_user $AD "select public.admin_delete_user('$AD');")" "You cannot delete your own admin account"
check "admin_delete_user now tombstones" "$(as_user $AD "select (public.admin_delete_user('$M') -> 'result' ->> 'status');")" "deleted"
check "merchant profile, stories and inbox deleted" "$(q "select (select count(*) from public.merchant_profiles where id='$M') + (select count(*) from public.merchant_stories where merchant_id='$M') + (select count(*) from public.notifications where merchant_id='$M')")" "0"
check "deal kept, inactive, image removed (orders still reference it)" "$(q "select active::text || '|' || coalesce(image_url,'∅') from public.deals where id='$D'")" "false|∅"
check "orders as merchant kept; merchant phone removed" "$(q "select count(*) || '|' || count(merchant_phone) from public.orders where merchant_id='$M'")" "4|0"
check "other students' records untouched (B's group order)" "$(q "select status from public.orders where id='$OG'")" "completed"
check "audit log records the admin as actor" "$(q "select (details->>'by') || '|' || (admin_id = '$AD')::text from public.activity_logs where action='account_deleted' and target_id='$M'")" "admin|true"

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
