create or replace function public.get_student_message_profiles(
  target_student_ids uuid[]
)
returns table (
  user_id uuid,
  username text,
  display_name text
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
$$;

revoke all on function public.get_student_message_profiles(uuid[]) from public;
grant execute on function public.get_student_message_profiles(uuid[]) to authenticated;
