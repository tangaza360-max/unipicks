# Unipicks — Notifications Audit

**Date:** 2026-10-03 · **Branch:** `claude/unipicks-codebase-audit-9vd6fb` · **Roles covered:** students, merchants, admins
**Method:** read-only review of every place a notification is created or displayed. Every finding cites `file:line`.

> **Code state.** This audit reflects the branch, including two commits that are **committed but not yet deployed to production**:
> - `7c5fb93`: groups can't be submitted below `min_participants`.
> - `43a0d2f`: `redeem_pickup_code` RPC moves orders `paid → redeemed`.
>
> In production today, orders never reach `redeemed`. Database findings reflect the repo's migrations; production may differ where changes were applied through the SQL Editor.

> **Channel scope (founder decision, 2026-10-03):**
> - **In-app:** mandatory; must work perfectly.
> - **Web Push:** free; add now as the primary out-of-app channel.
> - **Transactional email (Resend free tier, 100/day · 3,000/month):** should add. Depends on turning on Supabase email confirmation.
> - **SMS:** post-MVP, and only for the merchant's 5-minute order window once UmunotaPay is proven.

> **Citations.** Formal sources used:
> - W3C **Push API** and the WHATWG **Notifications API** (web push mechanics).
> - Apple's WebKit announcement that **web push on iOS/iPadOS 16.4+ works only for web apps added to the Home Screen**.
> - **Android notification channels** (Android 8.0+: user-controllable categories).
> - **WCAG 2.1 §4.1.2** (Name, Role, Value) and **§4.1.3** (Status Messages, Level AA).
> - **ISO 32111** (e-commerce transaction assurance: order confirmation and dispute handling are named activities; already used in the e-commerce audit).
>
> Behaviours modelled on Instagram, WhatsApp, Snapchat, Uber or Amazon are labelled **common practice / platform benchmark**. They aren't formal standards.

---

## 1. How notifications work today (map)

Three separate channels exist, and none is linked to the others:

```
                     ┌───────────────────────── CREATED BY ─────────────────────────┐   ┌──── SHOWN IN ────┐
MERCHANT  notifications table (merchant_id NOT NULL, no target/link/payload)
          • "New order from X"             create-order/index.ts:223                 →  NotificationBell (merchant only)
          • "Group order from X…"          create-group-order-payment/index.ts:214   →  + Orders / Messages tab badges
          • "Student X ordered Y"          trigger AFTER INSERT ON redemptions
                                           (20260903193927:43-44, fn in 20260904150000:17)
          • "Payment received for Unipicks order <uuid>"   payment-webhook/index.ts:482
STUDENT   chat_messages sent "from" the merchant
          • accepted + [Pay Now] link      update-order-status/index.ts:284-292      →  chat bubble badge (top bar)
          • declined + reason              update-order-status/index.ts:245          →  Messages inbox
          • pickup code                    process-payment/index.ts:351,406
STUDENT   social_notifications table (user_id, type, actor_id, reference_id, message, is_read)
          • friend_request / _accepted     20260917130000_create_student_profiles.sql:598,674   →  SocialActivity (inside Social,
          • message_request / _accepted    …:996,1064                                              not reachable on mobile)
ADMIN     — nothing —
```

---

