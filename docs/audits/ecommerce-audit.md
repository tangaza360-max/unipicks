# Unipicks — E-Commerce Standards Audit

**Date:** 2026-10-03
**Scope:** Read-only review of `src/`, `supabase/functions/`, `supabase/migrations/`, and `docs/` on branch `claude/unipicks-codebase-audit-9vd6fb`.
**Method:** Every finding below cites a file and line (or a specific code construct). No app code was changed.

> **Caveat — repo vs. production.** Several past changes were applied to production directly through the Supabase SQL Editor (see `docs/02-development-history.md`). Database findings here reflect the **migrations in the repo**. Where a finding depends on an RLS policy or trigger, confirm it against production with the SQL check given in the finding before acting.

> **Caveat — standards citations.** Earlier docs in this repo cite "IS 19598". I could not verify that standard number, so this audit does not rely on it. Standards cited here: WCAG 2.1, ISO 20488:2018 (online consumer reviews), ISO 32111:2023 (e-commerce transaction assurance), Schema.org `OrderStatus`, OWASP ASVS / Top 10, Rwanda Law N° 058/2021 (personal data protection), Rwanda Law N° 36/2012 (competition and consumer protection), and GDPR as a reference baseline. Platform conventions (Shopify, Groupon, Too Good To Go, Stripe, etc.) are cited as "industry practice", not as formal standards.

---

## Status update — fixes applied after the audit (2026-10-03)

With the founder's explicit approval, four findings were fixed in separate commits on this branch. **None of them is deployed yet.**

| Finding | Commit | What changed | Verification |
|---|---|---|---|
| §3 Students could create their own pickup codes | `efbc86c` | Migration `20261003145500_revoke_student_redemption_insert.sql` drops the student INSERT policy and revokes INSERT from `anon`/`authenticated`. `VerifyCode.jsx` rejects codes whose parent order isn't `paid`/`redeemed`. | Local Postgres 16: student and anon INSERT fail with *permission denied*; service-role INSERT and merchant UPDATE still work. |
| §3 Webhook not verified | `e05c266` | `payment-webhook` returns **503** when the secret is unset. It verifies HMAC-SHA256 of the raw body, or the legacy shared-secret header, in constant time; has an optional `UMUNOTA_WEBHOOK_ALLOWED_IPS` allowlist; and logs each rejection with a structured reason. | 8 Deno tests and `deno check`. |
| §1/§2 Wrong price for 4 offer types; expired deals orderable | `88158ea` | `create-order` prices by `offer_type` (fixed_amount, bogo, fixed_price; rejects tiered and free_shipping) and rejects expired deals. `OrderConfirmation.jsx` mirrors the same logic. | 29 Deno parity tests (server and UI agree), `deno check`, `npm run build`. |
| §2 Group discount applied below the group minimum (founder decision 4) | `7c5fb93` | `create-group-order-payment` refuses to submit a group with fewer distinct members than the deal's `min_participants` (409, "This group needs N more member(s)…"). A null minimum behaves as before. Price calculation is unchanged. | 5 Deno tests with an in-memory Supabase fake (`supabase/functions/tests/`); the rejection tests fail without the fix. |

**Still open from §1/§2:** `create-group-order-payment` doesn't check deal expiry. Availability windows aren't enforced, and the feed still lists expired deals.

**To deploy (founder):**
1. `supabase db push` (applies the redemptions migration).
2. **Set `UMUNOTA_WEBHOOK_SECRET` first**: `supabase secrets set UMUNOTA_WEBHOOK_SECRET=...`. Without it, the webhook now rejects every request with 503, by design.
3. `supabase functions deploy payment-webhook create-order create-group-order-payment`.
4. Deploy the frontend.
5. Confirm with UmunotaPay which signature scheme they use (HMAC of the body, or a shared secret), then delete the unused path in `verifyWebhookSignature()`.

---

## Summary

Unipicks has a **well-designed order state machine**, real server-side deadlines, decline reasons, a dispute record, and solid group-order access control. The UI is mobile-first with good alt-text coverage and 44px nav targets.

The big problems are in **money and trust integrity**, and most of them are in parts of the system that have never run in production:

1. **The price a student is charged doesn't match the advertised offer** for 4 of the 7 offer types (`create-order` only understands `discount_percent`).
2. **A student can create their own valid pickup code** without paying (an RLS policy left over from the first redemptions migration).
3. **The payment webhook doesn't verify anything if its secret is unset**, and when the secret is set it compares the raw secret, not a signature of the payload.
4. **No refund flow, and no defined merchant settlement.** Money comes in through UmunotaPay, but nothing in the code describes how a merchant gets paid or how a student gets money back.
5. **Expired deals can still be ordered**, and orders never reach `redeemed`/`completed`.

