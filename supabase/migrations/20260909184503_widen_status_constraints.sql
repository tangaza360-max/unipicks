-- Widen redemptions.status to allow 'confirmed' and 'failed' (payment outcomes)
ALTER TABLE public.redemptions DROP CONSTRAINT redemptions_status_check;
ALTER TABLE public.redemptions ADD CONSTRAINT redemptions_status_check
  CHECK (status = ANY (ARRAY['pending'::text, 'redeemed'::text, 'confirmed'::text, 'failed'::text]));

-- Widen notifications.type to allow 'payment_received'
ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['redemption'::text, 'new_deal'::text, 'expiry'::text, 'system'::text, 'payment_received'::text]));
