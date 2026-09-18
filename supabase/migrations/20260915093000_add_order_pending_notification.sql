alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in ('redemption', 'new_deal', 'expiry', 'system', 'payment_received', 'order_pending'));