None of these are hard to fix, but items 1–4 should be done before any real MoMo money moves.

| # | Area | Status | Priority |
|---|------|--------|----------|
| 1 | Offer taxonomy | ⚠️ partial | 🔴 |
| 2 | Cart / checkout | ⚠️ partial | 🔴 |
| 3 | Payment flow | ❌ missing (refunds, settlement, webhook auth) | 🔴 |
| 4 | Order lifecycle | ⚠️ partial | 🔴 |
| 5 | Merchant onboarding | ⚠️ partial | 🟡 |
| 6 | Listing quality | ⚠️ partial | 🟡 |
| 7 | Search & discovery | ⚠️ partial | 🟡 |
| 8 | Reviews & ratings | ⚠️ partial | 🟡 |
| 9 | Notifications | ⚠️ partial | 🟡 |
| 10 | Trust signals | ❌ missing | 🟡 |
| 11 | Accessibility | ⚠️ partial | 🟡 |
| 12 | Mobile responsiveness | ✅ meets (minor gaps) | 🟢 |
| 13 | Error handling & empty states | ⚠️ partial | 🟡 |
| 14 | Data privacy & compliance | ⚠️ partial | 🔴 |

---

## 1. Offer taxonomy

- **Status:** ⚠️ partial
- **Evidence:**
  - `supabase/migrations/20261001033906_add_deal_offer_fields.sql` adds the `deal_offer_type` enum (`percentage`, `fixed_amount`, `bogo`, `fixed_price`, `tiered`, `free_shipping`, `group_buy`) and the supporting columns. The taxonomy matches industry practice (Shopify discount types, Schema.org `Offer` / `PriceSpecification`).
  - `src/pages/MerchantDeals.jsx:418-433` saves `discount_percent` **only** for `percentage` and `group_buy`. For `fixed_amount` and `fixed_price` it stores `discount_value`/`final_price` and sets `discount_percent = null`. For `free_shipping` it sets `price = null` (line 445).
  - `supabase/functions/create-order/index.ts:86-88` and `create-group-order-payment/index.ts:144-145` compute the charged price as `price × (1 − discount_percent/100)` and **ignore `offer_type`, `discount_value`, and `final_price`**.
  - `src/pages/DealsFeed.jsx:36-57` (`getOfferBadge`) shows "SAVE 500 RWF", "BUNDLE 2000 RWF", etc. from those other fields.
