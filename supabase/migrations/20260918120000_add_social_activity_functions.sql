create or replace function public.get_social_activity()
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        from public.social_notifications sn
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
$$;

revoke all on function public.get_social_activity() from public;
grant execute on function public.get_social_activity() to authenticated;
