-- Refunds, phase 1 (plan approved 2026-10-05; founder answers 2026-10-10).
--
-- An admin starts a refund, sends the money by hand from a Unipicks MoMo
-- number, then records the MoMo reference here. The database keeps the
-- record, moves the order and payment to "refunded" when everything paid has
-- been returned, and tells the student and the business.
--
--   * Who pays for it (business or Unipicks) is chosen by the admin for each
--     refund (founder: "case by case").
--   * Part refunds: yes, admins only. All refunds of one payment together can
--     never be more than that payment (a refunded double charge is counted
--     on its own).
--   * "Can't serve this order": the business asks, the student is told, and
--     an admin decides (no automatic refund).
--   * While a refund is open (to send / failed) the pickup code does not
--     work, and neither the student nor the business can delete their account
--     (the refund needs the student's phone number on the order).
--
-- Only these functions write refunds; nobody has insert/update rights on the
-- table. Safe to run twice.

-- ---- 1. The table ------------------------------------------------------------
create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  student_id uuid not null references auth.users(id),
  merchant_id uuid not null references auth.users(id),
  amount numeric(12, 0) not null check (amount > 0),
  reason text not null check (reason in ('cant_serve', 'dispute', 'double_payment', 'other')),
  -- Shown to the student and the business.
  note text check (note is null or char_length(trim(note)) between 1 and 500),
  charged_to text not null check (charged_to in ('business', 'unipicks')),
  status text not null default 'to_send' check (status in ('to_send', 'sent', 'failed', 'cancelled')),
  momo_reference text check (momo_reference is null or char_length(trim(momo_reference)) between 1 and 100),
  started_by uuid references auth.users(id) on delete set null,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint refunds_sent_needs_reference
    check (status <> 'sent' or (momo_reference is not null and sent_at is not null))
);

-- One open refund per order at a time.
create unique index if not exists refunds_one_open_per_order
  on public.refunds (order_id) where status in ('to_send', 'failed');
create index if not exists refunds_order_id_idx on public.refunds (order_id);
create index if not exists refunds_student_id_idx on public.refunds (student_id);
create index if not exists refunds_merchant_id_idx on public.refunds (merchant_id);
create index if not exists refunds_transaction_id_idx on public.refunds (transaction_id);
create index if not exists refunds_status_created_idx on public.refunds (status, created_at);
create index if not exists refunds_started_by_idx on public.refunds (started_by);
create index if not exists refunds_sent_by_idx on public.refunds (sent_by);

alter table public.refunds enable row level security;
revoke all on public.refunds from anon, authenticated;
grant select on public.refunds to authenticated;

drop policy if exists "Read own, own business's or (admin) all refunds" on public.refunds;
create policy "Read own, own business's or (admin) all refunds" on public.refunds
  for select to authenticated
  using (
    student_id = (select auth.uid())
    or merchant_id = (select auth.uid())
    or (select private.is_admin())
  );

-- ---- 2. "Can't serve this order" (asked by the business) -----------------------
alter table public.orders
  add column if not exists cant_serve_at timestamptz,
  add column if not exists cant_serve_reason text,
  add column if not exists cant_serve_note text;

alter table public.orders drop constraint if exists orders_cant_serve_reason_check;
alter table public.orders add constraint orders_cant_serve_reason_check
  check (cant_serve_reason is null or cant_serve_reason in ('sold_out', 'closed', 'other'));
alter table public.orders drop constraint if exists orders_cant_serve_note_check;
alter table public.orders add constraint orders_cant_serve_note_check
  check (cant_serve_note is null or char_length(trim(cant_serve_note)) between 1 and 300);

-- ---- 3. Small helpers ---------------------------------------------------------------
-- Helpers for the functions below only: nobody can call them through the API.
create or replace function public.format_rwf(p_amount numeric)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(p_amount, 'FM999,999,999,990') || ' RWF' $$;

-- Money still refundable on one payment: its amount minus refunds that are
-- sent or still open. A double charge is counted on its own: the app keeps
-- one payment per order (unique normal_order_id), so a student charged twice
-- shows only in UmunotaPay; refunding that extra charge doesn't touch what
-- can be refunded for the order itself.
create or replace function public.refundable_amount(p_transaction_id uuid, p_double_charge boolean default false)
returns numeric
language sql
stable
set search_path = ''
as $$
  select t.amount - coalesce((
           select sum(r.amount) from public.refunds r
            where r.transaction_id = t.id
              and r.status in ('to_send', 'failed', 'sent')
              and (r.reason = 'double_payment') = p_double_charge
         ), 0)
    from public.transactions t
   where t.id = p_transaction_id
