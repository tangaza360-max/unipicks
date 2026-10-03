-- One-time cleanup: confirmed orders whose payment window has passed.
--
-- Until ca6ec46, expire-orders only expired pending_confirmation orders, so an
-- order the merchant accepted but the student never paid stayed 'confirmed'
-- forever. Production had 14 such orders (2026-09-15 to 2026-09-27) when this
-- was written; the exact number moved is reported as a NOTICE when the
-- migration runs (the count of rows updated at that moment).
--
-- Same rule as expire-orders rule 2: confirmed + payment_deadline set and
-- past -> payment_expired. Orders with no payment_deadline are left as they
-- are. Idempotent: re-running updates nothing.
do $$
declare
  v_count integer;
begin
  update public.orders
     set status = 'payment_expired',
         updated_at = now()
   where status = 'confirmed'
     and payment_deadline is not null
     and payment_deadline < now();

  get diagnostics v_count = row_count;
  raise notice 'expire_stale_confirmed_orders: % confirmed order(s) moved to payment_expired', v_count;
end
$$;
