-- Redeem a pickup code atomically: mark the redemption redeemed AND move the
-- parent order from 'paid' to 'redeemed' in one transaction.
--
-- Previously VerifyCode.jsx updated `redemptions` directly from the browser and
-- the parent `orders` row stayed 'paid' forever: merchants have no UPDATE
-- policy on `orders`, so a client-side update silently affected 0 rows.

create or replace function public.redeem_pickup_code(p_code text)
returns table (redemption_id uuid, order_id uuid, redeemed_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_code text := upper(trim(coalesce(p_code, '')));
  v_redemption record;
  v_order_status text;
  v_now timestamptz := now();
begin
  -- 1. Caller must be signed in.
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  -- 2. Find the code. Codes are not globally unique, so prefer a row on one
  --    of the caller's own deals, then a still-pending one, then the newest.
  --    Lock it so two simultaneous scans can't both redeem it.
  select r.id, r.status, r.order_id, d.merchant_id
    into v_redemption
    from public.redemptions r
    join public.deals d on d.id = r.deal_id
   where upper(trim(r.code)) = v_code
   order by (d.merchant_id = v_uid) desc,
            (r.status = 'pending') desc,
            r.created_at desc
   limit 1
   for update of r;

  if not found then
    raise exception 'Pickup code not found';
  end if;

  -- 3. Only the merchant who owns the deal can redeem its codes.
  if v_redemption.merchant_id is distinct from v_uid then
    raise exception 'Not your code to redeem';
  end if;

  -- 5 (checked before 4). After a successful redemption the parent order is
  -- 'redeemed', so checking "paid" first would report a re-scan as
  -- "not linked to a paid order". Check for reuse first so the message is right.
  if v_redemption.status = 'redeemed' then
    raise exception 'This code has already been redeemed';
  end if;

  -- 4. The code must belong to an order that was actually paid.
  if v_redemption.order_id is null then
    raise exception 'This code is not linked to a paid order';
  end if;

  select o.status
    into v_order_status
    from public.orders o
   where o.id = v_redemption.order_id
   for update;

  if v_order_status is distinct from 'paid' then
    raise exception 'This code is not linked to a paid order';
  end if;

  -- 6. Both updates commit or roll back together (one function call = one transaction).
  update public.redemptions
     set status = 'redeemed',
         redeemed_at = v_now
   where id = v_redemption.id;

  -- orders has no updated_at trigger; set it like the Edge Functions do.
  update public.orders
     set status = 'redeemed',
         updated_at = v_now
   where id = v_redemption.order_id
     and status = 'paid';

  -- 7. Return what was redeemed.
  redemption_id := v_redemption.id;
  order_id := v_redemption.order_id;
  redeemed_at := v_now;
  return next;
end;
$$;

revoke all on function public.redeem_pickup_code(text) from public, anon;
grant execute on function public.redeem_pickup_code(text) to authenticated;

-- Merchants no longer write to `redemptions` from the browser: redemption goes
-- through redeem_pickup_code(). Remove the broad UPDATE policy (it allowed any
-- column to be changed) and the table privilege behind it.
drop policy if exists "Merchants can update redemptions for their deals"
  on public.redemptions;

revoke update on public.redemptions from anon, authenticated;