- **Gap (what breaks):**

  | Offer type | Badge shows | Student is charged | Result |
  |---|---|---|---|
  | `percentage` | 20% OFF | price × 0.8 | ✅ correct |
  | `group_buy` | GROUP BUY · N NEEDED | price × (1 − %) even if fewer than N joined | ⚠️ discount not conditional on the group size |
  | `fixed_amount` | SAVE 500 RWF | **full price** | ❌ overcharge |
  | `fixed_price` | BUNDLE 2000 RWF | **full `price`**, not 2000 | ❌ wrong price |
  | `bogo` | BUY 1 GET 1 | price × quantity (the free unit isn't modelled) | ⚠️ unclear what the student receives |
  | `tiered` | TIERED DEAL | full price, `tiered_rules` ignored | ❌ |
  | `free_shipping` | FREE DELIVERY | order **rejected** ("does not have a valid price"; `price` is null) | ❌ can't be ordered |

  Charging a different price from the one displayed is a consumer-protection problem (Rwanda Law N° 36/2012 prohibits misleading price representations). It's also a trust problem the product doc explicitly guards against.
- **Recommended fix:** Add one shared server-side `computeOrderPrice(deal, quantity, groupSize?)` used by both Edge Functions. It should switch on `offer_type`, read `final_price` as the authoritative unit price where set, and return `{unit_price, total_price, savings, items_received}`. Until each type is supported end to end, hide the unsupported types (`tiered`, `free_shipping`) in the merchant form.
- **Priority:** 🔴 blocking MVP

## 2. Cart / checkout flow

- **Status:** ⚠️ partial
- **Evidence:**
  - Single-item checkout: `src/pages/DealDetail.jsx` → `/deal/:id/confirm` (`src/pages/OrderConfirmation.jsx`) has a quantity stepper, a price summary (`OrderConfirmation.jsx:105,195`) and a terms link (line 209) → `create-order`. That fits the deal-app pattern (Groupon, Too Good To Go), where a multi-item cart isn't required.
  - `OrderConfirmation.jsx:9-10` re-implements the price formula client-side (percentage only), so the summary the student sees is **also wrong** for non-percentage offers (see §1).
  - `create-order/index.ts:60-83` checks `active` and `price` but **not `expires_at`** (it selects the column but never compares it). It also doesn't check `available_days` / `available_from` / `available_until`, so expired or out-of-hours deals can be ordered.
  - Group checkout: `create-group-order-payment/index.ts` is host-only (line 63) and blocks duplicate submissions (lines 79-91), which is good. It does **not** check `min_participants` and doesn't check deal expiry. It closes the group (line 187) without checking that the update succeeded.
  - There's no student-side **cancel** before the merchant confirms. `cancelled` is only ever set on `group_orders` (`src/pages/GroupOrders.jsx:332`).
- **Gap:** Server-side eligibility checks (expiry, time window, minimum group size); a price summary that matches what is charged; a student cancel action.
- **Recommended fix:** Add `expires_at > now()` and the availability checks to both order functions, and enforce `members.length >= min_participants` before submitting a group. Return the server-computed price summary from a `quote` endpoint and render that, rather than recomputing it in the browser (Baymard Institute: the price shown at review must equal the price charged).
- **Priority:** 🔴 blocking MVP

## 3. Payment flow (mobile money, confirmations, refunds, disputes)

- **Status:** ❌ missing (critical parts)
- **Evidence:**
  - **Collection:** `supabase/functions/process-payment/index.ts:162-230` calls `POST https://api.umunotapay.com/api/v1/payments` with an `Idempotency-Key` (good) and an HMAC request signature. It is **sandbox/untested**, per the founder.
  - **Webhook authentication:** `supabase/functions/payment-webhook/index.ts:119-128`:
    - If `UMUNOTA_WEBHOOK_SECRET` is unset, **every request is accepted** (fail-open).
    - When it is set, the code compares the header to the **raw secret** (`providedSignature !== expectedSecret`). It doesn't verify an HMAC of the body, has no timestamp/replay window, and uses a non-constant-time comparison.
    - Anyone who learns the secret, or finds the endpoint while the secret is unset, can mark any order `paid` by posting `{reference, status: "success"}`.
    - The amount check (line ~196) is skipped when `payload.amount` is missing.
  - **Pickup codes:** `process-payment/index.ts:262-266` generates them with `Math.floor(1000 + Math.random() * 9000)`: 4 digits (9,000 values) from a non-cryptographic RNG, and not unique per merchant. `src/pages/VerifyCode.jsx:14-18` looks codes up by value with `.maybeSingle()`, which **errors** (shown as "No deal found") if two live codes collide.
  - **⚠️ Security — students can create their own pickup codes:** `supabase/migrations/20260830074154_add_redemptions.sql:14-17` grants `INSERT` on `redemptions` to any authenticated student where `student_id = auth.uid()`. No later migration drops it. A student can insert `{deal_id, code: '1234', status: 'pending'}` straight from the browser console and show that code at the counter. `VerifyCode.jsx` will accept it, because it never checks that a paid order exists. To check production:
    `select policyname from pg_policies where tablename = 'redemptions';`
  - **Refunds:** None. `refunded` exists only as a label (`src/components/StatusBadge.jsx:17`, `src/components/OrdersTab.jsx:18`). Nothing sets it, and there's no UmunotaPay refund/reversal call. Per the founder, refunds today are manual MoMo transfers by an admin, with no record in the system.
  - **Disputes:** `supabase/migrations/20260927160000_add_dispute_record.sql` plus `src/pages/AdminDisputes.jsx` give a proper dispute record (ISO 32111 names dispute resolution as a post-transaction activity). However, resolving a dispute has **no money outcome**: no refund, partial refund or credit is linked to it.
  - **Merchant settlement:** `process-payment` never reads `merchant_profiles.momo_pay_code`. The code doesn't say whether money goes to Unipicks' UmunotaPay account or to the merchant, or how and when merchants are paid out.
  - **Payment window:** 5 minutes after acceptance (`update-order-status/index.ts:186-189`). MoMo USSD prompts can take 1–2 minutes and students may need to top up; 5 minutes is tight.
- **Gap:** Webhook authenticity, unforgeable redemption, refunds as a recorded transaction, a settlement model, a regulatory check on the payment provider.
- **Recommended fix:**
  1. Drop the student INSERT policy on `redemptions`. Redemptions should only be created by the service role inside `process-payment` / `payment-webhook`.
  2. Make the webhook fail **closed**. Verify `HMAC-SHA256(secret, timestamp + body)` with a constant-time compare and a 5-minute replay window (the Stripe/GitHub webhook pattern; OWASP ASVS V13). Require the amount to be present and to match.
  3. Use `crypto.getRandomValues` for codes. Make them 6 characters or add a QR, and enforce `unique(merchant_id, code) where status = 'pending'`.
  4. Add a `refunds` table (`order_id, amount, reason, method: manual_momo|provider, reference, processed_by, processed_at`). Have the admin "Resolve dispute" action create one, so even manual refunds leave a record (ISO 32111 transaction record; Law 36/2012 consumer redress).
  5. Write down the settlement model. Confirm UmunotaPay's licensing with the National Bank of Rwanda (BNR), and record which account receives funds.
  6. Consider a 10-minute payment window.
- **Priority:** 🔴 blocking MVP

## 4. Order lifecycle states and transitions

- **Status:** ⚠️ partial
- **Evidence:**
  - States are well defined and labelled (`src/components/StatusBadge.jsx:1-18`) and map cleanly to Schema.org `OrderStatus` (`OrderPaymentDue`, `OrderProcessing`, `OrderPickupAvailable`, `OrderDelivered`, `OrderCancelled`, `OrderReturned`).
  - Transitions are guarded server-side with compare-and-set updates, e.g. `.eq('status', 'pending_confirmation')` in `update-order-status/index.ts:205-208`. Decline needs a reason (lines 109-138), matching product doc §18.
  - `supabase/functions/expire-orders/index.ts:60-86` expires **only** `pending_confirmation` orders. Confirmed-but-unpaid orders stay `confirmed` in the database forever. `payment_expired` is only written lazily when `process-payment`/`payment-webhook` happens to touch the order, and the UI works it out client-side (`OrdersTab.jsx:385-389`).
  - **`redeemed` / `completed` can't be reached for orders.** `VerifyCode.jsx:32-35` updates `redemptions.status`, not `orders.status`, and no migration has a trigger that syncs them. Merchant analytics and order history therefore never see orders finish.
  - Neither expiry path notifies the student (`expire-orders` writes no chat message or notification).
  - `ready` (product doc §18, "Business marks Ready") isn't implemented.
  - **Stale documentation:** `docs/group-orders.md` §2 and §5–7 describe "Architecture A" (each member pays separately, per-member allocations, a shared code after everyone pays). The current behaviour (`create-group-order-payment`, 2026-10-03) is **host pays for the whole group as one order**. `group_order_payment_members` and `reserve_group_order_payment_members` are now unused.
- **Gap:** Server-side payment expiry, redemption → order completion, a `ready` state, expiry notifications, docs that match the system.
- **Recommended fix:** Extend `expire-orders` to move `confirmed` → `payment_expired` once `payment_deadline` passes, and post a chat message for each expiry. Redeem through an RPC that updates the `redemptions` and `orders` rows together, in one transaction. Update or archive `docs/group-orders.md` and mark the Architecture A tables as deprecated.
- **Priority:** 🔴 blocking MVP (completion and expiry); 🟡 for `ready`

## 5. Merchant onboarding and approval

- **Status:** ⚠️ partial
- **Evidence:**
  - `src/pages/RegisterMerchant.jsx:13,37` collects an RDB number (required, but its format isn't validated). Line 59 stores it only in auth `user_metadata`. `merchant_profiles` gets only `business_name` (lines 78-81).
  - `src/pages/AdminApprovals.jsx:23` shows the admin **only the business name**: no RDB number, phone, address or MoMo code to check.
  - Reject is a **hard delete** with no reason sent to the merchant (`AdminApprovals.jsx:39-48`).
  - Approval is enforced server-side (`20260914002000_prevent_merchant_self_approval.sql`, `20260914003000_require_approved_merchants_for_deals.sql`). ✅
  - No "your account is under review" screen: a grep for `awaiting approval|pending approval|not approved` in `src/` finds nothing. An unapproved merchant who tries to create a deal hits a raw RLS error.
  - `momo_pay_code` is optional (`src/pages/MerchantProfile.jsx:70`) and unused by payments.
  - Product doc §16 also lists category, logo and menu; none are captured at signup.
- **Gap:** Admins can't actually verify what they approve, merchants get no status feedback, and rejections leave no audit trail.
- **Recommended fix:** Copy RDB, phone, address and category into `merchant_profiles` and show them on the approval card. Add `approval_status` (`pending|approved|rejected|suspended`) plus `rejection_reason` instead of deleting. Show merchants a status banner.
- **Priority:** 🟡 should-have

## 6. Product listing quality

- **Status:** ⚠️ partial
- **Evidence:**
  - Image upload exists (`MerchantDeals.jsx:402-416`), but the image is **optional** and the client checks only `accept="image/*"` (line 1092), with no size limit. The original filename is kept in the storage path (line 405).
  - Description is optional (line 440). Title is required.
  - Availability windows (`available_days`, `available_from/until`) exist but only affect ranking (`DealsFeed.jsx:337-373,407-427`); they aren't shown as "Available Mon–Fri 11:00–14:00" to the student and aren't enforced at order time.
  - No stock or quantity limit: a grep for `stock|inventory|max_redemptions` finds nothing in migrations.
  - Deal cards show an expiry date, a rating and an offer badge (`DealsFeed.jsx:600-723`). ✅
- **Gap:** Required imagery, visible availability, a sold-out state.
- **Recommended fix:** Require at least one image (compressed client-side to ≤1 MB, 4:3) and a short description. Show the availability window on the card and detail page. Add an optional `quantity_available` that decrements when an order is paid and shows "Sold out" (Too Good To Go / Groupon pattern).
- **Priority:** 🟡 should-have

## 7. Search and discovery

- **Status:** ⚠️ partial
- **Evidence:**
  - The feed loads **all** active deals and filters client-side (`DealsFeed.jsx:188-192,281-305`). It doesn't filter `expires_at < now()`, so expired deals still appear.
  - Categories are a hard-coded list (`DealsFeed.jsx:79`: Pizza, Tacos, Burgers…) matched as **substrings of the title/description**. There's no `category` column on `deals`.
  - The "Smart Discovery v3" ranking (`DealsFeed.jsx:307-443`) weights day, time, expiry, affordability, freshness and quality, in line with product doc §12. ✅ However, `ratingStats` is missing from the `useMemo` dependencies (line 445), so the quality score is stale on first render.
  - Ratings are fetched one RPC per deal (`DealsFeed.jsx:203-206`), an N+1 pattern that will get slow as the catalogue grows.
  - Multi-tab search (People / Businesses / Deals) is in `src/pages/StudentSearch.jsx` with a 300 ms debounce. ✅ Searches are logged (`record_deal_search`) for demand intelligence. ✅
  - No user-controlled sort (cheapest, ending soon, top rated) and no price filter outside the AI "advisor".
  - The empty state for filtered results always says *"Nothing fits that budget right now"* (`DealsFeed.jsx:558`), even when search or a category caused the empty list.
- **Gap:** Real categories, server-side expiry filtering, sort controls, scalable rating aggregation.
- **Recommended fix:** Add `deals.category` (an enum, set in the merchant form) and filter on it. Filter `expires_at > now()` in the query. Add a sort chip row (Recommended · Cheapest · Ending soon · Top rated). Return `avg_rating` / `review_count` in one view or RPC instead of N calls.
- **Priority:** 🟡 should-have (🔴 for hiding expired deals, as part of §2)

## 8. Reviews and ratings

- **Status:** ⚠️ partial
- **Evidence:**
  - Only verified purchasers can rate: the insert policy requires a `redeemed` redemption owned by the student (`20260904090000_add_ratings.sql:20-31`). ✅ ISO 20488 favours verified-purchase reviews.
  - There's a **single** 1–5 score (line 7). Product doc §14 requires separate **deal quality** and **service quality** ratings.
  - `"Anyone can view ratings" … to public using (true)` (lines 15-17) exposes `student_id` to everyone, including merchants and anonymous users. That contradicts product doc §14: *"Rating identity should be private from the business."*
  - Edits are allowed for 24 hours (lines 33-37) but there's no "edited" label.
  - Admin moderation is a **hard delete** (`src/pages/AdminReviews.jsx:25-27`). Product doc §15 requires hidden-but-retained records.
  - No merchant reply and no reporting of reviews.
- **Gap:** Two-axis ratings, rater anonymity, soft moderation, merchant replies, an edited label.
- **Recommended fix:** Add `service_rating`, and revoke direct `SELECT` on `ratings` in favour of an aggregate RPC/view without `student_id`. Add `hidden_at/hidden_reason/edited_at` instead of deleting. Add a `rating_replies` table for merchants (ISO 20488: let businesses respond; keep moderation transparent).
- **Priority:** 🟡 should-have

## 9. Notifications (order status, chat, group activity)

- **Status:** ⚠️ partial
- **Evidence:**
  - Merchants get an in-app bell (`src/components/NotificationBell.jsx`, Realtime on `notifications`) plus live Orders and Messages badges (`src/pages/Dashboard.jsx:90-110`). ✅
  - Students are notified through chat messages: accept (with a one-tap "Pay Now", `update-order-status/index.ts:275-291`), decline with reason, and the pickup code after payment. Unread badge on the chat icon. ✅
  - **Nothing goes out when the app is closed.** There's no Web Push, SMS or email for order events: no `PushManager` in `src/` or `public/sw.js`. With 5-minute merchant and payment windows, a merchant who isn't looking at the dashboard **will** miss orders, and they'll auto-expire.
  - No student notification on `confirmation_expired` or `payment_expired`, or when someone joins your group. No merchant notification when a student pays.
- **Gap:** Out-of-app delivery for time-critical events.
- **Recommended fix:** Add Web Push (W3C Push API, via the existing service worker) for merchant "new order" and student "accepted / pay now". Add an SMS fallback (e.g. Africa's Talking) for merchants, because MoMo users reliably have SMS. Fill in the missing event messages listed above.
- **Priority:** 🟡 should-have (🔴 for merchant new-order alerts if the 5-minute window stays)

## 10. Trust signals (verified merchants, response rates, badges)

- **Status:** ❌ missing
- **Evidence:**
  - Approval exists in the backend, but students see **no** "Verified" badge: a grep for `verified|badge|response` in `DealDetail.jsx`, `DealsFeed.jsx` and `StudentSearch.jsx` finds only offer badges.
  - `get_business_performance_signals` (migration `20260914200000_*`) exists but isn't shown to students. There's no "↗ Improving" indicator (product doc §17), no response time, and no orders-completed count.
  - Merchant phone is shown after payment (`src/components/MerchantPhone.jsx`). ✅
- **Gap:** Students can't tell a vetted, responsive business from a new one.
- **Recommended fix:** Show a "Verified by Unipicks" tick for approved merchants. On the deal and business pages, show "Usually confirms in ~N min" and "N orders completed", computed from `orders` timestamps. Add the "↗ Improving" chip once rating trends are available.
- **Priority:** 🟡 should-have

## 11. Accessibility (WCAG 2.1 AA basics)

- **Status:** ⚠️ partial
- **Evidence (contrast, measured from `src/index.css` tokens and Tailwind defaults):**

  | Pair | Ratio | WCAG 1.4.3 (4.5:1 text) |
  |---|---|---|
  | Light mode: `text-accent` (lime `hsl(83 49% 52%)`) on background | **2.04:1** | ❌ (used 60× in `src/`) |
  | Light mode: `StatusBadge` `text-green-400` on light surface | **1.74:1** | ❌ |
  | Light mode: `text-amber-400` badge | **1.67:1** | ❌ |
  | Light mode: `text-blue-400` badge | **2.54:1** | ❌ |
  | Light mode: `text-red-400` errors (e.g. `VerifyCode.jsx:72`) | **2.66:1** | ❌ |
  | Light mode: `text-amber-500` star rating | **2.15:1** | ❌ |
  | Light mode: `text-muted` | 3.26:1 | ❌ for body text |
  | Light mode: `muted-foreground` | 5.59:1 | ✅ |
  | Dark mode: primary, secondary text and button labels | 7.3–8.7:1 | ✅ |

  Dark mode (the default) passes. **Light mode fails** for accent links, all status badges, errors and ratings.
- **Other evidence:**
  - Tap targets: nav items and `IconButton` use `min-h-11 min-w-11` (44px) (`src/components/IconButton.jsx:36`, `StudentBottomNav.jsx:74`). ✅ Category chips (`DealsFeed.jsx:541`, `py-1.5 text-sm`) are about 32px tall, below the 44px Apple HIG / 48dp Material guidance (WCAG 2.5.5 AAA; 2.2's 2.5.8 AA minimum is 24px).
  - Alt text: all `<img>` tags checked have `alt` (deal title, business name). ✅ Stories use the generic `alt="Story"` (`StoryViewer.jsx:62`, `MerchantStories.jsx:222`).
  - Keyboard: story navigation uses click-only `<div onClick>` (`StoryViewer.jsx:84-85`), so it can't be reached with a keyboard (WCAG 2.1.1). Only 2 `focus-visible` styles exist in `src/` (WCAG 2.4.7). No `prefers-reduced-motion` handling for the slide-up and story animations (2.3.3, AAA, but cheap to do).
  - `StatusBadge` uses 11px text (`StatusBadge.jsx:41`).
  - `<html lang="en">` is set (`index.html:2`). ✅
- **Recommended fix:** Add darker light-mode tokens (e.g. accent text `hsl(92 41% 30%)`; badge colours at the `-700` shade on `-100` backgrounds) and keep lime for fills only. Make story prev/next real `<button>`s with labels. Add a global `:focus-visible` ring and a `prefers-reduced-motion` block. Raise chips to `min-h-11`.
- **Priority:** 🟡 should-have

## 12. Mobile responsiveness

- **Status:** ✅ meets (minor gaps)
- **Evidence:** Viewport with `viewport-fit=cover` (`index.html:5`); safe-area insets (`src/index.css`, `StudentLayout.jsx` padding with `--safe-area-*`); `100dvh` chat for keyboard safety; bottom nav on mobile and top nav on desktop (`StudentLayout.jsx`); PWA manifest and service worker (`public/manifest.json`, `public/sw.js`).
- **Gap:** The mobile bottom nav has no Social entry, while the desktop nav does (`StudentBottomNav.jsx` vs `DesktopNav.jsx:6`; covered in the Social audit). The merchant and admin dashboards are built around a tab row; they haven't been reviewed at 360px for overflow.
- **Recommended fix:** Run a 360×640 Playwright screenshot pass over the merchant and admin tabs, and add Social to mobile navigation (see the Social audit).
- **Priority:** 🟢 nice-to-have

## 13. Error handling and empty states

- **Status:** ⚠️ partial
- **Evidence:**
  - `src/components/EmptyState.jsx` exists but is **imported nowhere**. Empty states are ad-hoc `<p>` text (e.g. `DealsFeed.jsx:557-563`), although `GroupOrders.jsx` has proper skeletons and empty states. ✅
  - 43 places in `src/` show the raw backend error (`setError(error.message)`). `src/lib/payment.js:25-27` shows `Payment request failed (500): {raw JSON body}` to the student.
  - The feed loading state is plain text (`DealsFeed.jsx:448`) while `Skeleton.jsx` exists.
  - Edge Functions return clear, specific messages with correct HTTP status codes (400/401/403/404/409). ✅
- **Gap:** Consistent empty and loading patterns; user-safe error copy.
- **Recommended fix:** Add a `friendlyError(err)` helper that maps known codes (expired window, deal inactive, network) to plain-English messages with a next step, and logs the raw error. Use `EmptyState` and `Skeleton` on the feed, search and orders screens.
- **Priority:** 🟡 should-have

## 14. Data privacy and compliance (Rwanda / GDPR basics)

- **Status:** ⚠️ partial
- **Evidence:**
  - `src/pages/Privacy.jsx` (34 lines) covers the basics: what is collected, no sale of data, retention "as needed". However:
    - It doesn't name the **data controller** (legal entity, address). The contact is "the support email listed in the platform settings", and there isn't one.
    - It doesn't state a legal basis, concrete retention periods, or **cross-border transfer** (Supabase hosting region). Rwanda Law N° 058/2021 restricts storing personal data outside Rwanda without authorisation and requires controllers/processors to **register with NCSA**.
    - It doesn't disclose **behavioural tracking** (`deal_views`, `deal_searches`, repeat-purchase and rating "learning signals") or that a student's **phone number is shared with the merchant** (`create-order/index.ts:113`).
    - It says "not children under 13", while Social onboarding requires 18+ (`SocialOnboarding.jsx:58`). The two age rules don't match.
  - Terms (`src/pages/Terms.jsx`) have no **refund/cancellation policy** section (Law 36/2012; ISO 32111 transparent reversal policy).
  - There's no self-service **account deletion** or **data export** (GDPR Art. 17/20; Law 058/2021 data-subject rights). Only the admin RPC `admin_delete_user` exists.
  - The ratings table exposes `student_id` publicly (see §8).
  - Signup has a terms/privacy checkbox (`Register.jsx:205-216`). ✅ Student email-domain check (`src/lib/universities.js:5`). ✅ Whether Supabase "confirm email" is on in production can't be seen from the repo; the README says it was off.
- **Gap:** Controller identity and contact, NCSA registration, a transfer basis, tracking disclosure, deletion and export, a refund policy.
- **Recommended fix:**
  - Rewrite the privacy policy against Law 058/2021: name the controller and a real contact email, state the hosting region and transfer basis, list the tracking signals and their purpose, set retention periods, and keep one consistent age rule (18+).
  - Register with NCSA.
  - Add "Delete my account" and "Download my data" in Profile.
  - Add a refund and cancellation section to the Terms.
  - Confirm Supabase email confirmation is on.
  - Have a Rwandan lawyer review before launch.
- **Priority:** 🔴 blocking MVP (policy text, controller identity, refund terms); 🟡 for self-service export

---

## Top 10 prioritized actions (ranked by impact)

| Rank | Action | Why | Effort | Refs |
|---|---|---|---|---|
| 1 | **Drop the student INSERT policy on `redemptions`**; create redemptions only server-side; check a paid order exists in `VerifyCode` | Anyone can get free food with a self-made code | XS (1 migration + 3 lines) | §3 |
| 2 | **Make `payment-webhook` fail closed with HMAC + timestamp verification**; require amount to match | Forged "paid" webhooks | S | §3 |
| 3 | **Add a shared server-side price function** that honours all 7 offer types; hide types not yet supported | Students are overcharged or can't order; consumer-law exposure | M | §1, §2 |
| 4 | **Enforce `expires_at`, availability windows and `min_participants`** in `create-order` / `create-group-order-payment`; filter expired deals in the feed | Students can order deals that have ended | S | §2, §7 |
| 5 | **Define and record refunds and settlement**: `refunds` table, admin "refund" action tied to disputes, written merchant payout model, confirm BNR licensing of UmunotaPay | No money-back path; unclear who holds funds | M | §3 |
| 6 | **Run one end-to-end sandbox payment** (single + group) through `process-payment` → webhook → pickup code → redeem | Nothing has been tested with money yet | S | §3, §4 |
| 7 | **Close the lifecycle**: expire unpaid orders server-side, sync redemption → order `redeemed/completed`, notify students on expiry | Orders never complete; analytics are wrong | S | §4 |
| 8 | **Privacy policy + Terms rewrite** (controller, contact, NCSA, hosting region, tracking, refund policy, single age rule) | Legal baseline for launch | S (writing) | §14 |
| 9 | **Merchant new-order push/SMS alert** | 5-minute window plus no alerts means orders expire unseen | M | §9 |
| 10 | **Light-mode contrast fix + "Verified" merchant badge** | Unreadable badges and errors; no visible trust cue | S | §10, §11 |

Also recommended (documentation hygiene): **update or archive `docs/group-orders.md`.** It describes the per-member payment model (Architecture A); the code now uses host-pays-all. Mark `group_order_payment_members` and `reserve_group_order_payment_members` as deprecated.

---

## Founder decisions (answers to the original open questions)

1. **Settlement → merchant-directed payouts (target architecture).** The student pays and the money goes directly to the merchant's MoMo Pay code. Today `process-payment` never reads `merchant_profiles.momo_pay_code`; this is a **bug** against that target.
   **Recommended fix:**
   - Make `momo_pay_code` required (and format-validated) before a merchant can be approved.
   - Have `process-payment` load it and pass it to UmunotaPay as the payee or collection account, using whatever field their API offers for split or direct-to-merchant collection.
   - Block payment with a clear message if the merchant has no code.
   - Store the payee code on the `transactions` row for reconciliation.

   Refunds then become merchant-originated reversals: the admin dispute action records the refund, and the merchant (or UmunotaPay's reversal API) sends the money back. Confirm with UmunotaPay and BNR whether direct-to-merchant collection changes Unipicks' licensing position.
2. **BOGO:** the student pays for `buy_quantity` items and receives `buy_quantity + get_quantity`. **Implemented** in `88158ea`.
3. **Free delivery:** hide until a delivery feature exists. **Recommended: (a) reject at deal creation.** Remove `free_shipping` from the merchant offer-type dropdown, and add a DB check constraint or trigger that rejects new `free_shipping` deals so merchants find out immediately. Order-time rejection is already in place as a backstop (`88158ea`).
4. **Group-buy discount:** applies only once `min_participants` is reached. **Implemented** in `7c5fb93` by refusing to submit a group below the minimum: the merchant never receives an under-filled group order, so the group price is only ever charged to full groups. Price calculation untouched. Follow-up UI work (not done): show "N more needed to unlock the group price" in `GroupOrders.jsx`, and disable the host's Pay button until the group is full.
5. **Supabase region: eu-west-3 (Paris).** Student personal data is therefore stored **outside Rwanda**. The privacy policy must say so, name the hosting provider and region, and state the legal basis for the transfer. Under Law N° 058/2021, storing personal data outside Rwanda requires authorisation from the supervisory authority (NCSA). Apply for it as part of controller registration. Suggested policy text: *"Unipicks stores your data with Supabase, Inc. on servers located in the European Union (Paris, France, region eu-west-3). We transfer data outside Rwanda under [authorisation reference] from the National Cyber Security Authority, with contractual and technical safeguards including encryption in transit and at rest and access controls."*
6. **Production policy check:** the founder will run the `pg_policies` query separately. Until then, the audit assumes the finding is correct.
