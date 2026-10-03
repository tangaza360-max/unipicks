-- Redemptions (pickup codes) must only be created server-side by
-- process-payment / payment-webhook using the service role, after a
-- confirmed payment.
--
-- The original policy from 20260830074154_add_redemptions.sql let any
-- authenticated student insert their own redemption row directly, which
-- allowed a self-made pickup code with no paid order behind it.
--
-- The service role bypasses RLS and keeps its table privileges, so the
-- Edge Functions are unaffected.

drop policy if exists "Students can insert own redemptions"
  on public.redemptions;

-- Defense in depth: without an INSERT policy RLS already blocks client
-- inserts, but also remove the table privilege so a future permissive
-- policy cannot silently re-open the hole.
revoke insert on public.redemptions from anon, authenticated;
