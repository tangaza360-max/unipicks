create extension if not exists pgcrypto;

-- ============================================================
-- UNIPICKS SOCIAL — STUDENT PROFILES
-- ============================================================

create table if not exists public.student_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,

  username text not null,
  display_name text not null,
  university text not null,
  campus text not null,
  student_description text,
  short_bio text,

  is_18_plus boolean not null default false,
  discoverable boolean not null default true,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_profiles_username_not_empty
    check (length(trim(username)) > 0),

  constraint student_profiles_display_name_not_empty
    check (length(trim(display_name)) > 0),

  constraint student_profiles_university_not_empty
    check (length(trim(university)) > 0),

  constraint student_profiles_campus_not_empty
    check (length(trim(campus)) > 0),

  constraint student_profiles_18_plus_required
    check (is_18_plus = true)
);

create unique index if not exists student_profiles_username_lower_unique
  on public.student_profiles (lower(username));


-- ============================================================
-- FRIEND REQUESTS
-- ============================================================

create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),

  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),

  created_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint friend_requests_no_self
    check (sender_id <> receiver_id)
);

create index if not exists friend_requests_sender_idx
  on public.friend_requests (sender_id);

create index if not exists friend_requests_receiver_idx
  on public.friend_requests (receiver_id);

create index if not exists friend_requests_status_idx
  on public.friend_requests (status);


-- ============================================================
-- FRIENDSHIPS
-- One canonical row per friendship.
-- ============================================================

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),

  student_a uuid not null references auth.users(id) on delete cascade,
  student_b uuid not null references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint friendships_no_self
    check (student_a <> student_b),

  constraint friendships_canonical_order
    check (student_a < student_b),

  constraint friendships_unique_pair
    unique (student_a, student_b)
);

create index if not exists friendships_student_a_idx
  on public.friendships (student_a);

create index if not exists friendships_student_b_idx
  on public.friendships (student_b);


-- ============================================================
-- BLOCKED STUDENTS
-- ============================================================

create table if not exists public.blocked_students (
  id uuid primary key default gen_random_uuid(),

  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint blocked_students_no_self
    check (blocker_id <> blocked_id),

  constraint blocked_students_unique_pair
    unique (blocker_id, blocked_id)
);

create index if not exists blocked_students_blocker_idx
  on public.blocked_students (blocker_id);

create index if not exists blocked_students_blocked_idx
  on public.blocked_students (blocked_id);


-- ============================================================
-- STUDENT REPORTS
-- ============================================================

create table if not exists public.student_reports (
  id uuid primary key default gen_random_uuid(),

  reporter_id uuid not null references auth.users(id) on delete cascade,
  reported_id uuid not null references auth.users(id) on delete cascade,

  category text not null
    check (
      category in (
        'Harassment',
        'Spam',
        'Impersonation',
        'Inappropriate behavior',
        'Other'
      )
    ),

  description text,

  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'resolved', 'dismissed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_reports_no_self
    check (reporter_id <> reported_id)
);

create index if not exists student_reports_reporter_idx
  on public.student_reports (reporter_id);

create index if not exists student_reports_reported_idx
  on public.student_reports (reported_id);

create index if not exists student_reports_status_idx
  on public.student_reports (status);


-- ============================================================
-- MESSAGE REQUESTS
-- ============================================================

create table if not exists public.message_requests (
  id uuid primary key default gen_random_uuid(),

  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,

  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),

  created_at timestamptz not null default now(),
  responded_at timestamptz,

  constraint message_requests_no_self
    check (sender_id <> receiver_id)
);

create index if not exists message_requests_sender_idx
  on public.message_requests (sender_id);

create index if not exists message_requests_receiver_idx
  on public.message_requests (receiver_id);

create index if not exists message_requests_status_idx
  on public.message_requests (status);


-- ============================================================
-- SOCIAL NOTIFICATIONS
-- ============================================================

create table if not exists public.social_notifications (
  id uuid primary key default gen_random_uuid(),

  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,

  actor_id uuid references auth.users(id) on delete set null,
  reference_id uuid,

  message text not null,

  is_read boolean not null default false,

  created_at timestamptz not null default now()
);

create index if not exists social_notifications_user_idx
  on public.social_notifications (user_id);

create index if not exists social_notifications_created_idx
  on public.social_notifications (created_at desc);

create index if not exists social_notifications_unread_idx
  on public.social_notifications (user_id, is_read);


