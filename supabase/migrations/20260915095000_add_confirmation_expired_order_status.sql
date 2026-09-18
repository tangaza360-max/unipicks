alter table public.orders
  drop constraint if exists orders_status_check;

alter table public.orders
  add constraint orders_status_check
  check (
    status in (
      'pending_confirmation',
      'confirmed',
      'payment_processing',
      'paid',
      'redeemed',
      'completed',
      'cancelled',
      'confirmation_expired',
      'payment_expired',
      'declined',
      'refunded'
    )
  );