## 2A-1. E-commerce notification standards

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Order placed: merchant alerted** | ✅ | `create-order/index.ts:223`; group: `create-group-order-payment/index.ts:214`; live bell (`NotificationBell.jsx:44-54`) and pending badge (`Dashboard.jsx:90-110, 265-268`) | In-app only. With a 5-minute confirmation window and no out-of-app channel, a merchant who isn't looking at the dashboard misses the order and it expires | Web Push "New order, accept within 5 min" to the merchant. Post-MVP: SMS fallback for this one event | 🔴 |
| **Order placed: student receipt** | ⚠️ | The order appears in Order History (`ProfileTab.jsx:385` → `OrdersTab`) | No confirmation of "order sent, waiting for the business" beyond the screen the student is on | Covered by the student order-update fix in §2A-3 (S1) | 🟡 |
| **Order accepted: student** | ⚠️ | Merchant chat message with a Pay Now link: `update-order-status/index.ts:284-292` | **Only in chat** (see §2A-3). The student has 5 minutes to pay (`:186-189`) but no signal outside a busy inbox | §2A-3 fix S1+S2, plus Web Push | 🔴 |
| **Order declined: student** | ⚠️ | Chat with reason: `update-order-status/index.ts:236-252` | Chat only. No order-status unread state | §2A-3 | 🔴 |
| **Order expired (merchant never responded / student didn't pay)** | ❌ | `expire-orders/index.ts:84-86` updates status only, with no message. Payment expiry is written lazily (`process-payment/index.ts:685`) and never announced | The student is never told; the merchant is never told an order lapsed | When `expire-orders` changes a status, notify the student ("Campus Chips didn't respond in time") and the merchant ("You missed an order") | 🔴 |
| **Payment received: student side** | ❌ on the async path | The pickup-code chat is sent only by `process-payment` (`:629, 813, 1362`). **`payment-webhook` sends no chat message** (0 references to `chat_messages`). It creates the redemption (`ensureRedemption`, `:124`) and marks the order `paid` (`:451`) | If the MoMo prompt completes after the student leaves checkout, the order becomes `paid` but **the student never receives their pickup code**. They have to go looking in Order History | `payment-webhook` sends the same pickup-code message as `process-payment` (extract a shared helper), plus a student notification | 🔴 |
| **Payment received: merchant side** | ⚠️ | Redemption trigger "Student X ordered Y" (`20260904150000:17`) **and** webhook "Payment received for Unipicks order `<uuid>`" (`payment-webhook/index.ts:482-491`) | **Duplicate and unclear.** A paid order produces 2–3 bell entries ("New order" → "Student X ordered Y" → "Payment received for … `<raw uuid>`"). "Ordered" is misleading at payment time, and the raw UUID means nothing to a merchant | One canonical merchant event per state: "✅ Paid: Aline · Chips combo ×1 · 1,500 RWF · code ready". Drop the trigger's message, or the webhook's, so each payment produces exactly one | 🟡 |
| **Payment failed** | ❌ | `process-payment/index.ts:1055,1125,1272` set `failed`; the API response is the only signal | If the student isn't on the checkout screen, they never learn the payment failed or that they can retry | Notify the student "Payment didn't go through: try again before HH:MM" with a deep link to `/payment?order_id=` | 🔴 |
| **Ready for pickup** | ❌ | No `ready` status exists (product doc §18 lists it) | Not implementable yet | Post-MVP: add a `ready` status plus a merchant "Mark ready" button, which notifies the student | 🟢 |
| **Redeemed / completed** | ⚠️ | `43a0d2f` (not deployed) now moves orders to `redeemed`; nothing announces it | No "Enjoy your meal, rate your order" follow-up, so the rating loop has no trigger | When `redeem_pickup_code` succeeds, notify the student with a deep link to the rating prompt | 🟡 |
| **Dispute raised / resolved** | ❌ | `raise_order_dispute` / `resolve_order_dispute` (`20260927160000_add_dispute_record.sql`) insert no notification. No admin inbox exists | **Compliance gap:** admins don't learn a dispute was raised (ISO 32111 dispute handling). The merchant doesn't learn they're disputed; the student doesn't learn the outcome | Raise → notify **all admins** and the merchant. Resolve → notify the student and the merchant. Also add an open-dispute **badge on the admin Disputes tab** (parallel to `Dashboard.jsx:265`) | 🔴 |
| **Refund status** | ❌ | No refund flow; `refunded` is a label only (`StatusBadge.jsx:17`) | Nothing to notify. Per the founder, refunds are manual MoMo transfers | When the refunds table lands (e-commerce audit §3), every refund state change notifies the student | 🟡 (blocked) |
| **Receipt / transaction record persistence** | ⚠️ | Order History shows status, quantity, total and pickup code (`OrdersTab.jsx:98, 385-412`) | The only receipt is the order row. It's reachable only via Profile → Order History, and there's no emailed receipt (the "durable record") | In-app: OK for MVP. With Resend, email a receipt on `paid` (order id, merchant, items, amount, pickup code, time) | 🟡 |
| **Merchant: new message** | ✅ | Messages tab badge (`Dashboard.jsx:270-273`) | In-app only | Web Push | 🟡 |
| **Merchant: review received** | ❌ | Ratings insert notifies no one (`20260904090000_add_ratings.sql`) | Merchants don't learn about feedback (product doc §14 accountability loop) | Notify the merchant "New ★4 rating on Chips combo", with no student identity (product doc §14 anonymity) | 🟢 |
| **Merchant: dispute raised** | ❌ | see Dispute row | — | — | 🔴 |
| **Delivery channels** | ❌ | In-app only. `public/sw.js` handles install/activate/fetch only (`:4,11,22`); no `PushManager`, email or SMS anywhere | Closed app = no notification for anyone | Web Push now; Resend email once email confirmation is on; SMS post-MVP | 🔴 |

## 2A-2. Social notification standards (platform benchmark: Instagram, WhatsApp, Snapchat)

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Friend request received / accepted** | ⚠️ | Rows written: `20260917130000:598, 674`. Listed in `SocialActivity.jsx:165-174` | Shown only inside Social, which isn't in the mobile nav (social audit §0). No live update: `SocialActivity` has no Realtime channel | Activity bell in the student top bar (§2A-4) and a Realtime subscription | 🟡 |
| **Message request / accepted** | ⚠️ | `20260917130000:996, 1064` | Same as above | Same | 🟡 |
| **New direct message** | ✅ (in-app) | Live unread badge: `StudentLayout.jsx:64-93`; `StudentTopBar.jsx:30-45` | No push | Web Push for DMs, collapsed per conversation (WhatsApp common practice) | 🟡 |
| **Group chat unread** | ❌ | Group messages have `receiver_id = null`. The unread query filters `receiver_id = me` (`StudentLayout.jsx:67`), `markRead` does the same (`ChatThread.jsx:172-176`), and `Messages.jsx:278` hard-codes group `unreadCount: 0` | **Group chats never show unread**, so "someone joined / asked to pay" in the group thread goes unseen | Add a per-member read pointer `group_chat_reads(group_order_id, student_id, last_read_at)`. Unread = messages newer than `last_read_at` (WhatsApp/Slack common practice; a shared `is_read` can't work for groups) | 🟡 |
| **Mentions in group chats** | ❌ | No mention parsing | Low value at group-order scale (2–10 people) | Post-MVP | 🟢 |
| **Group order activity** (joined, minimum reached, paid) | ❌ | No inserts in the group-order migrations or `GroupOrders.jsx` | The host doesn't know when people join or the group fills. With `7c5fb93`, the host can't submit until the minimum is met, so not knowing when it's met costs orders | Notify the host on join and on "minimum reached, you can submit now". Notify members on submit, paid and code ready | 🟡 |
| **Story replies / reactions** | n/a | Student stories are v2 (social audit D4) | — | Revisit with stories | — |
| **Rate limiting / batching** | ❌ | Every event inserts its own row; no grouping | Bursty events (5 people joining a group in a minute) will produce 5 pushes | Collapse by `(user, type, target)` within a time window: update the existing unread row ("Kevin and 3 others joined your group") instead of inserting. Push uses a notification `tag` so it replaces the previous one (Notifications API `tag`; Instagram-style grouping is common practice) | 🟡 |
| **Read / unread per notification** | ✅ | Merchant: `NotificationBell.jsx:119-129`. Social: `SocialActivity.jsx:79-93` | Chat-delivered order updates have no read state of their own (§2A-3) | — | — |
| **Mark all as read** | ✅ | `NotificationBell.jsx:133-144`; `SocialActivity.jsx:104-124` | — | — | — |
| **Preferences (mute types, quiet hours)** | ❌ (and misleading) | The Profile "Notifications" settings show 5 **display-only rows with no toggles** (`ProfileTab.jsx:963-990`): Messages, Friend requests, Orders, Deals, Events. No preference storage exists anywhere | UI implies control that doesn't exist. "Deals" and "Events" notifications don't exist; Events isn't a feature | **Recommendation: remove the rows now; build real preferences together with Web Push.** Reasoning in §2A-5 | 🟡 |
| **Push vs in-app vs email** | ❌ | In-app only | — | See channel rows above | 🔴 |

## 2A-3. ⚠️ High-priority finding: students get order updates only as chat messages

**What happens today**
- Acceptance, decline and pickup code are inserted into `chat_messages` with the **merchant as sender** (`update-order-status/index.ts:245, 284`; `process-payment/index.ts:406`).
- The only signal is the generic chat bubble count in the top bar (`StudentTopBar.jsx:40-45`). It counts **all** unread chat, so an "accepted, pay within 5 minutes" message looks the same as "hi" from a friend.
- Order updates have **no unread state separate from chat**. Once the student opens the thread, the update counts as read, even if they didn't pay.
- In a busy inbox, a time-critical order update is easy to miss. Missing it means the order expires (5-minute window).
- Expiry, payment failure and async payment success don't even produce a chat message (rows above).

**Does a student notifications table exist?**
- `public.notifications` is **merchant-only**: `merchant_id NOT NULL`, and RLS reads by `merchant_id` (`20260903193712_add_notifications_table.sql:4, 19-22`).
- **`public.social_notifications` is already a generic per-user inbox:** `user_id, type, actor_id, reference_id, message, is_read` (`20260917130000:206-221`). It has indexes for unread-by-user, RLS for "own rows", and a working list UI with mark-read and mark-all (`SocialActivity.jsx`). Nothing in it is social-specific except the name.

**Recommended fix: the smallest change that works, with no new notification system**

| Step | What | Files | Migration |
|---|---|---|---|
| **S1. "Needs action" badge from order state** (no new data) | Count the student's orders where `status = 'confirmed' and payment_deadline > now()` (and later `paid` with an unseen pickup code). Show it as a badge on the **Profile** nav item, which holds Order History today, and on the "Order History" row (`ProfileTab.jsx:912-927`). Live via the existing `orders` Realtime publication (`20260915090000_enable_orders_realtime.sql`). Direct parallel to the merchant's pending-order badge (`Dashboard.jsx:90-110`). When D1 ships, the badge moves to wherever orders live | 3 (`StudentLayout.jsx`, `StudentBottomNav.jsx`, `ProfileTab.jsx`) | none |
| **S2. Mirror order events into `social_notifications`** | Edge Functions also insert a row for the student with `type ∈ {order_accepted, order_declined, payment_succeeded, payment_failed, order_expired, order_redeemed, dispute_updated}` and `reference_id = order_id`. Keep the chat messages: they're the conversational record. Add a **student activity bell** to `StudentTopBar` that opens the existing `SocialActivity` list, generalised as "Activity" with a type → deep-link map | ~5 functions + `StudentTopBar.jsx`, `StudentLayout.jsx`, `SocialActivity.jsx` | **1 small migration:** add `social_notifications` to the Realtime publication; optional `link_path text` column |
| **S3. Web Push for the same events** | Push carries the same type and target; tapping it opens the deep link | see §2A-4 | 1 (`push_subscriptions`) |

S1 alone fixes "the student doesn't know their order was accepted" **while the app is open**. S2 gives order updates their own unread state and a single inbox. S3 covers the closed app. I don't recommend a separate "Order updates" dashboard section: Order History already lists the orders, and S1 + S2 make changes discoverable without a third surface.

## 2A-4. Cross-cutting standards

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Every notification has type, payload, target, timestamp, read state** | ⚠️ | Merchant table: type, timestamp and read exist, but **no target**. Only `deal_id`, no `order_id` or link (`20260903193712:2-12`). Social table: has `reference_id` (target) and `actor_id` | Merchant notifications can't point to the order they're about | Migration: add `order_id uuid` and `link_path text` to `notifications`, and backfill-free going forward | 🟡 |
| **Clicking deep-links to the screen** | ❌ | Bell click only marks read (`NotificationBell.jsx:203`); social items have no link (`SocialActivity.jsx:277-300`). Chat order messages do deep-link through `link_path` (`update-order-status/index.ts:291`; dev history 2026-09-27) ✅ | Users must hunt for the related order, request or dispute | Map type → route: order → `/dashboard/orders` (merchant) or Order History (student); request → Social profile; dispute → `/dashboard/disputes` | 🟡 |
| **Dismiss / clear** | ⚠️ | Mark-read exists; no delete or clear. RLS has no DELETE policy on either table | The list grows forever; the bell loads only 20 (`NotificationBell.jsx:104-105`) | "Clear all read" (DELETE own read rows), plus a retention job (e.g. delete read rows older than 90 days) | 🟢 |
| **Consistent unread counts** | ❌ | Bell count is computed **from the latest 20 rows only** (`NotificationBell.jsx:101-112`), so it undercounts above 20. Bell caps at `9+` (`:169`) while tab badges cap at `99+` (`Dashboard.jsx:267`; `StudentTopBar.jsx:45`). Group chats are excluded (above). Page title never shows a count (`main.jsx:65`) | Counts disagree across surfaces | Use `select count(*) … head:true` like `StudentLayout.jsx:64-68`; one cap rule (`99+`) everywhere; optional `(3) Unipicks` title prefix (common practice) | 🟡 |
| **Accessible badges** | ⚠️ | Chat badge: `aria-label="Messages, N unread"` ✅ (`StudentTopBar.jsx:30-33`). Bell: static `aria-label="Notifications"` (`NotificationBell.jsx:164`), so the count isn't announced. New items aren't announced (WCAG 2.1 §4.1.3) | Screen-reader users don't hear the unread count or new arrivals | `aria-label={\`Notifications, ${n} unread\`}` (§4.1.2). A visually hidden `role="status"` live region announcing "New order from Aline" (§4.1.3) | 🟡 |
| **Deliverability when the app is closed** | ❌ | No push, email or SMS | Time-critical flows (5-minute accept, 5-minute pay) fail silently | **Web Push** via the existing service worker. Store `push_subscriptions(user_id, endpoint, keys)` and send from Edge Functions with VAPID keys. **Caveat:** on iPhone, web push works only after the student adds Unipicks to the Home Screen (iOS 16.4+), so the onboarding needs an "Add to Home Screen" prompt. **Email (Resend)** for receipts and dispute outcomes once Supabase email confirmation is on. **SMS** post-MVP for the merchant new-order window | 🔴 |
| **Admin notifications** | ❌ | Admins have no inbox and no badges | Disputes can sit unseen (compliance) | Admin rows in `social_notifications` (generic per-user inbox) for `dispute_raised`, plus a Disputes tab badge and an email to admins via Resend | 🔴 |

## 2A-5. Decision: the fake "Notifications" settings rows

**Recommendation: remove them now, then rebuild them as real toggles in the same change that ships Web Push.**
- Toggles only mean something once there's a channel to control. Today everything is in-app, and the in-app list itself shouldn't be mutable.
- Two of the five categories (Deals, Events) correspond to no notification that exists. Events isn't a feature.
- Showing controls that do nothing is worse than showing none: it erodes trust and fails ISO 9241-11 *effectiveness* (users can't achieve their goal).
- When push ships, add `notification_preferences(user_id, category, push boolean, email boolean)` with real categories:
  - Messages
  - Friend & message requests
  - Group activity
  - Disputes & account
  - Order & payment updates, shown as **always on**: transactional messages are commonly exempt from opt-out (common practice; Uber/Amazon don't let you mute order status).
- Also add Android-style quiet hours later (common practice; Android notification channels give users per-category control at the OS level anyway).

---

## Top 10 prioritized actions

| # | Action | Why | Files | Migration | MVP? |
|---|---|---|---|---|---|
| 1 | **`payment-webhook` sends the pickup-code message** (shared helper with `process-payment`) | On the async MoMo path the student never gets their code | 2 | no | 🔴 blocking |
| 2 | **Student "needs action" badge (S1)** from order state on Profile and Order History | Students miss "accepted, pay in 5 min" buried in chat | 3 | no | 🔴 blocking |
| 3 | **Admin dispute alerts:** Disputes tab badge + inbox rows on raise; merchant and student notified on raise and resolve | Compliance; disputes go unseen | 3–4 | 1 (RPC update) | 🔴 blocking |
| 4 | **Expiry and payment-failure notices** from `expire-orders` / `process-payment` | Students and merchants never learn an order lapsed or failed | 2 | no | 🔴 blocking |
| 5 | **Mirror order events into `social_notifications` + student activity bell (S2)** with deep links | Order updates get their own unread state and one inbox | ~8 | 1 (realtime + `link_path`) | 🔴 blocking |
| 6 | **Web Push** (service worker, `push_subscriptions`, VAPID sender) for merchant new order, student accepted/paid/failed, disputes; plus an iOS Add-to-Home-Screen prompt | Closed app = missed 5-minute windows | ~6 | 1 | 🔴 blocking for launch |
| 7 | **Fix counts:** bell counts with `count()`, one `99+` cap, accessible bell label + live region (WCAG §4.1.2/§4.1.3) | Inconsistent and inaccessible counts | 2–3 | no | 🟡 |
| 8 | **De-duplicate merchant payment notifications** (one "Paid" event, human-readable) and add `order_id`/`link_path` to `notifications` with deep links | 2–3 confusing entries per order | 3 | 1 | 🟡 |
| 9 | **Remove fake preference rows** (now); real preferences with Web Push | Misleading UI | 1 now | later | 🟡 |
| 10 | **Group activity + group chat unread** (host notified on join/minimum reached; per-member read pointer) | The `7c5fb93` minimum makes "group is full" a key moment | ~5 | 1 | 🟡 |

**Should-add (email):** turn on Supabase email confirmation, then Resend for receipts on `paid`, dispute outcomes and admin dispute alerts.
**Post-MVP:** SMS fallback for the merchant new-order window (after UmunotaPay is proven); `ready` status; mentions; review-received notices; quiet hours; batching beyond groups.

---

## Open questions
1. **Admin recipients:** should dispute alerts go to every user with `role = 'admin'`, or to a dedicated support inbox/email address?
2. **iPhone share:** roughly what share of Kepler students use iPhones? It decides how much effort goes into the Add-to-Home-Screen prompt that web push needs on iOS.
3. **Renaming `social_notifications`:** it's fine to keep the table name and just broaden its use. Do you want it renamed to `user_notifications` later for clarity? That's a migration plus 2 files.