-- ============================================================
-- STUDENT STORIES
-- ============================================================

create table if not exists public.student_stories (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references auth.users(id) on delete cascade,

  media_url text not null,
  caption text,

  type text not null default 'image'
    check (type in ('image', 'video')),

  visibility text not null default 'everyone'
    check (visibility in ('everyone', 'friends')),

  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  constraint student_stories_expiry_after_creation
    check (expires_at > created_at)
);

create index if not exists student_stories_student_idx
  on public.student_stories (student_id);

create index if not exists student_stories_expiry_idx
  on public.student_stories (expires_at);


-- ============================================================
-- STORY VIEWS
-- ============================================================

create table if not exists public.student_story_views (
  id uuid primary key default gen_random_uuid(),

  story_id uuid not null references public.student_stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,

  viewed_at timestamptz not null default now(),

  constraint student_story_views_unique_view
    unique (story_id, viewer_id)
);

create index if not exists student_story_views_story_idx
  on public.student_story_views (story_id);

create index if not exists student_story_views_viewer_idx
  on public.student_story_views (viewer_id);


-- ============================================================
-- STORY REACTIONS
-- ============================================================

create table if not exists public.student_story_reactions (
  id uuid primary key default gen_random_uuid(),

  story_id uuid not null references public.student_stories(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,

  reaction text not null
    check (
      reaction in (
        '❤️',
        '👍',
        '😂',
        '😮',
        '😢',
        '🔥'
      )
    ),

  created_at timestamptz not null default now(),

  constraint student_story_reactions_unique
    unique (story_id, student_id)
);

create index if not exists student_story_reactions_story_idx
  on public.student_story_reactions (story_id);

create index if not exists student_story_reactions_student_idx
  on public.student_story_reactions (student_id);


-- ============================================================
-- BUSINESS FOLLOWS
-- ============================================================

create table if not exists public.business_follows (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references auth.users(id) on delete cascade,
  merchant_id uuid not null references auth.users(id) on delete cascade,

  created_at timestamptz not null default now(),

  constraint business_follows_unique
    unique (student_id, merchant_id)
);

create index if not exists business_follows_student_idx
  on public.business_follows (student_id);

create index if not exists business_follows_merchant_idx
  on public.business_follows (merchant_id);


-- ============================================================
-- STUDENT INTERESTS
-- ============================================================

create table if not exists public.student_interests (
  student_id uuid not null references auth.users(id) on delete cascade,
  interest text not null,

  created_at timestamptz not null default now(),

  primary key (student_id, interest)
);

create index if not exists student_interests_interest_idx
  on public.student_interests (interest);


-- ============================================================
-- SAVED SOCIAL ITEMS
-- ============================================================

create table if not exists public.student_saved_items (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references auth.users(id) on delete cascade,

  item_type text not null
    check (item_type in ('deal', 'event', 'activity')),

  item_id uuid not null,

  created_at timestamptz not null default now(),

  constraint student_saved_items_unique
    unique (student_id, item_type, item_id)
);

create index if not exists student_saved_items_student_idx
  on public.student_saved_items (student_id);

create index if not exists student_saved_items_item_idx
  on public.student_saved_items (item_type, item_id);


-- ============================================================
-- SOCIAL CONTENT INTERACTIONS
-- Used for future For You ranking signals.
-- ============================================================

create table if not exists public.social_content_interactions (
  id uuid primary key default gen_random_uuid(),

  student_id uuid not null references auth.users(id) on delete cascade,

  item_type text not null
    check (item_type in ('deal', 'event', 'activity')),

  item_id uuid not null,

  interaction_type text not null
    check (
      interaction_type in (
        'viewed',
        'opened',
        'shared',
        'purchased',
        'joined'
      )
    ),

  created_at timestamptz not null default now()
);

create index if not exists social_content_interactions_student_idx
  on public.social_content_interactions (student_id);

create index if not exists social_content_interactions_item_idx
  on public.social_content_interactions (item_type, item_id);

create index if not exists social_content_interactions_created_idx
  on public.social_content_interactions (created_at desc);


-- ============================================================
-- UPDATED_AT FUNCTIONS
-- ============================================================

create or replace function public.set_student_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists student_profiles_set_updated_at
  on public.student_profiles;

create trigger student_profiles_set_updated_at
before update on public.student_profiles
for each row
execute function public.set_student_profile_updated_at();


-- ============================================================
-- FRIENDSHIP / BLOCK HELPERS
-- ============================================================

create or replace function public.are_students_friends(
  first_student uuid,
  second_student uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.friendships
    where student_a = least(first_student, second_student)
      and student_b = greatest(first_student, second_student)
  );
$$;


create or replace function public.are_students_blocked(
  first_student uuid,
  second_student uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.blocked_students
    where
      (blocker_id = first_student and blocked_id = second_student)
      or
      (blocker_id = second_student and blocked_id = first_student)
  );
$$;


-- ============================================================
-- SEND FRIEND REQUEST
-- ============================================================

create or replace function public.send_friend_request(
  target_student uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
  new_request_id uuid;
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  if target_student is null then
    raise exception 'Student is required';
  end if;

  if current_student = target_student then
    raise exception 'You cannot send a friend request to yourself';
  end if;

  if not exists (
    select 1
    from public.student_profiles
    where user_id = current_student
      and is_18_plus = true
  ) then
    raise exception 'Complete your Social profile first';
  end if;

  if not exists (
    select 1
    from public.student_profiles
    where user_id = target_student
      and is_18_plus = true
      and discoverable = true
  ) then
    raise exception 'Student not available';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      least(current_student::text, target_student::text)
      || ':'
      || greatest(current_student::text, target_student::text),
      0
    )
  );

  if public.are_students_blocked(current_student, target_student) then
    raise exception 'You cannot interact with this student';
  end if;

  if public.are_students_friends(current_student, target_student) then
    raise exception 'You are already friends';
  end if;

  if exists (
    select 1
    from public.friend_requests
    where status = 'pending'
      and (
        (sender_id = current_student and receiver_id = target_student)
        or
        (sender_id = target_student and receiver_id = current_student)
      )
  ) then
    raise exception 'A friend request is already pending';
  end if;

  if exists (
    select 1
    from public.friend_requests
    where status = 'declined'
      and created_at >= now() - interval '30 days'
      and (
        (sender_id = current_student and receiver_id = target_student)
        or
        (sender_id = target_student and receiver_id = current_student)
      )
  ) then
    raise exception 'Please wait before sending another friend request';
  end if;

  insert into public.friend_requests (
    sender_id,
    receiver_id,
    status
  )
  values (
    current_student,
    target_student,
    'pending'
  )
  returning id into new_request_id;

  insert into public.social_notifications (
    user_id,
    type,
    actor_id,
    reference_id,
    message
  )
  values (
    target_student,
    'friend_request',
    current_student,
    new_request_id,
    'You have a new friend request.'
  );

  return new_request_id;
