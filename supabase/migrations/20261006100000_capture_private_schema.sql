-- Bring the production-only `private` schema into the migrations (clean-up,
-- founder request 2026-10-06).
--
-- Why: production has a `private` schema created by hand (not in any
-- migration). 18 public functions there are thin wrappers that call the real
-- code in private. Our tests build the database from the migrations, so they
-- tested the public copies, not what production runs; that is how the
-- "social_notifications does not exist" bug (fixed in 20261006090000) got past
-- them.
--
-- What this does:
--   1. creates the private schema (same rights as production: only signed-in
--      users may use it);
--   2. copies the 18 production private functions exactly (read from
--      production on 2026-10-06; the five friend / message functions with the
--      user_notifications fix of 20261006090000);
--   3. makes the 18 public functions the same thin wrappers as production;
--   4. removes private.create_group_order_with_host and
--      private.find_open_group_order_by_code: old copies that nothing calls
--      (the app uses the up-to-date public versions).
-- In production steps 1–3 change nothing (same code); step 4 removes dead code.
-- Grants match production: authenticated and service_role may execute, not
-- anon or public.
--
-- Rule from now on: change these functions in `private` (the public ones only
-- forward the call).

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------------
-- Roles and settings
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_my_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT role
  FROM public.user_roles
  WHERE user_id = auth.uid()
$function$;

CREATE OR REPLACE FUNCTION private.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role = 'admin'
  )
$function$;

