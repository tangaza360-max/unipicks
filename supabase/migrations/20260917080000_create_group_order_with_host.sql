-- Create a Group Order and automatically add the creator as its first member.
-- Both inserts happen in the same database transaction.

create or replace function public.create_group_order_with_host(
  p_deal_id uuid,
  p_join_code text
)
returns public.group_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_order public.group_orders;
  v_host_name text;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in to create a group order.';
  end if;

  if p_deal_id is null then
    raise exception 'A deal is required.';
  end if;

  if not exists (
    select 1
    from public.deals
    where id = p_deal_id
  ) then
    raise exception 'The selected deal does not exist.';
  end if;

  select coalesce(
    nullif(trim(raw_user_meta_data ->> 'full_name'), ''),
    email
  )
    into v_host_name
  from auth.users
  where id = auth.uid();

  if v_host_name is null or trim(v_host_name) = '' then
    raise exception 'Your account does not have a valid name or email.';
  end if;

  if p_join_code is null or trim(p_join_code) = '' then
    raise exception 'A join code is required.';
  end if;

  insert into public.group_orders (
    deal_id,
    created_by,
    host_name,
    join_code
  )
  values (
    p_deal_id,
    auth.uid(),
    v_host_name,
    upper(trim(p_join_code))
  )
  returning * into v_group_order;

  insert into public.group_order_members (
    group_order_id,
    student_id,
    student_name,
    quantity
  )
  values (
    v_group_order.id,
    auth.uid(),
    v_host_name,
    1
  );

  return v_group_order;
end;
$$;

revoke all on function public.create_group_order_with_host(uuid, text) from public;
grant execute on function public.create_group_order_with_host(uuid, text) to authenticated;