end;
$$;


-- ============================================================
-- ACCEPT FRIEND REQUEST
-- ============================================================

create or replace function public.accept_friend_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
  request_sender uuid;
  request_receiver uuid;
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  select sender_id, receiver_id
  into request_sender, request_receiver
  from public.friend_requests
  where id = request_id
    and status = 'pending'
  for update;

  if request_receiver is null then
    raise exception 'Friend request not found';
  end if;

  if request_receiver <> current_student then
    raise exception 'You cannot accept this friend request';
  end if;

  if public.are_students_blocked(current_student, request_sender) then
    raise exception 'You cannot interact with this student';
  end if;

  insert into public.friendships (
    student_a,
    student_b
  )
  values (
    least(request_sender, request_receiver),
    greatest(request_sender, request_receiver)
  )
  on conflict (student_a, student_b) do nothing;

  update public.friend_requests
  set
    status = 'accepted',
    responded_at = now()
  where id = request_id;

  insert into public.social_notifications (
    user_id,
    type,
    actor_id,
    reference_id,
    message
  )
  values (
    request_sender,
    'friend_request_accepted',
    current_student,
    request_id,
    '@' ||
      coalesce(
        (
          select username
          from public.student_profiles
          where user_id = current_student
        ),
        'student'
      ) ||
      ' accepted your friend request.'
  );

  return true;
end;
$$;


-- ============================================================
-- DECLINE FRIEND REQUEST
-- ============================================================

create or replace function public.decline_friend_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.friend_requests
    where id = request_id
      and receiver_id = current_student
      and status = 'pending'
  ) then
    raise exception 'Friend request not found';
  end if;

  update public.friend_requests
  set
    status = 'declined',
    responded_at = now()
  where id = request_id
    and receiver_id = current_student
    and status = 'pending';

  return true;
end;
$$;