$$;

revoke all on function public.format_rwf(numeric) from public, anon, authenticated;
revoke all on function public.refundable_amount(uuid, boolean) from public, anon, authenticated;

-- ---- 4. Business: "Can't serve this order" -----------------------------------------
create or replace function public.request_cant_serve(p_order_id uuid, p_reason text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_ref text;
  v_deal text;
  v_business text;
  v_reason_text text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  select o.id, o.merchant_id, o.student_id, o.status, o.cant_serve_at, o.deal_id
    into v_order
    from public.orders o
   where o.id = p_order_id
   for update;

  if not found or v_order.merchant_id <> v_uid then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;
  if public.is_banned(v_uid) then
    raise exception 'Your account is suspended. Contact support.' using errcode = '42501';
  end if;
  if v_order.status <> 'paid' then
    raise exception 'Only a paid order that is not collected yet can be marked "can''t serve".' using errcode = 'P0001';
  end if;
  if v_order.cant_serve_at is not null then
    raise exception 'You already told Unipicks you can''t serve this order.' using errcode = 'P0001';
  end if;
  if p_reason is null or p_reason not in ('sold_out', 'closed', 'other') then
    raise exception 'Choose a reason.' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'Please say why when you choose Other.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 300 then
    raise exception 'Keep the note under 300 characters.' using errcode = '22023';
  end if;

  update public.orders
     set cant_serve_at = now(), cant_serve_reason = p_reason, cant_serve_note = v_note, updated_at = now()
   where id = p_order_id;

  v_ref := upper(left(p_order_id::text, 8));
  select coalesce(d.title, 'your order'), coalesce(mp.business_name, d.business_name, 'The business')
    into v_deal, v_business
    from public.deals d
    left join public.merchant_profiles mp on mp.id = d.merchant_id
   where d.id = v_order.deal_id;
  v_deal := coalesce(v_deal, 'your order');
  v_business := coalesce(v_business, 'The business');
  v_reason_text := case p_reason when 'sold_out' then 'sold out' when 'closed' then 'closed' else 'other reason' end;

  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  values (v_order.student_id, 'order_cant_serve', v_uid, p_order_id,
          format('%s can''t serve your order %s (%s): %s. Unipicks will contact you about your money within 24 hours.',
                 v_business, v_ref, v_deal, v_reason_text),
          '/dashboard/profile?view=orders');

  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  select r.user_id, 'order_cant_serve', v_uid, p_order_id,
         format('%s can''t serve order %s (%s): %s. Start a refund in Admin → Refunds.', v_business, v_ref, v_deal, v_reason_text),
         '/dashboard/refunds'
    from public.user_roles r
   where r.role = 'admin';
end;
$$;

revoke all on function public.request_cant_serve(uuid, text, text) from public, anon;
grant execute on function public.request_cant_serve(uuid, text, text) to authenticated;

-- ---- 5. Admin: start a refund --------------------------------------------------------
create or replace function public.admin_start_refund(
  p_order_id uuid,
  p_amount numeric,
  p_reason text,
  p_charged_to text,
  p_note text default null,
  p_transaction_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_order record;
  v_tx record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_left numeric;
  v_double boolean := p_reason = 'double_payment';
  v_id uuid;
  v_ref text;
  v_deal text;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if p_reason is null or p_reason not in ('cant_serve', 'dispute', 'double_payment', 'other') then
    raise exception 'Choose a reason.' using errcode = '22023';
  end if;
  if p_charged_to is null or p_charged_to not in ('business', 'unipicks') then
    raise exception 'Choose who pays for this refund.' using errcode = '22023';
  end if;
  if p_reason = 'other' and v_note is null then
    raise exception 'Add a note for the student when the reason is Other.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_note, '')) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> trunc(p_amount) then
    raise exception 'The amount must be a whole number of RWF, more than 0.' using errcode = '22023';
  end if;

  -- Lock the order: two admins can't start two refunds at once.
  select o.id, o.student_id, o.merchant_id, o.deal_id, o.status, o.dispute_status
    into v_order
    from public.orders o
   where o.id = p_order_id
   for update;
  if not found then
    raise exception 'Order not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from public.refunds where order_id = p_order_id and status in ('to_send', 'failed')) then
    raise exception 'This order already has a refund in progress.' using errcode = 'P0001';
  end if;
  if p_reason = 'dispute' and v_order.dispute_status is null then
    raise exception 'This order has no dispute.' using errcode = 'P0001';
  end if;

  -- The order's payment (one per order; p_transaction_id only double-checks it).
  select t.id, t.amount, public.refundable_amount(t.id, v_double) as left_amount
    into v_tx
    from public.transactions t
   where t.normal_order_id = p_order_id
     and t.status in ('paid', 'refunded')
     and (p_transaction_id is null or t.id = p_transaction_id)
   order by t.created_at
   limit 1;
  if not found then
    raise exception 'This order has no payment to refund.' using errcode = 'P0001';
  end if;

  v_left := v_tx.left_amount;
  if v_left <= 0 then
    raise exception '%', case when v_double then 'This double charge has already been refunded.'
                              else 'This payment has already been refunded in full.' end
      using errcode = 'P0001';
  end if;
  if p_amount > v_left then
    raise exception 'The most you can refund on this payment is %.', public.format_rwf(v_left) using errcode = 'P0001';
  end if;

  insert into public.refunds (order_id, transaction_id, student_id, merchant_id, amount, reason, note, charged_to, started_by)
  values (p_order_id, v_tx.id, v_order.student_id, v_order.merchant_id, p_amount, p_reason, v_note, p_charged_to, v_uid)
  returning id into v_id;

  -- "Resolve and refund": a refund decided on a dispute closes the dispute
  -- (the dispute trigger tells the student and the business).
  if p_reason = 'dispute' and v_order.dispute_status in ('open', 'under_review') then
    update public.orders
       set dispute_status = 'resolved',
           dispute_resolution_note = coalesce(v_note, dispute_resolution_note),
           updated_at = now()
     where id = p_order_id;
  end if;

  v_ref := upper(left(p_order_id::text, 8));
  select coalesce(d.title, 'your order') into v_deal from public.deals d where d.id = v_order.deal_id;
  v_deal := coalesce(v_deal, 'your order');

  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  values
    (v_order.student_id, 'refund_started', null, p_order_id,
     format('We are refunding %s for order %s (%s). We will send it to the MoMo number you paid with and tell you when it is sent.',
            public.format_rwf(p_amount), v_ref, v_deal),
     '/dashboard/profile?view=orders'),
    (v_order.merchant_id, 'refund_started', null, p_order_id,
     format('Unipicks is refunding %s to the student for order %s (%s).', public.format_rwf(p_amount), v_ref, v_deal)
       || case when p_charged_to = 'business' then ' This refund is charged to your business.' else '' end,
     '/dashboard/orders');

  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (v_uid, 'refund_started', 'order', p_order_id, v_ref,
          jsonb_build_object('refund_id', v_id, 'amount', p_amount, 'reason', p_reason, 'charged_to', p_charged_to,
                             'transaction_id', v_tx.id));
  return v_id;
end;
$$;

revoke all on function public.admin_start_refund(uuid, numeric, text, text, text, uuid) from public, anon;
grant execute on function public.admin_start_refund(uuid, numeric, text, text, text, uuid) to authenticated;

-- ---- 6. Admin: the MoMo was sent -------------------------------------------------------
create or replace function public.admin_mark_refund_sent(p_refund_id uuid, p_momo_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_refund record;
  v_reference text := nullif(trim(coalesce(p_momo_reference, '')), '');
  v_ref text;
  v_deal text;
  v_now timestamptz := now();
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if v_reference is null then
    raise exception 'Type the MoMo reference of the transfer.' using errcode = '22023';
  end if;
  if char_length(v_reference) > 100 then
    raise exception 'The MoMo reference is too long.' using errcode = '22023';
  end if;

  select r.* into v_refund from public.refunds r where r.id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if v_refund.status not in ('to_send', 'failed') then
    raise exception 'This refund is already %.', case v_refund.status when 'sent' then 'sent' else 'cancelled' end
      using errcode = 'P0001';
  end if;

  update public.refunds
     set status = 'sent', momo_reference = v_reference, sent_by = v_uid, sent_at = v_now, updated_at = v_now
   where id = p_refund_id;

  -- Once everything paid for the order has been returned, the payment and the
  -- order are "refunded" (a double-charge refund doesn't count: the student
  -- still paid once for the order).
  if v_refund.reason <> 'double_payment'
     and public.refundable_amount(v_refund.transaction_id, false) <= 0 then
    update public.transactions set status = 'refunded', updated_at = v_now
     where id = v_refund.transaction_id and status = 'paid';
    update public.orders set status = 'refunded', updated_at = v_now
     where id = v_refund.order_id and status in ('paid', 'redeemed', 'completed');
  end if;

  v_ref := upper(left(v_refund.order_id::text, 8));
  select coalesce(d.title, 'your order') into v_deal
    from public.orders o join public.deals d on d.id = o.deal_id where o.id = v_refund.order_id;
  v_deal := coalesce(v_deal, 'your order');

  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  values
    (v_refund.student_id, 'refund_sent', null, v_refund.order_id,
     format('Refund sent: %s for order %s (%s). MoMo reference %s.', public.format_rwf(v_refund.amount), v_ref, v_deal, v_reference),
     '/dashboard/profile?view=orders'),
    (v_refund.merchant_id, 'refund_sent', null, v_refund.order_id,
     format('Refund sent to the student: %s for order %s (%s).', public.format_rwf(v_refund.amount), v_ref, v_deal),
     '/dashboard/orders');

  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (v_uid, 'refund_sent', 'order', v_refund.order_id, v_ref,
          jsonb_build_object('refund_id', p_refund_id, 'amount', v_refund.amount, 'momo_reference', v_reference));
end;
$$;

revoke all on function public.admin_mark_refund_sent(uuid, text) from public, anon;
grant execute on function public.admin_mark_refund_sent(uuid, text) to authenticated;

-- ---- 7. Admin: the MoMo did not go through / stop the refund -------------------------------
create or replace function public.admin_mark_refund_failed(p_refund_id uuid, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_refund record;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  select r.* into v_refund from public.refunds r where r.id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if v_refund.status <> 'to_send' then
    raise exception 'Only a refund waiting to be sent can be marked as failed.' using errcode = 'P0001';
  end if;

  update public.refunds set status = 'failed', updated_at = now() where id = p_refund_id;

  -- Internal: the note stays in the admin log, not on the student's screen.
  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (v_uid, 'refund_failed', 'order', v_refund.order_id, upper(left(v_refund.order_id::text, 8)),
          jsonb_build_object('refund_id', p_refund_id, 'amount', v_refund.amount,
                             'note', nullif(trim(coalesce(p_note, '')), '')));
end;
$$;

revoke all on function public.admin_mark_refund_failed(uuid, text) from public, anon;
grant execute on function public.admin_mark_refund_failed(uuid, text) to authenticated;

create or replace function public.admin_cancel_refund(p_refund_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_refund record;
  v_note text := nullif(trim(coalesce(p_note, '')), '');
  v_ref text;
begin
  if not coalesce(private.is_admin(), false) then
    raise exception 'Admin only' using errcode = '42501';
  end if;
  if v_note is null then
    raise exception 'Say why the refund is stopped (the student will see it).' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;
  select r.* into v_refund from public.refunds r where r.id = p_refund_id for update;
  if not found then
    raise exception 'Refund not found' using errcode = 'P0002';
  end if;
  if v_refund.status not in ('to_send', 'failed') then
    raise exception 'Only a refund in progress can be stopped.' using errcode = 'P0001';
  end if;

  update public.refunds set status = 'cancelled', updated_at = now() where id = p_refund_id;

  v_ref := upper(left(v_refund.order_id::text, 8));
  insert into public.user_notifications (user_id, type, actor_id, reference_id, message, link_path)
  values
    (v_refund.student_id, 'refund_cancelled', null, v_refund.order_id,
     format('The refund of %s for order %s was stopped: %s', public.format_rwf(v_refund.amount), v_ref, v_note),
     '/dashboard/profile?view=orders'),
    (v_refund.merchant_id, 'refund_cancelled', null, v_refund.order_id,
     format('The refund of %s for order %s was stopped.', public.format_rwf(v_refund.amount), v_ref),
     '/dashboard/orders');

  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (v_uid, 'refund_cancelled', 'order', v_refund.order_id, v_ref,
          jsonb_build_object('refund_id', p_refund_id, 'amount', v_refund.amount, 'note', v_note));
end;
$$;

revoke all on function public.admin_cancel_refund(uuid, text) from public, anon;
grant execute on function public.admin_cancel_refund(uuid, text) to authenticated;

-- ---- 8. No pickup while a refund is open ----------------------------------------------
-- Covers redeem_pickup_code and any other path that marks the order collected.
create or replace function public.block_pickup_during_refund()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.refunds
              where order_id = new.id and status in ('to_send', 'failed')) then
    raise exception 'This order is being refunded. Do not hand over the item.' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

revoke all on function public.block_pickup_during_refund() from public;

drop trigger if exists block_pickup_during_refund on public.orders;
create trigger block_pickup_during_refund
before update of status on public.orders
for each row
when (new.status in ('redeemed', 'completed') and old.status is distinct from new.status)
execute function public.block_pickup_during_refund();

-- ---- 9. Deleting an account waits for open refunds -----------------------------------
-- Same function as 20261009150000_review_photos.sql, plus one pre-check.

create or replace function public.tombstone_user_core(p_user_id uuid, p_actor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
  v_app jsonb;
  v_role text;
  v_now timestamptz := now();
  v_table text;
  v_storage jsonb := jsonb_build_array(
    jsonb_build_object('bucket', 'deal-images',    'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'deal-images',    'prefix', 'merchants/' || p_user_id),
    jsonb_build_object('bucket', 'merchant-logos', 'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'story-images',   'prefix', 'merchants/' || p_user_id),
    jsonb_build_object('bucket', 'student-stories', 'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'student-avatars', 'prefix', p_user_id::text),
    jsonb_build_object('bucket', 'review-photos',   'prefix', p_user_id::text)
  );
begin
  select lower(u.email), coalesce(u.raw_app_meta_data, '{}'::jsonb)
    into v_email, v_app
    from auth.users u
   where u.id = p_user_id
   for update;

  if not found then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  -- Idempotent: a retry after a partial failure (e.g. storage) is safe.
  if v_app ? 'deleted_at' then
    return jsonb_build_object('status', 'already_deleted', 'user_id', p_user_id, 'storage', v_storage);
  end if;

  select role into v_role from public.user_roles where user_id = p_user_id;

  -- ---- Pre-checks: nothing in flight -----------------------------------------
  if v_role = 'admin' then
    raise exception 'Admin accounts cannot be deleted. Remove the admin role first.'
      using errcode = '42501';
  end if;

  if exists (
    select 1 from public.orders
     where (student_id = p_user_id or merchant_id = p_user_id)
       and status in ('pending_confirmation', 'confirmed', 'payment_processing', 'paid')
  ) then
    raise exception 'You have active orders. Finish, collect or cancel them before deleting your account.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.orders
     where (student_id = p_user_id or merchant_id = p_user_id)
       and dispute_status in ('open', 'under_review')
  ) then
    raise exception 'You have an open dispute. Wait for it to be resolved before deleting your account.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.refunds
     where (student_id = p_user_id or merchant_id = p_user_id)
       and status in ('to_send', 'failed')
  ) then
    raise exception 'A refund for one of your orders is still being sent. Wait for it to finish before deleting your account.'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.group_orders
     where created_by = p_user_id and status = 'open'
  ) then
    raise exception 'You are hosting an open group order. Submit or cancel it before deleting your account.'
      using errcode = 'P0001';
  end if;

  -- ---- Delete: personal and social data --------------------------------------
  delete from public.student_profiles             where user_id = p_user_id;
  delete from public.friend_requests              where sender_id = p_user_id or receiver_id = p_user_id;
  delete from public.friendships                  where student_a = p_user_id or student_b = p_user_id;
  delete from public.message_requests             where sender_id = p_user_id or receiver_id = p_user_id;
  delete from public.blocked_students             where blocker_id = p_user_id;   -- blocks against them stay
  delete from public.student_story_views          where viewer_id = p_user_id;
  delete from public.student_story_reactions      where student_id = p_user_id;
  delete from public.student_stories              where student_id = p_user_id;
  delete from public.business_follows             where student_id = p_user_id or merchant_id = p_user_id;
  delete from public.student_interests            where student_id = p_user_id;
  delete from public.student_saved_items          where student_id = p_user_id;
  delete from public.social_content_interactions  where student_id = p_user_id;
  delete from public.deal_views                   where student_id = p_user_id;
  delete from public.deal_searches                where student_id = p_user_id;
  delete from public.merchant_stories             where merchant_id = p_user_id;
  delete from public.notifications                where merchant_id = p_user_id;  -- their merchant inbox
  delete from public.merchant_profiles            where id = p_user_id;

  -- Their own inbox; and others' social notifications about relationships
  -- that no longer exist (these messages contain the deleted user's name).
  delete from public.user_notifications where user_id = p_user_id;
  delete from public.user_notifications
   where actor_id = p_user_id
     and type in ('friend_request', 'friend_request_accepted', 'message_request', 'message_request_accepted');
  update public.user_notifications set actor_id = null where actor_id = p_user_id;

  -- Unsubmitted group memberships (no order yet). Submitted ones stay below.
  delete from public.group_order_members m
   using public.group_orders g
   where m.group_order_id = g.id
     and m.student_id = p_user_id
     and g.status = 'open';

  -- ---- Anonymise: records that must be kept ---------------------------------
  update public.orders set student_phone = null where student_id = p_user_id;
  update public.orders set merchant_phone = null where merchant_id = p_user_id;

  -- Payments: kept for reconciliation, personal fields scrubbed.
  -- (a) phone_number exists only in the repo-built schema: production's
  --     transactions table predates 20260904110000 (create table if not
  --     exists was a no-op there) and has no such column, which made the
  --     unconditional update fail with 42703. PL/pgSQL plans a statement on
  --     first execution, so this one is never parsed where the column is absent.
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'transactions' and column_name = 'phone_number'
  ) then
    update public.transactions
       set phone_number = case
             when length(phone_number) >= 7
               then left(phone_number, 3) || repeat('*', length(phone_number) - 6) || right(phone_number, 3)
             else '***'
           end
     where student_id = p_user_id
       and phone_number is not null
       and position('*' in phone_number) = 0;
  end if;

  -- (b) The provider payload (production's copy of the payer's details).
  update public.transactions
     set webhook_payload = public.scrub_payment_payload(webhook_payload)
   where student_id = p_user_id
     and jsonb_typeof(webhook_payload) = 'object';

  update public.redemptions        set student_name = null          where student_id = p_user_id;
  update public.ratings            set review = null, photo_path = null where student_id = p_user_id;
  update public.group_orders       set host_name = 'Deleted user'   where created_by = p_user_id;
  update public.group_order_members set student_name = 'Deleted user' where student_id = p_user_id;
  update public.activity_logs      set target_name = 'Deleted user' where target_id = p_user_id;

  -- Merchants' inbox rows that name this student (create-order, redemption trigger).
  if v_email is not null then
    update public.notifications
       set student_name = null,
           student_email = null,
           message = 'Order activity from a deleted user.'
     where lower(student_email) = v_email;
  end if;

  -- Merchant: deals stay (students' orders reference them) but go inactive;
  -- images are deleted from storage by the Edge Function (decision D5).
  update public.deals set active = false, image_url = null where merchant_id = p_user_id;

  -- chat_messages and student_reports are kept as they are (decisions D4 / plan §3.1):
  -- the other party's records and moderation history.

  delete from public.user_roles where user_id = p_user_id;

  -- ---- Tombstone the auth user ----------------------------------------------
  update auth.users
     set email = format('deleted-%s@deleted.unipicks.invalid', p_user_id),
         phone = null,
         raw_user_meta_data = '{}'::jsonb,
         raw_app_meta_data = jsonb_build_object(
           'provider', 'email',
           'providers', jsonb_build_array('email'),
           'deleted_at', v_now,
           'banned', true,
           -- Lets support confirm "this address had an account, deleted at X"
           -- without retaining the address itself.
           'deleted_email_sha256', encode(sha256(convert_to(coalesce(v_email, ''), 'UTF8')), 'hex')
         ),
         encrypted_password = 'deleted:' || gen_random_uuid(),
         banned_until = v_now + interval '100 years',
         updated_at = v_now
   where id = p_user_id;

  -- Sign out everywhere and remove login methods (frees the email for re-signup).
  foreach v_table in array array['sessions', 'refresh_tokens', 'identities', 'mfa_factors', 'one_time_tokens'] loop
    if to_regclass('auth.' || v_table) is not null then
      execute format('delete from auth.%I where user_id::text = $1', v_table) using p_user_id::text;
    end if;
  end loop;

  -- Audit trail without personal data.
  insert into public.activity_logs (admin_id, action, target_type, target_id, target_name, details)
  values (
    case when p_actor_id is distinct from p_user_id then p_actor_id end,
    'account_deleted',
    coalesce(v_role, 'user'),
    p_user_id,
    'Deleted user',
    jsonb_build_object('by', case when p_actor_id is null or p_actor_id = p_user_id then 'self' else 'admin' end)
  );

  return jsonb_build_object('status', 'deleted', 'user_id', p_user_id, 'role', v_role, 'storage', v_storage);
end;
$$;
