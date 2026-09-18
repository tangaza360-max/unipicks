-- Atomically reserve Group Order members for a payment attempt.
-- This prevents two simultaneous payments from paying the same member.

create or replace function public.reserve_group_order_payment_members(
  p_group_order_member_ids uuid[]
)
returns table (
  member_id uuid,
  group_order_id uuid,
  student_id uuid,
  quantity integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group_order_id uuid;
  v_count integer;
begin
  if p_group_order_member_ids is null
     or cardinality(p_group_order_member_ids) = 0 then
    raise exception 'At least one group order member is required.';
  end if;

  select distinct gom.group_order_id
    into v_group_order_id
  from public.group_order_members gom
  where gom.id = any(p_group_order_member_ids);

  if v_group_order_id is null then
    raise exception 'Group order members not found.';
  end if;

  select count(distinct gom.group_order_id)
    into v_count
  from public.group_order_members gom
  where gom.id = any(p_group_order_member_ids);

  if v_count <> 1 then
    raise exception 'All selected members must belong to the same group order.';
  end if;

  if (
    select count(*)
    from public.group_order_members gom
    where gom.id = any(p_group_order_member_ids)
  ) <> cardinality(p_group_order_member_ids) then
    raise exception 'One or more selected group order members were not found.';
  end if;

  if not exists (
    select 1
    from public.group_orders go
    where go.id = v_group_order_id
      and go.status = 'open'
  ) then
    raise exception 'This group order is no longer open.';
  end if;

  if exists (
    select 1
    from public.group_order_members gom
    where gom.id = any(p_group_order_member_ids)
      and gom.payment_status <> 'unpaid'
  ) then
    raise exception 'One or more selected members are already being paid for or have been paid.';
  end if;

  update public.group_order_members gom
  set payment_status = 'pending'
  where gom.id = any(p_group_order_member_ids)
    and gom.payment_status = 'unpaid';

  if not found then
    raise exception 'No unpaid group order members were available.';
  end if;

  return query
  select
    gom.id,
    gom.group_order_id,
    gom.student_id,
    gom.quantity
  from public.group_order_members gom
  where gom.id = any(p_group_order_member_ids)
    and gom.group_order_id = v_group_order_id
    and gom.payment_status = 'pending';
end;
$$;

revoke all on function public.reserve_group_order_payment_members(uuid[]) from public;
grant execute on function public.reserve_group_order_payment_members(uuid[]) to service_role;