-- ============================================================
-- CANCEL FRIEND REQUEST
-- ============================================================

create or replace function public.cancel_friend_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  delete from public.friend_requests
  where id = request_id
    and sender_id = current_student
    and status = 'pending';

  if not found then
    raise exception 'Friend request not found';
  end if;

  return true;
end;
$$;


-- ============================================================
-- BLOCK STUDENT
-- Blocking removes:
--   - friendship
--   - pending friend requests
--   - pending message requests
-- ============================================================

create or replace function public.block_student(
  target_student uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  if target_student is null then
    raise exception 'Student is required';
  end if;

  if current_student = target_student then
    raise exception 'You cannot block yourself';
  end if;

  if not exists (
    select 1
    from public.student_profiles
    where user_id = target_student
  ) then
    raise exception 'Student not found';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      least(current_student::text, target_student::text)
      || ':'
      || greatest(current_student::text, target_student::text),
      0
    )
  );

  insert into public.blocked_students (
    blocker_id,
    blocked_id
  )
  values (
    current_student,
    target_student
  )
  on conflict (blocker_id, blocked_id) do nothing;

  delete from public.friendships
  where student_a = least(current_student, target_student)
    and student_b = greatest(current_student, target_student);

  delete from public.friend_requests
  where status = 'pending'
    and (
      (sender_id = current_student and receiver_id = target_student)
      or
      (sender_id = target_student and receiver_id = current_student)
    );

  delete from public.message_requests
  where status = 'pending'
    and (
      (sender_id = current_student and receiver_id = target_student)
      or
      (sender_id = target_student and receiver_id = current_student)
    );

  return true;
end;
$$;


-- ============================================================
-- UNBLOCK STUDENT
-- ============================================================

create or replace function public.unblock_student(
  target_student uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  delete from public.blocked_students
  where blocker_id = current_student
    and blocked_id = target_student;

  return true;
end;
$$;


-- ============================================================
-- SEND MESSAGE REQUEST
--
-- Rules:
--   Friends do not need message requests.
--   Non-friends may send one initial request.
--   Blocked students cannot interact.
--   A declined request prevents repeated unsolicited requests.
-- ============================================================

create or replace function public.send_message_request(
  target_student uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
  new_request_id uuid;
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  if target_student is null then
    raise exception 'Student is required';
  end if;

  if current_student = target_student then
    raise exception 'You cannot message yourself through a message request';
  end if;

  if not exists (
    select 1
    from public.student_profiles
    where user_id = current_student
      and is_18_plus = true
  ) then
    raise exception 'Complete your Social profile first';
  end if;

  if not exists (
    select 1
    from public.student_profiles
    where user_id = target_student
      and is_18_plus = true
  ) then
    raise exception 'Student not available';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      least(current_student::text, target_student::text)
      || ':'
      || greatest(current_student::text, target_student::text),
      0
    )
  );

  if public.are_students_blocked(current_student, target_student) then
    raise exception 'You cannot message this student';
  end if;

  if public.are_students_friends(current_student, target_student) then
    raise exception 'You are already friends and can message directly';
  end if;

  if exists (
    select 1
    from public.message_requests
    where status = 'pending'
      and (
        (sender_id = current_student and receiver_id = target_student)
        or
        (sender_id = target_student and receiver_id = current_student)
      )
  ) then
    raise exception 'A message request is already pending';
  end if;

  if exists (
    select 1
    from public.message_requests
    where status = 'declined'
      and (
        (sender_id = current_student and receiver_id = target_student)
        or
        (sender_id = target_student and receiver_id = current_student)
      )
  ) then
    raise exception 'This student has already declined a message request';
  end if;

  insert into public.message_requests (
    sender_id,
    receiver_id,
    status
  )
  values (
    current_student,
    target_student,
    'pending'
  )
  returning id into new_request_id;

  insert into public.social_notifications (
    user_id,
    type,
    actor_id,
    reference_id,
    message
  )
  values (
    target_student,
    'message_request',
    current_student,
    new_request_id,
    'You have a new message request.'
  );

  return new_request_id;
end;
$$;


-- ============================================================
-- ACCEPT MESSAGE REQUEST
-- ============================================================

