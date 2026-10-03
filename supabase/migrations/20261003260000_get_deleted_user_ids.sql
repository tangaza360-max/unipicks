-- P3 / B2b: let chat show "Deleted user" (decision D4).
--
-- After a tombstone the deleted user's profile rows are gone, so the client
-- can't tell a deleted account from a student who never set up a social
-- profile. This returns which of the given ids are deleted accounts, limited
-- to the caller's own chat partners (1:1 messages either way, or a sender in a
-- group chat the caller belongs to or hosts), so it can't be used to probe
-- arbitrary ids.

create or replace function public.get_deleted_user_ids(p_user_ids uuid[])
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_user_ids), 0) > 500 then
    raise exception 'Too many ids (max 500)' using errcode = '22023';
  end if;

  return query
  select u.id
    from auth.users u
   where u.id = any(p_user_ids)
     and u.id <> v_me
     and u.raw_app_meta_data ? 'deleted_at'
     and exists (
       select 1
         from public.chat_messages m
        where (m.sender_id = v_me and m.receiver_id = u.id)
           or (m.sender_id = u.id and m.receiver_id = v_me)
           or (m.sender_id = u.id
               and m.group_order_id is not null
               and (exists (
                      select 1 from public.group_order_members gm
                       where gm.group_order_id = m.group_order_id
                         and gm.student_id = v_me)
                    or exists (
                      select 1 from public.group_orders g
                       where g.id = m.group_order_id
                         and g.created_by = v_me)))
     );
end;
$$;

revoke all on function public.get_deleted_user_ids(uuid[]) from public, anon;
grant execute on function public.get_deleted_user_ids(uuid[]) to authenticated;
