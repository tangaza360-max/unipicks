-- Fix 2 (ecosystem audit U2; social audit D2/D3): chat consent and integrity.
--
-- Before: any signed-in user could insert a direct message to any receiver
-- (policy checked only sender_id), and a receiver could UPDATE any column of
-- a message they received (text, sender, link) — including the merchant's
-- "accepted / pickup code / decline reason" messages used as dispute evidence.
--
-- After:
--   Direct messages (no group_order_id) are allowed only when
--   can_send_direct_message(receiver) says so:
--     student → student : friends, or a message request accepted either way,
--                         and neither has blocked the other            (D2)
--     student → merchant: the merchant is approved
--     merchant → student: the student has ordered from this merchant, or
--                         wrote to this merchant first (a reply, not cold
--                         outreach)                                     (D3)
--     never to a deleted account; nothing else (e.g. merchant → merchant).
--   Group messages: unchanged ("Group members can send group chat messages").
--   System messages (accept, decline, pickup code) come from Edge Functions
--   with the service role, which is not subject to RLS.
--   Receivers can only flip is_read on messages addressed to them.

create or replace function public.can_send_direct_message(p_receiver uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_me uuid := auth.uid();
  v_my_role text;
  v_their_role text;
begin
  if v_me is null or p_receiver is null or p_receiver = v_me then
    return false;
  end if;

  if exists (select 1 from auth.users u where u.id = p_receiver and u.raw_app_meta_data ? 'deleted_at') then
    return false;
  end if;

  select role into v_my_role from public.user_roles where user_id = v_me;
  select role into v_their_role from public.user_roles where user_id = p_receiver;

  if v_my_role = 'student' and v_their_role = 'student' then
    if public.are_students_blocked(v_me, p_receiver) then
      return false;
    end if;
    return exists (
             select 1 from public.friendships f
              where f.student_a = least(v_me, p_receiver)
                and f.student_b = greatest(v_me, p_receiver))
        or exists (
             select 1 from public.message_requests r
              where r.status = 'accepted'
                and ((r.sender_id = v_me and r.receiver_id = p_receiver)
                  or (r.sender_id = p_receiver and r.receiver_id = v_me)));
  end if;

  if v_my_role = 'student' and v_their_role = 'merchant' then
    return exists (select 1 from public.merchant_profiles m where m.id = p_receiver and m.approved);
  end if;

  if v_my_role = 'merchant' and v_their_role = 'student' then
    return exists (select 1 from public.orders o where o.merchant_id = v_me and o.student_id = p_receiver)
        or exists (select 1 from public.chat_messages c
                    where c.sender_id = p_receiver and c.receiver_id = v_me and c.group_order_id is null);
  end if;

  return false;
end;
$$;

revoke all on function public.can_send_direct_message(uuid) from public, anon;
grant execute on function public.can_send_direct_message(uuid) to authenticated;

create index if not exists orders_merchant_student_idx on public.orders (merchant_id, student_id);
create index if not exists chat_messages_sender_receiver_idx on public.chat_messages (sender_id, receiver_id);

-- Insert: the old sender-only policy also let non-members post into group
-- chats (policies are OR'ed); the group policy stays as the only group path.
drop policy if exists "Users can insert their own chat messages" on public.chat_messages;
drop policy if exists chat_insert_direct on public.chat_messages;
create policy chat_insert_direct on public.chat_messages
  for insert to authenticated
  with check (
    sender_id = auth.uid()
    and group_order_id is null
    and receiver_id is not null
    and public.can_send_direct_message(receiver_id)
  );

-- Update: only the read flag, only on messages addressed to you.
drop policy if exists "Users can update messages they receive" on public.chat_messages;
drop policy if exists chat_receiver_marks_read on public.chat_messages;
create policy chat_receiver_marks_read on public.chat_messages
  for update to authenticated
  using (receiver_id = auth.uid())
  with check (receiver_id = auth.uid());

revoke update on public.chat_messages from anon, authenticated;
grant update (is_read) on public.chat_messages to authenticated;