create or replace function public.accept_message_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
  request_sender uuid;
  request_receiver uuid;
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  select sender_id, receiver_id
  into request_sender, request_receiver
  from public.message_requests
  where id = request_id
    and status = 'pending'
  for update;

  if request_receiver is null then
    raise exception 'Message request not found';
  end if;

  if request_receiver <> current_student then
    raise exception 'You cannot accept this message request';
  end if;

  if public.are_students_blocked(current_student, request_sender) then
    raise exception 'You cannot interact with this student';
  end if;

  update public.message_requests
  set
    status = 'accepted',
    responded_at = now()
  where id = request_id
    and receiver_id = current_student
    and status = 'pending';

  insert into public.social_notifications (
    user_id,
    type,
    actor_id,
    reference_id,
    message
  )
  values (
    request_sender,
    'message_request_accepted',
    current_student,
    request_id,
    'Your message request was accepted.'
  );

  return true;
end;
$$;


-- ============================================================
-- DECLINE MESSAGE REQUEST
-- ============================================================

create or replace function public.decline_message_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.message_requests
    where id = request_id
      and receiver_id = current_student
      and status = 'pending'
  ) then
    raise exception 'Message request not found';
  end if;

  update public.message_requests
  set
    status = 'declined',
    responded_at = now()
  where id = request_id
    and receiver_id = current_student
    and status = 'pending';

  return true;
end;
$$;


-- ============================================================
-- CANCEL MESSAGE REQUEST
-- ============================================================

create or replace function public.cancel_message_request(
  request_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  delete from public.message_requests
  where id = request_id
    and sender_id = current_student
    and status = 'pending';

  if not found then
    raise exception 'Message request not found';
  end if;

  return true;
end;
$$;


-- ============================================================
-- FUNCTION GRANTS
-- ============================================================

grant execute on function public.send_friend_request(uuid)
  to authenticated;

grant execute on function public.accept_friend_request(uuid)
  to authenticated;

grant execute on function public.decline_friend_request(uuid)
  to authenticated;

grant execute on function public.cancel_friend_request(uuid)
  to authenticated;

grant execute on function public.block_student(uuid)
  to authenticated;

grant execute on function public.unblock_student(uuid)
  to authenticated;

grant execute on function public.send_message_request(uuid)
  to authenticated;

grant execute on function public.accept_message_request(uuid)
  to authenticated;

grant execute on function public.decline_message_request(uuid)
  to authenticated;

grant execute on function public.cancel_message_request(uuid)
  to authenticated;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.student_profiles enable row level security;
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocked_students enable row level security;
alter table public.student_reports enable row level security;
alter table public.message_requests enable row level security;
alter table public.social_notifications enable row level security;
alter table public.student_stories enable row level security;
alter table public.student_story_views enable row level security;
alter table public.student_story_reactions enable row level security;
alter table public.business_follows enable row level security;
alter table public.student_interests enable row level security;
alter table public.student_saved_items enable row level security;
alter table public.social_content_interactions enable row level security;


-- ============================================================
-- STUDENT PROFILE POLICIES
-- ============================================================

drop policy if exists students_manage_own_social_profile
  on public.student_profiles;

create policy students_manage_own_social_profile
on public.student_profiles
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());


-- ============================================================
-- FRIEND REQUEST POLICIES
-- No direct INSERT/UPDATE.
-- Requests are controlled through functions.
-- ============================================================

drop policy if exists students_view_own_friend_requests
  on public.friend_requests;

create policy students_view_own_friend_requests
on public.friend_requests
for select
to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);


-- ============================================================
-- FRIENDSHIP POLICIES
-- ============================================================

drop policy if exists students_view_own_friendships
  on public.friendships;

create policy students_view_own_friendships
on public.friendships
for select
to authenticated
using (
  student_a = auth.uid()
  or student_b = auth.uid()
);


drop policy if exists students_delete_own_friendships
  on public.friendships;

create policy students_delete_own_friendships
on public.friendships
for delete
to authenticated
using (
  student_a = auth.uid()
  or student_b = auth.uid()
);


-- ============================================================
-- BLOCK POLICIES
-- No direct INSERT.
-- Blocking goes through block_student().
-- ============================================================

drop policy if exists students_view_own_blocks
  on public.blocked_students;

create policy students_view_own_blocks
on public.blocked_students
for select
to authenticated
using (
  blocker_id = auth.uid()
);


-- ============================================================
-- REPORT POLICIES
-- ============================================================

drop policy if exists students_view_own_reports
  on public.student_reports;

create policy students_view_own_reports
on public.student_reports
for select
to authenticated
using (
  reporter_id = auth.uid()
);


