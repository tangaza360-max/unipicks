-- ============================================================
-- Task 5.1: Dispute record — schema + RPC functions
-- ============================================================
--
-- Implements the post-transaction dispute lifecycle required by
-- ISO 32111 §7.4.3 and IS 19598 ("transparent policies for
-- returns, cancellations, and refunds").
--
-- Statuses: open -> under_review -> resolved | rejected
-- Raisable by: student or merchant, on their own orders only,
--              when the order is in a final-enough state.
-- Resolvable by: admin only.

-- 1. Columns
alter table public.orders
  add column if not exists dispute_status text,
  add column if not exists dispute_reason text,
  add column if not exists dispute_raised_by uuid references auth.users(id),
  add column if not exists dispute_raised_at timestamptz,
  add column if not exists dispute_resolution_note text;

-- 2. Constraints
alter table public.orders
  drop constraint if exists orders_dispute_status_check;
alter table public.orders
  add constraint orders_dispute_status_check
  check (
    dispute_status is null
    or dispute_status in ('open', 'under_review', 'resolved', 'rejected')
  );

alter table public.orders
  drop constraint if exists orders_dispute_reason_check;
alter table public.orders
  add constraint orders_dispute_reason_check
  check (
    dispute_reason is null
    or dispute_reason in (
      'item_not_received',
      'quality_issue',
      'merchant_unresponsive',
      'wrong_item',
      'other'
    )
  );

alter table public.orders
  drop constraint if exists orders_dispute_resolution_note_check;
alter table public.orders
  add constraint orders_dispute_resolution_note_check
  check (
    dispute_resolution_note is null
    or char_length(trim(dispute_resolution_note)) between 1 and 500
  );

-- 3. Index (partial — only rows that have a dispute)
create index if not exists orders_dispute_status_idx
  on public.orders(dispute_status)
  where dispute_status is not null;

-- 4. RPC: raise_order_dispute
create or replace function public.raise_order_dispute(
  p_order_id uuid,
  p_reason text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select id, student_id, merchant_id, status, dispute_status
  into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.student_id <> v_user_id and v_order.merchant_id <> v_user_id then
    raise exception 'Not allowed to dispute this order' using errcode = '42501';
  end if;

  if v_order.dispute_status is not null then
    raise exception 'A dispute already exists on this order' using errcode = '23505';
  end if;

  if v_order.status not in ('confirmed', 'paid', 'redeemed', 'completed', 'declined') then
    raise exception 'Order cannot be disputed in its current state' using errcode = 'P0001';
  end if;

  if p_reason is null or p_reason not in (
    'item_not_received',
    'quality_issue',
    'merchant_unresponsive',
    'wrong_item',
    'other'
  ) then
    raise exception 'Invalid dispute reason' using errcode = '22023';
  end if;

  if p_reason = 'other' then
    if p_note is null or char_length(trim(p_note)) = 0 then
      raise exception 'Please provide a note when selecting Other' using errcode = '22023';
    end if;
  end if;

  update public.orders
  set
    dispute_status = 'open',
    dispute_reason = p_reason,
    dispute_raised_by = v_user_id,
    dispute_raised_at = now(),
    dispute_resolution_note = nullif(trim(coalesce(p_note, '')), ''),
    updated_at = now()
  where id = p_order_id;
end;
$$;

-- 5. RPC: resolve_order_dispute
create or replace function public.resolve_order_dispute(
  p_order_id uuid,
  p_status text,
  p_resolution_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_role text;
begin
  select public.get_my_role() into v_role;
  if v_role is distinct from 'admin' then
    raise exception 'Admin only' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('under_review', 'resolved', 'rejected') then
    raise exception 'Invalid dispute status' using errcode = '22023';
  end if;

  select id, dispute_status into v_order
  from public.orders
  where id = p_order_id;

  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if v_order.dispute_status is null then
    raise exception 'No dispute on this order' using errcode = 'P0001';
  end if;

  update public.orders
  set
    dispute_status = p_status,
    dispute_resolution_note = coalesce(
      nullif(trim(coalesce(p_resolution_note, '')), ''),
      dispute_resolution_note
    ),
    updated_at = now()
  where id = p_order_id;
end;
$$;

-- 6. Grants
revoke all on function public.raise_order_dispute(uuid, text, text) from public;
grant execute on function public.raise_order_dispute(uuid, text, text) to authenticated;

revoke all on function public.resolve_order_dispute(uuid, text, text) from public;
grant execute on function public.resolve_order_dispute(uuid, text, text) to authenticated;