CREATE OR REPLACE FUNCTION private.get_setting(setting_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$
DECLARE
  setting_value jsonb;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  SELECT value INTO setting_value
  FROM public.system_settings
  WHERE key = setting_key;

  RETURN setting_value;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Deal tracking
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.record_deal_search(p_search_query text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  cleaned_query text;
begin
  if auth.uid() is null then
    return;
  end if;

  cleaned_query := lower(trim(p_search_query));

  if cleaned_query = '' or char_length(cleaned_query) > 100 then
    return;
  end if;

  insert into public.deal_searches (
    student_id,
    search_query
  )
  values (
    auth.uid(),
    cleaned_query
  );
end;
$function$;

CREATE OR REPLACE FUNCTION private.record_deal_view(p_deal_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then
    return;
  end if;

  if not exists (
    select 1
    from public.deals
    where id = p_deal_id
      and active = true
  ) then
    return;
  end if;

  if exists (
    select 1
    from public.deal_views
    where deal_id = p_deal_id
      and student_id = auth.uid()
      and viewed_at >= now() - interval '30 minutes'
  ) then
    return;
  end if;

  insert into public.deal_views (
    deal_id,
    student_id
  )
  values (
    p_deal_id,
    auth.uid()
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Student search and profiles
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.search_students(search_query text)
 RETURNS TABLE(user_id uuid, username text, display_name text, university text, campus text, student_description text, short_bio text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_student uuid := auth.uid();
  normalized_query text;
begin
  if current_student is null then
    raise exception 'Authentication required';
  end if;

  normalized_query := lower(
    regexp_replace(
      coalesce(trim(search_query), ''),
      '[\s._-]+',
      '',
      'g'
    )
  );

  -- Empty searches do not return student results.
  if normalized_query = '' then
    return;
  end if;

  return query
  select
    sp.user_id,
    sp.username,
    sp.display_name,
    sp.university,
    sp.campus,
    sp.student_description,
    sp.short_bio
  from public.student_profiles sp
  where sp.is_18_plus = true
    and sp.discoverable = true
    and sp.user_id <> current_student

    -- Do not expose students blocked by the current user
    -- or students who have blocked the current user.
    and not exists (
      select 1
      from public.blocked_students b
      where
        (b.blocker_id = current_student and b.blocked_id = sp.user_id)
        or
        (b.blocker_id = sp.user_id and b.blocked_id = current_student)
    )

    -- Username search:
    -- ignores spaces and common separators.
    and (
      lower(
        regexp_replace(
          sp.username,
          '[\s._-]+',
          '',
          'g'
        )
      ) like '%' || normalized_query || '%'

      or

      -- Display-name search:
      -- ignores spaces and common separators.
      lower(
        regexp_replace(
          sp.display_name,
          '[\s._-]+',
          '',
          'g'
        )
      ) like '%' || normalized_query || '%'
    )

  order by
    case
      when lower(
        regexp_replace(
          sp.username,
          '[\s._-]+',
          '',
          'g'
        )
      ) = normalized_query then 0

      when lower(
        regexp_replace(
          sp.username,
          '[\s._-]+',
          '',
          'g'
        )
      ) like normalized_query || '%' then 1

      when lower(
        regexp_replace(
          sp.display_name,
          '[\s._-]+',
          '',
          'g'
        )
      ) like normalized_query || '%' then 2

      else 3
    end,
    lower(sp.username),
    lower(sp.display_name)

  limit 30;
end;
$function$;

CREATE OR REPLACE FUNCTION private.get_student_message_profiles(target_student_ids uuid[])
 RETURNS TABLE(user_id uuid, username text, display_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  return query
  select
    sp.user_id,
    sp.username,
    sp.display_name
  from public.student_profiles sp
  where sp.user_id = any(target_student_ids)
    and sp.user_id <> auth.uid()
    and sp.is_18_plus = true
    and not exists (
      select 1
      from public.blocked_students b
      where
        (b.blocker_id = auth.uid() and b.blocked_id = sp.user_id)
        or
        (b.blocker_id = sp.user_id and b.blocked_id = auth.uid())
    );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Friend requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.send_friend_request(target_student uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  insert into public.user_notifications (
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
$function$;

CREATE OR REPLACE FUNCTION private.accept_friend_request(request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  insert into public.user_notifications (
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
$function$;

CREATE OR REPLACE FUNCTION private.decline_friend_request(request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.cancel_friend_request(request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- Message requests
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.send_message_request(target_student uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  insert into public.user_notifications (
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
$function$;

CREATE OR REPLACE FUNCTION private.accept_message_request(request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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

  insert into public.user_notifications (
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
$function$;

CREATE OR REPLACE FUNCTION private.decline_message_request(request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.cancel_message_request(request_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- Blocks
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.block_student(target_student uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION private.unblock_student(target_student uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$;

-- ---------------------------------------------------------------------------
-- Social activity (Social → Activity)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.get_social_activity()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  current_student uuid := auth.uid();
begin
  if current_student is null then
    raise exception 'Not authenticated';
  end if;

  return json_build_object(
    'notifications',
    coalesce((
      select json_agg(row_to_json(n) order by n.created_at desc)
      from (
        select
          sn.id,
          sn.type,
          sn.actor_id,
          sn.reference_id,
          sn.message,
          sn.is_read,
          sn.created_at,
          sp.username as actor_username,
          sp.display_name as actor_display_name
        from public.user_notifications sn
        left join public.student_profiles sp
          on sp.user_id = sn.actor_id
        where sn.user_id = current_student
        order by sn.created_at desc
        limit 50
      ) n
    ), '[]'::json),

    'friend_requests',
    coalesce((
      select json_agg(row_to_json(r) order by r.created_at desc)
      from (
        select
          fr.id,
          fr.sender_id,
          fr.receiver_id,
          fr.status,
          fr.created_at,
          fr.responded_at,
          case
            when fr.sender_id = current_student then 'outgoing'
            else 'incoming'
          end as direction,
          sp.username,
          sp.display_name
        from public.friend_requests fr
        join public.student_profiles sp
          on sp.user_id = case
            when fr.sender_id = current_student then fr.receiver_id
            else fr.sender_id
          end
        where
          (fr.sender_id = current_student or fr.receiver_id = current_student)
          and fr.status = 'pending'
        order by fr.created_at desc
      ) r
    ), '[]'::json),

    'message_requests',
    coalesce((
      select json_agg(row_to_json(r) order by r.created_at desc)
      from (
        select
          mr.id,
          mr.sender_id,
          mr.receiver_id,
          mr.status,
          mr.created_at,
          mr.responded_at,
          case
            when mr.sender_id = current_student then 'outgoing'
            else 'incoming'
          end as direction,
          sp.username,
          sp.display_name
        from public.message_requests mr
        join public.student_profiles sp
          on sp.user_id = case
            when mr.sender_id = current_student then mr.receiver_id
            else mr.sender_id
          end
        where
          (mr.sender_id = current_student or mr.receiver_id = current_student)
          and mr.status = 'pending'
        order by mr.created_at desc
      ) r
    ), '[]'::json)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- Public wrappers (same as production: they only forward the call)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_role()
 RETURNS text
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.get_my_role(); $function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.is_admin(); $function$;

CREATE OR REPLACE FUNCTION public.get_setting(setting_key text)
 RETURNS jsonb
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.get_setting(setting_key); $function$;

CREATE OR REPLACE FUNCTION public.record_deal_search(p_search_query text)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.record_deal_search(p_search_query); $function$;

CREATE OR REPLACE FUNCTION public.record_deal_view(p_deal_id uuid)
 RETURNS void
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.record_deal_view(p_deal_id); $function$;

CREATE OR REPLACE FUNCTION public.search_students(search_query text)
 RETURNS TABLE(user_id uuid, username text, display_name text, university text, campus text, student_description text, short_bio text)
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT * FROM private.search_students(search_query); $function$;

CREATE OR REPLACE FUNCTION public.get_student_message_profiles(target_student_ids uuid[])
 RETURNS TABLE(user_id uuid, username text, display_name text)
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT * FROM private.get_student_message_profiles(target_student_ids); $function$;

CREATE OR REPLACE FUNCTION public.send_friend_request(target_student uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.send_friend_request(target_student); $function$;

CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.accept_friend_request(request_id); $function$;

CREATE OR REPLACE FUNCTION public.decline_friend_request(request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.decline_friend_request(request_id); $function$;

CREATE OR REPLACE FUNCTION public.cancel_friend_request(request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.cancel_friend_request(request_id); $function$;

CREATE OR REPLACE FUNCTION public.send_message_request(target_student uuid)
 RETURNS uuid
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.send_message_request(target_student); $function$;

CREATE OR REPLACE FUNCTION public.accept_message_request(request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.accept_message_request(request_id); $function$;

CREATE OR REPLACE FUNCTION public.decline_message_request(request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.decline_message_request(request_id); $function$;

CREATE OR REPLACE FUNCTION public.cancel_message_request(request_id uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.cancel_message_request(request_id); $function$;

CREATE OR REPLACE FUNCTION public.block_student(target_student uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.block_student(target_student); $function$;

CREATE OR REPLACE FUNCTION public.unblock_student(target_student uuid)
 RETURNS boolean
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.unblock_student(target_student); $function$;

CREATE OR REPLACE FUNCTION public.get_social_activity()
 RETURNS json
 LANGUAGE sql
 SET search_path TO 'public', 'private', 'pg_temp'
AS $function$ SELECT private.get_social_activity(); $function$;

-- ---------------------------------------------------------------------------
-- Grants (same as production): signed-in users and the server, nobody else.
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where p.prokind = 'f'
       and (
         n.nspname = 'private'
         or (n.nspname = 'public' and p.proname in (
           'get_my_role', 'is_admin', 'get_setting', 'record_deal_search',
           'record_deal_view', 'search_students', 'get_student_message_profiles',
           'send_friend_request', 'accept_friend_request', 'decline_friend_request',
           'cancel_friend_request', 'send_message_request', 'accept_message_request',
           'decline_message_request', 'cancel_message_request', 'block_student',
           'unblock_student', 'get_social_activity'))
       )
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
    execute format('grant execute on function %s to authenticated, service_role', f.sig);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- Dead code: old private copies nothing calls (the public versions are used).
-- ---------------------------------------------------------------------------
drop function if exists private.create_group_order_with_host(uuid, text);
drop function if exists private.find_open_group_order_by_code(text);