drop policy if exists students_create_reports
  on public.student_reports;

create policy students_create_reports
on public.student_reports
for insert
to authenticated
with check (
  reporter_id = auth.uid()
);


-- ============================================================
-- MESSAGE REQUEST POLICIES
-- No direct INSERT/UPDATE.
-- Requests are controlled through functions.
-- ============================================================

drop policy if exists students_view_own_message_requests
  on public.message_requests;

create policy students_view_own_message_requests
on public.message_requests
for select
to authenticated
using (
  sender_id = auth.uid()
  or receiver_id = auth.uid()
);


-- ============================================================
-- SOCIAL NOTIFICATION POLICIES
-- ============================================================

drop policy if exists students_view_own_social_notifications
  on public.social_notifications;

create policy students_view_own_social_notifications
on public.social_notifications
for select
to authenticated
using (
  user_id = auth.uid()
);


drop policy if exists students_update_own_social_notifications
  on public.social_notifications;

create policy students_update_own_social_notifications
on public.social_notifications
for update
to authenticated
using (
  user_id = auth.uid()
)
with check (
  user_id = auth.uid()
);


-- ============================================================
-- STUDENT STORY POLICIES
-- Owner management for now.
-- Public/friend viewing will be exposed through controlled
-- access later.
-- ============================================================

drop policy if exists students_create_own_stories
  on public.student_stories;

create policy students_create_own_stories
on public.student_stories
for insert
to authenticated
with check (
  student_id = auth.uid()
);


drop policy if exists students_update_own_stories
  on public.student_stories;

create policy students_update_own_stories
on public.student_stories
for update
to authenticated
using (
  student_id = auth.uid()
)
with check (
  student_id = auth.uid()
);


drop policy if exists students_delete_own_stories
  on public.student_stories;

create policy students_delete_own_stories
on public.student_stories
for delete
to authenticated
using (
  student_id = auth.uid()
);


drop policy if exists students_view_own_stories
  on public.student_stories;

create policy students_view_own_stories
on public.student_stories
for select
to authenticated
using (
  student_id = auth.uid()
);


-- ============================================================
-- STORY VIEW POLICIES
-- ============================================================

drop policy if exists students_create_story_views
  on public.student_story_views;

create policy students_create_story_views
on public.student_story_views
for insert
to authenticated
with check (
  viewer_id = auth.uid()
);


drop policy if exists students_view_story_views
  on public.student_story_views;

create policy students_view_story_views
on public.student_story_views
for select
to authenticated
using (
  viewer_id = auth.uid()
  or exists (
    select 1
    from public.student_stories
    where student_stories.id = student_story_views.story_id
      and student_stories.student_id = auth.uid()
  )
);


-- ============================================================
-- STORY REACTION POLICIES
-- ============================================================

drop policy if exists students_manage_story_reactions
  on public.student_story_reactions;

create policy students_manage_story_reactions
on public.student_story_reactions
for all
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.student_stories
    where student_stories.id = student_story_reactions.story_id
      and student_stories.student_id = auth.uid()
  )
)
with check (
  student_id = auth.uid()
);


-- ============================================================
-- BUSINESS FOLLOW POLICIES
-- ============================================================

drop policy if exists students_manage_own_business_follows
  on public.business_follows;

create policy students_manage_own_business_follows
on public.business_follows
for all
to authenticated
using (
  student_id = auth.uid()
)
with check (
  student_id = auth.uid()
);


-- ============================================================
-- STUDENT INTEREST POLICIES
-- ============================================================

drop policy if exists students_manage_own_interests
  on public.student_interests;

create policy students_manage_own_interests
on public.student_interests
for all
to authenticated
using (
  student_id = auth.uid()
)
with check (
  student_id = auth.uid()
);


-- ============================================================
-- SAVED ITEM POLICIES
-- ============================================================

drop policy if exists students_manage_own_saved_items
  on public.student_saved_items;

create policy students_manage_own_saved_items
on public.student_saved_items
for all
to authenticated
using (
  student_id = auth.uid()
)
with check (
  student_id = auth.uid()
);


-- ============================================================
-- CONTENT INTERACTION POLICIES
-- ============================================================

drop policy if exists students_manage_own_content_interactions
  on public.social_content_interactions;

create policy students_manage_own_content_interactions
on public.social_content_interactions
for all
to authenticated
using (
  student_id = auth.uid()
)
with check (
  student_id = auth.uid()
);