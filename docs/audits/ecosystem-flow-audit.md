# Unipicks — Ecosystem Flow Audit (Project 2)

**Date:** 2026-10-03 · **Branch:** `claude/unipicks-codebase-audit-9vd6fb` (code read at `120dadb`)
**Scope:** every journey end to end, across the app (React on Vercel), the database (Supabase Postgres + RLS), the Edge Functions, UmunotaPay and the cron jobs.
**Method:** read-only. Each step is marked ✅ works · ⚠️ works with a gap or unverified · ❌ broken or missing, with `file:line` evidence. Anything not provable from code or founder-reported facts is marked **(inference)**.

**Production state used for this audit (founder, 2026-10-03):**
- All migrations up to `20261003260000` applied; Edge Functions `payment-webhook` (incl. `f4ae10f`), `process-payment`, `create-order`, `create-group-order-payment`, `delete-my-account`, `expire-orders` (incl. `ca6ec46`), `reconcile-payments` deployed.
- Frontend live with N2, N3a, N3b, P2, B2a, B2b. **Not deployed:** `10fc197` (`/delete-account?deleted=1` confirmation view).
- Cron: `expire-orders` every 60 s on cron-job.org, green (200). `reconcile-payments`: **deployed, disabled** (`RECONCILE_ENABLED` unset), **no cron job**.
- Money: the 23 production transactions are all the founder's own **test payments on the UmunotaPay testing dashboard** (see `umunotapay-api-research.md` §4). "Verified" below therefore means **verified with test money in production infrastructure**.
- Supabase **email confirmation is off** in production (founder). The repo's local `supabase/config.toml:225` also has `enable_confirmations = false`.

Earlier audits are referenced, not repeated: e-commerce (`ecommerce-audit.md`), social (`social-audit.md`), notifications (`notifications-audit.md`), profile (`profile-audit.md`), deletion (`p3-delete-account-plan.md`), UmunotaPay (`umunotapay-api-research.md`).

---

## Status update — fixes applied after this audit (2026-10-03)

All fixes below are **committed on the branch, not yet deployed** (deploy checklist: `docs/03-session-2026-10-03.md` §4).

| Finding | Fix | Commit |
|---|---|---|
| U1 — unverified emails get a Verified identity and student prices; merchant signup breaks with email confirmation | Only verified students can order; merchant profile created by the database at signup. Founder must then turn on email confirmation | `0906bda` |
| U2 — chat RLS holes | Direct messages only between friends / accepted requests; student → approved merchant; merchant → student who ordered or wrote first; receivers can only mark read | `167acc6` |
| U3 — late payment kept but order expired | The 5 minutes limit starting the payment; a confirmed payment always makes the order paid; a failure after the window expires the order | `c94aea5` |
| J3/J4 — static checkout page | Live status on the payment page (Realtime + polling) | `30cccbb` |
| J6 — merchants/admins never see dispute alerts | Dashboard bell merges `user_notifications`; admins get the bell | `8e3bb6c` |
| J2/J8 — bans and deactivation don't stop merchants | Deals hidden unless the merchant is in good standing; banned merchants can't write deals, accept orders or redeem codes | `5ed6057` |
| J5 — groups never end; dead groups stuck; members not told; expired deals | 24-hour groups, reopen on decline/expiry, member notifications, expired deals refused | `96bea38` |
| J7 — no report flow | Report button (chat, profiles) + admin Reports queue with 24 h alerts | `c857b05` |
| J7 — Social missing on mobile | Mobile nav Home · Search · Social · Profile · Camera | `00e17ea` |

**Still open:** merchant payouts and recorded refunds (J9), webhook signature/callback confirmation and enabling the reconciler (J4, blocked on UmunotaPay), support inbox, end-to-end tests with test money (§4).

---

## ⚠️ Urgent flags (read first)

| # | Flag | Why it is urgent | Evidence |
|---|---|---|---|
| U1 | **Anyone can get a "Verified Kepler College" identity and student prices without owning a Kepler email.** | The `@keplercollege.ac.rw` check is only in the browser. The server accepts any email for a student signup, and with email confirmation off nobody proves they own the address. P1 then stamps the account "Kepler College / Verified" from the typed email. `create-order` never checks the role or verified university, so any signed-in account gets student pricing. | Client-only check `src/pages/Register.jsx:39-45`; role from user-supplied metadata `20260914000000_create_trusted_user_roles.sql:64-71`; university derived from the (unconfirmed) email `20261003190000_server_owned_verified_identity.sql:20-28,48`; no role/verification check in `supabase/functions/create-order/index.ts` (only auth and ban, `:102-130`) |
| U2 | **Chat abuse holes from the social audit are still live in production.** | Anyone can message anyone (blocks and message requests bypassable by direct API call), and receivers can edit the text of messages they received, including the merchant's "accepted / pickup code" messages used as dispute evidence. Decided as social D2/D3, not built. | Insert policy is sender-only `20260831070000_add_chat_messages.sql:13-16`; receiver update policy `:18-22`; no later chat policy migration except group chat (`20260909223046`) |
| U3 | **A payment that succeeds after the 5-minute window is kept, but the order is expired, and there is no refund path.** | The student is charged and gets nothing. Both the synchronous path and the webhook do this. Today only test money is involved; it must be settled before real money. | `process-payment/index.ts:1203-1250` (late success → transaction `failed`, order `payment_expired`); `payment-webhook/index.ts:432-460` (same); no refund code anywhere (grep for `refund`/`payout`/`transfers` in `supabase/functions` and `src`: only labels, `StatusBadge.jsx:17`, `OrdersTab.jsx:18`) |

---

## 1. Journey maps

Legend inside maps: `[UI]` app screen · `[DB]` table/RPC/trigger · `[EF]` Edge Function · `[UP]` UmunotaPay · `[CRON]` cron-job.org.

### J1 — Student signup
```
[UI] Register.jsx ── client checks domain (39-45) ──▶ supabase.auth.signUp (70)
      │                                                   │
      │                                     [DB] auth.users INSERT
      │                                       ├─ trigger assign_initial_user_role → user_roles (role from metadata, 64-71)
      │                                       └─ trigger set_verified_identity → app_metadata.university (P1, from email domain)
      ▼
 session returned immediately (confirmation OFF) → /dashboard/deals (Register.jsx:82-87)
 (no proof of email ownership at any point)
```

### J2 — Merchant signup and approval
```
[UI] RegisterMerchant.jsx signUp (64) ──▶ client INSERT merchant_profiles {approved:false} (78-83, error ignored)
      ▼
[UI] Admin → Approvals: UPDATE merchant_profiles.approved = true (AdminApprovals.jsx:31) + log_admin_action (32)
      ▼
 (nothing is sent to the merchant) ── merchant only finds out by retrying a deal create
```

### J3 — Normal order (happy path)
```
[UI] OrderConfirmation ─▶ [EF] create-order ─▶ [DB] orders: pending_confirmation, confirmation_deadline = +5 min (188-214)
      │                                     └▶ [DB] notifications (merchant bell) (230-240)
      ▼  navigate /payment?order_id (OrderConfirmation.jsx:138)  ← student lands on Pay page BEFORE the merchant answers
[UI] PaymentCheckout: loads order once, no live update (20-62); Pay button disabled unless confirmed (227)
                                   │
[UI] MerchantOrders (realtime on orders, 114-128) ─▶ [EF] update-order-status accept
      └▶ [DB] orders: confirmed, payment_deadline = +5 min (192-219)
      └▶ [DB] chat_messages "accepted" + link /payment?order_id (284-292) ── student sees it in Messages / needs-action badge (StudentLayout.jsx:116-168)
                                   │
[UI] PaymentCheckout (after manual reload) ─▶ [EF] process-payment
      ├▶ orders: payment_processing (976-990), transactions: processing (1024-1035)
      ├▶ [UP] POST /api/v1/payments {amount, phone, description, merchant_reference} (189-194)
      └▶ result:
          paid       → orders: paid (1266) + pickup code chat message
          failed     → orders: confirmed (1338)       ── UI shows nothing (only "paid" is rendered, PaymentCheckout.jsx:174)
          processing → stays payment_processing       ── UI shows nothing; waits for [UP] webhook → [EF] payment-webhook
                                   │
[UI] Merchant VerifyCode ─▶ [DB] RPC redeem_pickup_code: redemption + order → redeemed in one transaction (VerifyCode.jsx:16; RPC :71-81)
      ▼
[UI] OrdersTab rating prompt (redemption.status = 'redeemed' policy, ratings migration :20-31)
```

### J4 — Failure / missed steps
```
merchant silent ─▶ [CRON] expire-orders (60 s) rule 1 → confirmation_expired (expire-orders:40-43,78)      no notice to student
student never pays ─▶ [CRON] expire-orders rule 2 → payment_expired (ca6ec46)                            no notice to student
[UP] says failed (webhook) ─▶ payment-webhook: transaction failed, order → confirmed (412-422)            no notice to student
webhook never arrives ─▶ order stays payment_processing FOREVER
      └ reconcile-payments would fix it, but is DISABLED and blocked on the UmunotaPay status endpoint
merchant declines ─▶ only possible from pending_confirmation (update-order-status:210-218 guard) → declined + chat reason
      └ a PAID order cannot be declined or cancelled by anyone; no refund path
```

### J5 — Group order
```
host creates group (RPC create_group_order_with_host) → members join (group_order_members)
host "View & Pay" ─▶ [EF] create-group-order-payment
      ├ checks: host only (77), group open (81), not already submitted (89-99), deal active (139-143), min_participants (148-160)
      ├ prices with discount_percent only (169-171) — no expires_at check (field read at 128, never used)
      ├ INSERT one orders row {group_order_id, total for all members, pending_confirmation} (187-200)
      ├ group_orders.status = closed (214-216)
      └ merchant notification "Group order from …" (220-231)
      ▼ navigate /payment (GroupOrders.jsx:349-355) → J3 from "merchant accepts", HOST pays the whole amount
pickup code → chat to the host only (order.student_id = host)
```

### J6 — Dispute
```
[UI] OrdersTab → RaiseDisputeModal → [DB] RPC raise_order_dispute (allowed: confirmed, paid, redeemed, completed, declined — 20260927160000:97)
      ▼ trigger notify_dispute_change (N3b)
         ├ user_notifications for every admin + the merchant (20261003210000:124-142)
         └ admin Disputes badge via realtime on orders (Dashboard.jsx:194-230, N3a)
[UI] AdminDisputes → RPC resolve_order_dispute (under_review/resolved/rejected)
      ▼ trigger → user_notifications for student + merchant (20261003210000:156-168)
student sees it: StudentLayout badge (172-210) + SocialActivity + Profile → Order History
merchant sees it: NOT in any merchant screen except the order card text (see J6 table)
```

### J7 — Social
```
friend request / accept → RPCs → user_notifications (student) → SocialActivity (Social page; desktop nav only)
message request → RPC; direct chat → chat_messages (sender-only RLS) → ChatThread realtime
block → block_student RPC (hides search only)     report → student_reports table exists, NO UI, NO admin queue
stories → merchant stories live; student stories v2 (decision D3)
```

### J8 — Account lifecycle
```
admin ban → RPC admin_ban_user: app_metadata.banned = true (20261003200000:123-127)
      └ login still works; reads work; some writes blocked (triggers + create-order/create-group-order-payment checks)
delete → [UI] DeleteAccountDialog → [EF] delete-my-account (password re-check) → [DB] tombstone_user (one transaction) → storage cleanup
re-signup same email → new auth user → P1 trigger gives a fresh verified identity (tested locally)
```

### J9 — Money
```
student MoMo/Airtel ─▶ [UP] collect into the wallet linked to Unipicks' API key
                       (POST /api/v1/payments: "Collect MoMo/Airtel into the API-key wallet", OpenAPI S6)
                       request carries NO destination / merchant code / product_id (process-payment:189-194)
      ▼
Unipicks' UmunotaPay wallet  ──── ??? ────▶ merchant
                                (no payout code; merchant's momo_pay_code is stored, MerchantProfile.jsx:72, never read by any function)
refund ─▶ none in code (manual MoMo transfer by an admin, per founder; no record)
```

---

## 2. Status table per journey

### J1 — Student signup

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Domain restricted to `@keplercollege.ac.rw` | ⚠️ | Browser only (`Register.jsx:39-45`). A direct `auth.signUp` with any email and `role: student` creates a student (`20260914000000:64-71`). |
| Email ownership proven | ❌ | Confirmation is off (founder; `config.toml:225` locally). The app even skips the "check your email" screen when a session comes back (`Register.jsx:82-87`). |
| Verified identity (P1) | ⚠️ | Server-owned ✅ (`20261003190000`), but derived from an **unconfirmed** email, so "Verified" is only as strong as the typed address. See urgent flag U1. |
| Student-only pricing | ❌ | `create-order` does not check the caller's role or verified university; merchants, admins and non-Kepler emails can order at student prices (`create-order/index.ts:102-130`, inference from absence of any role read in the file). |
| Cross-layer coupling | ⚠️ | Turning on email confirmation (the fix for U1) **breaks merchant signup** — see J2 row 1. |

### J2 — Merchant signup and approval

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Profile row created | ⚠️ | Client inserts `merchant_profiles` right after `signUp`, **error ignored** (`RegisterMerchant.jsx:78-83`). The insert needs a session (`20260830142031:16-18`, `to authenticated`). Works today only because confirmation is off; with confirmation on, no session → silent failure → the merchant never appears in Approvals. |
| Admin sees enough to approve | ⚠️ | Known (e-commerce §5). |
| Merchant told when approved | ❌ | Approve = one UPDATE + activity log (`AdminApprovals.jsx:31-32`); no notification, chat or email. No "under review" screen (e-commerce §5). Merchant must keep retrying. |
| Deactivate stops the merchant | ❌ | `approved=false` (`AdminApprovals.jsx:52`) only blocks deal writes (`20260914003000:23-65`). Existing deals stay visible (`remote_schema.sql:20-28`, `active = true` only) and orderable (`create-order` checks `deal.active`/`expires_at`, `:163-175`, not the merchant). |
| Reject | ⚠️ | Hard-deletes the profile (`AdminApprovals.jsx:40-41`); the auth user keeps role `merchant` with no profile (inference: nothing re-creates it). |

### J3 — Normal order

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Order created, priced server-side | ✅ | `create-order` (`88158ea` pricing); merchant bell row `:230-240`. Verified with test money. |
| Student sees "waiting for merchant" | ❌ | After ordering the student is sent to `/payment` (`OrderConfirmation.jsx:138`) where the order is still `pending_confirmation`. The page loads once (`PaymentCheckout.jsx:20-62`), says "Complete payment for your confirmed order" (`:140-142`) and shows a disabled Pay button (`:227`). No "waiting", no countdown, no live update. **If the merchant never responds, the student sees a dead page forever**; the order silently becomes `confirmation_expired` (J4). |
| Merchant sees new order live | ✅ | Realtime on `orders` (`MerchantOrders.jsx:114-128`; table in publication `20260915090000`), pending badge (`Dashboard.jsx:91-130`), bell. Only while the dashboard is open (no push; notifications audit #6). |
| Merchant accepts → student told | ⚠️ | Chat message with Pay link (`update-order-status:284-292`) + needs-action badge (`StudentLayout.jsx:116-168`). The open checkout page does **not** update; the student must reload or tap the chat link. 5-minute window starts at acceptance. |
| Payment started | ✅ | `process-payment` → UmunotaPay collect. Verified with test money (17 synchronous `success` results). |
| Result shown to student | ❌ for failed/processing | Only `paid` is rendered (`PaymentCheckout.jsx:174-188`). `failed` and `processing` show the same form again with no message; `result.message` is never displayed. Error bodies are shown raw (`lib/payment.js:23-25`, "Payment request failed (409): {json}"). |
| Async result reaches the order | ⚠️ | Depends on the webhook (J4). The checkout page never polls or subscribes, so a webhook-confirmed payment is invisible until the student opens Messages (pickup code) or reloads. |
| Pickup code delivered | ✅ sync · ⚠️ async | Sync path ✅. Webhook path sends it (N1, `payment-webhook` + `_shared/pickup-code-message.ts`), but no successful webhook delivery is evidenced in production (§4). |
| Merchant verifies code → `redeemed` | ✅ | One-transaction RPC (`20261003170000:64-81`; `VerifyCode.jsx:16`). 18 local checks. Production use not reported. |
| `completed` | ❌ | No code sets `orders.status = 'completed'` (grep: only read in `OrdersTab.jsx:390-398`). |
| Rating | ✅ | Allowed once the redemption is `redeemed` (ratings migration `:20-31`). Group members cannot rate (redemption belongs to the host). |

### J4 — Failure / missed steps

| Case | Status | Evidence / cross-layer note |
|---|---|---|
| Merchant doesn't respond | ✅ server · ❌ student | `expire-orders` rule 1 every 60 s (cron green) + lazy check in `update-order-status:167-187`. **No message to the student** (`expire-orders/index.ts` writes only `orders`). |
| Student doesn't pay | ✅ server · ❌ student | Rule 2 (`ca6ec46`, deployed) + lazy check `process-payment:620-640`. No message to student or merchant. |
| Payment fails (sync) | ⚠️ | Order back to `confirmed` (`process-payment:1334-1350`); student can retry within the window, but the UI shows no failure (J3). |
| Payment fails (webhook) | ⚠️ | Order back to `confirmed` (`payment-webhook:412-422`). The order update has no status guard in the UPDATE itself (check-then-set, `:414-421`). No student message. |
| Webhook never arrives | ❌ | Order stays `payment_processing` forever: `expire-orders` ignores it (by design, `expire-orders/index.ts` rules), and **`reconcile-payments` is disabled** ⚠️ *blocked on UmunotaPay endpoint discovery*. Knock-on effects: the student **cannot raise a dispute** (`payment_processing` not allowed, `20260927160000:97`) and **cannot delete the account** (active-order pre-check, `20261003220000:126-133`). |
| Webhook arrives but is rejected | ⚠️ (inference) | Our webhook only accepts `X-Webhook-Signature` / `X-Umunota-Signature` with an HMAC of the body or the shared secret (`payment-webhook/index.ts:57-70,217-223`). UmunotaPay's callback signing is undocumented (research U5). Their API signs with `X-Signature` over method/path/body/timestamp/nonce (research §2). If callbacks use that scheme, **every real webhook gets 401**. |
| Callback URL registered | ❓ unknown | `process-payment` sends no callback URL (`:189-194`), so it must be configured in the UmunotaPay dashboard. Not verified. UmunotaPay exposes delivery attempts (`GET /auth/payment-webhook-deliveries`, research §2). |
| Payment succeeds late | ❌ | See urgent flag U3. Note the **reconciler accepts** late payments while the webhook and `process-payment` **reject** them: the outcome depends on which path reports first. |
| Merchant declines | ✅ unpaid · ❌ paid | Decline only from `pending_confirmation` (`update-order-status:210-218`), with a reason chat message (`:245`). A paid order can't be declined, cancelled or refunded by anyone. |

### J5 — Group order

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Create / join | ⚠️ | Works locally; groups have **no deadline** and stay open forever (dev history "Known issues"). |
| Minimum not met | ✅ | 409 "needs N more member(s)" (`create-group-order-payment:148-160`, `7c5fb93`). Group stays open. |
| Expired deal | ❌ | `expires_at` selected (`:128`) but never checked (only `active`, `:139-143`). Already noted in e-commerce status. |
| Merchant sees one combined order | ✅ | Single `orders` row with `group_order_id`, total quantity and price (`:187-200`) + bell row with member count (`:220-231`). |
| Host pays | ⚠️ | Same J3 payment path, host pays the full total. **Never tested end to end** (dev history). |
| Order dies (declined / expired / payment expired) | ❌ | The group was closed at submission (`:214-216`); the duplicate guard rejects any existing order **regardless of its status** (`:89-99`). The group is **stuck forever**: it can't be reopened or resubmitted. Members aren't told. |
| Members informed | ❌ | No notification when the host submits, pays, or the order fails (inference: no insert targeting members in the function). Pickup code goes to the host only. |

### J6 — Dispute

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Student raises | ✅ | RPC + modal; allowed states `20260927160000:97`. Banned users blocked (`20261003200000:304-306`). |
| Admin alerted | ✅ | Disputes badge via realtime (`Dashboard.jsx:194-230`, N3a). The `user_notifications` rows written for admins (`20261003210000:124-132`) are **never displayed**: no admin screen reads `user_notifications` (grep: only `ProfileTab`, `SocialActivity`, `StudentLayout`). |
| Merchant alerted | ❌ | N3b writes a `user_notifications` row for the merchant (`20261003210000:134-142,156-168`), but merchants only read `notifications` (`NotificationBell.jsx:101-135`, shown for merchants at `Dashboard.jsx:403`) and have no Social page. The merchant only sees dispute text on the order card if they open Orders (`MerchantOrders.jsx:312-324`). |
| Admin resolves | ✅ | RPC `resolve_order_dispute`; no money outcome (e-commerce §3). |
| Student told | ✅ | `user_notifications` → badge (`StudentLayout.jsx:172-210`) + SocialActivity. |
| Blocks account deletion | ✅ | `open`/`under_review` block deletion (`20261003220000:135-142`); tested locally. |
| Stuck payment can be disputed | ❌ | `payment_processing` not disputable (see J4). |

### J7 — Social

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Social reachable on mobile | ❌ | Mobile nav has Home, Search, Group Orders, Profile (`StudentBottomNav.jsx:13-28`); decision D1 not built. Friend/dispute notifications in SocialActivity are mobile-unreachable except via Profile. |
| Friend requests | ✅ | RPCs + `user_notifications` (social audit §2). |
| Messages | ⚠️ | Works; RLS holes (urgent flag U2). Deleted accounts handled (B2b). |
| Blocks | ⚠️ | Hide search only; not enforced on chat (U2). |
| Reports → where do they go? | ❌ | Nowhere: `student_reports` exists, but no UI files a report and no admin queue reads it (grep `student_reports` in `src`: none). The 24-hour SLA (decision D5) can't be met. |
| Unread badges | ⚠️ | 1:1 chat unread live (`StudentLayout.jsx:60-106`); group chat unread missing (notifications audit #10). |

### J8 — Account lifecycle

| Step | Status | Evidence / cross-layer note |
|---|---|---|
| Ban locks the user out | ⚠️ | Sets `app_metadata.banned` only (`20261003200000:123-127`); no session revocation, no `banned_until`, so **login and reading still work**; the user sees no "suspended" screen until a write fails. |
| Ban stops a student | ✅ mostly | Triggers on chat, requests, stories, groups, dispute raise (`20261003200000:275-318`) + `create-order`/`create-group-order-payment` checks. `process-payment` has no ban check (grep). |
| Ban stops a merchant | ❌ | No ban check in `update-order-status`, deal writes (`deals` has no ban trigger), or `redeem_pickup_code` (grep `banned`/`is_banned`: none). A banned merchant keeps accepting orders and selling. Deactivation doesn't hide their deals either (J2). |
| Delete account | ⚠️ | B1/B2 deployed. First production attempt failed (42703) and was fixed (`20261003240000`); **a successful production re-test has not been reported to me**. Fully tested locally (80 checks). |
| Re-signup, same email | ⚠️ | Works and gets a fresh verified identity (local test). Same U1 weakness: identity comes from an unconfirmed email. |

### J9 — Money

| Question | Answer | Evidence |
|---|---|---|
| Where does the student's money go? | Into the UmunotaPay wallet linked to **Unipicks' API key** | Collect request has only `amount, phone, description, merchant_reference` (`process-payment/index.ts:189-194`); OpenAPI: "Collect MoMo/Airtel into the API-key wallet" (research S6) |
| Routed to the merchant's code? | ❌ No | No `destination`, `product_id`, `merchant_code` or payee in any function (grep). `momo_pay_code` is stored (`MerchantProfile.jsx:72`) but never read server-side. This contradicts the founder's "merchant-directed payouts" decision (e-commerce decisions). UmunotaPay supports `product_id` splits and `POST /api/v1/transfers` (research §2), unused. |
| Merchant payout | ❌ None | No code path. |
| Merchant sees settlement timing | ❌ | Nothing in any merchant screen mentions payouts or settlement (grep `settle`/`payout` in `src`: none). |
| Refunds | ❌ Manual only, unrecorded | Label only (`StatusBadge.jsx:17`); nothing sets `refunded`. |
| Fees | ⚠️ (inference) | UmunotaPay's payload has `service_fee`, `umunotapay_fee`, `itecpay_fee`, `total_to_pay` (2575 vs 2500 in samples): the student may be charged more than the order total. Nothing in the UI shows fees. |

---

## 3. Order state transition map

```
                       create-order / create-group-order-payment
                                        │
                                        ▼
                             ┌──────────────────────┐   merchant declines (update-order-status:210)
                             │ pending_confirmation │──────────────────────────────▶ declined
                             └──────────────────────┘
               merchant accepts │            │ deadline passed
         (update-order-status:210)           │ (expire-orders rule 1, :78; lazy update-order-status:171)
                                ▼            ▼
                        ┌───────────┐   confirmation_expired
          ┌────────────▶│ confirmed │───────────────────────────────▶ payment_expired
          │             └───────────┘  deadline passed (expire-orders rule 2; lazy process-payment:628)
          │   student pays  │    ▲ webhook "paid" also allowed from confirmed (payment-webhook:486-490)
          │ (process-payment:976)
          │                 ▼
          │      ┌────────────────────┐  paid after deadline (process-payment:1233; webhook:442)
 failed / │      │ payment_processing │───────────────────────────────▶ payment_expired  (money kept, U3)
 API error│      └────────────────────┘  pending > 24h (reconciler, disabled)
 (pp:1088,│                 │
  1338;   │                 │ paid: process-payment:1266 ✅ · payment-webhook:486 ⚠️ · reconcile-payments:242 ⚠️ disabled
  webhook │                 ▼
  :418;   │             ┌──────┐   merchant verifies code (redeem_pickup_code RPC :78-81)   ┌──────────┐
  reconc. │             │ paid │──────────────────────────────────────────────────────────▶│ redeemed │──▶ completed ❌ (nothing sets it)
  :287)   │             └──────┘                                                            └──────────┘
          └──────────────── (back to confirmed)       paid ──▶ refunded ❌ (no code path)      any ──▶ cancelled ❌ (no code path)
```

| From → To | Fired by | Tested | Reachable in production today |
|---|---|---|---|
| — → `pending_confirmation` | `create-order:213`; `create-group-order-payment:197` | Deno (pricing parity, group minimum) | ✅ normal (test money) · ⚠️ group never run |
| `pending_confirmation` → `confirmed` | `update-order-status:192-219` (accept) | Not covered by repo tests | ✅ (test orders reached `paid`, so accept ran) |
| `pending_confirmation` → `declined` | `update-order-status:210` (decline + reason) | Not covered | ⚠️ not reported |
| `pending_confirmation` → `confirmation_expired` | `expire-orders` rule 1 (`:40-43,78`), every 60 s; lazy `update-order-status:167-187` | Deno (7 tests) | ✅ cron green |
| `confirmed` → `payment_processing` | `process-payment:976-990` | Not covered | ✅ (test money) |
| `confirmed` → `payment_expired` | `expire-orders` rule 2 (`ca6ec46`); lazy `process-payment:620-640`; one-off `20261003250000` | Deno (rule 2, idempotency) | ✅ deployed |
| `payment_processing` → `paid` | `process-payment:1255-1280` (sync) | Not covered | ✅ 17 test payments |
| ″ | `payment-webhook:484-490` | Deno (production column shape, `f4ae10f`) | ⚠️ **webhook works in tests; no successful production delivery evidenced** |
| ″ | `reconcile-payments:240-247` | Deno (12 tests) | ⚠️ **reconciler fallback exists but DISABLED — blocked on UmunotaPay endpoint discovery** |
| `confirmed` → `paid` | `payment-webhook:486-490` (`in confirmed, payment_processing`) | Deno | ⚠️ as above |
| `payment_processing` → `confirmed` | `process-payment:1088` (API error), `:1338` (failed); `payment-webhook:418` (failed); `reconcile-payments:287` | Deno (webhook, reconciler) | ✅ sync · ⚠️ webhook · ⚠️ reconciler disabled |
| `payment_processing` → `payment_expired` | late success `process-payment:1233`, `payment-webhook:442`; abandoned 24 h `reconcile-payments:327` | Deno (reconciler) | ⚠️ reachable; money kept (U3) |
| `paid` → `redeemed` | RPC `redeem_pickup_code` (`20261003170000:78-81`) | 18 local SQL checks | ⚠️ deployed; use not reported |
| `redeemed` → `completed` | — | — | ❌ unreachable |
| `paid` → `refunded` | — | — | ❌ unreachable (manual refunds leave no record) |
| any → `cancelled` | — | — | ❌ unreachable (no cancel action for student or merchant) |
| `payment_processing` (stuck) → anything | only the disabled reconciler | — | ❌ today: stuck forever |

Dispute status is a separate dimension (`dispute_status`: `open → under_review → resolved/rejected`), driven by `raise_order_dispute` / `resolve_order_dispute` with N3b notifications; it never changes `orders.status` or money.

---

## 4. Verified vs untested

Labels: ✅ **verified with test money in production infrastructure** · ⚠️ **tested locally** (repo tests) but not exercised in production, or deployed with unknown production result · ❌ **never tested**.

| Critical path | Confidence | Basis |
|---|---|---|
| Student signup + P1 verified identity | ⚠️ | 21 local SQL checks (`verified_identity.test.sh`); signup itself used in production by the founder |
| Merchant signup → approval | ⚠️ | No repo tests; used in production (merchants exist), approval notification absent |
| Order create → accept → sync pay → `paid` | ✅ | 17 `success`/`paid` test transactions (founder SQL, 2026-10-03) |
| Pickup code delivery (sync) | ✅ (reported) | Founder reported N1 deployed and verified; code via shared helper |
| Webhook (`f4ae10f`) | ⚠️ | 4 Deno regression tests on production column shape; no evidence of any successful real callback (until `f4ae10f` the deployed webhook selected a column production doesn't have, so any callback before it would have failed with 42703; the 6 stuck test payments of 11–12 Sept never received one) |
| `expire-orders` (both rules) | ✅ | Cron green every 60 s; 7 Deno tests; `20261003250000` applied |
| `redeem_pickup_code` → `redeemed` | ⚠️ | 18 local checks; production use not reported |
| Reconciler | ⚠️ | 12 Deno tests; disabled; endpoint/status words unconfirmed |
| Async payment end to end (USSD later, webhook) | ❌ | Never run with a callback that succeeded |
| Group order payment | ❌ | Never run (dev history) |
| Group order dead-order recovery | ❌ | No code path |
| Disputes + N3b notifications | ⚠️ | 25 local checks (`user_notifications_disputes.test.sh`) |
| Bans | ⚠️ | 28 local checks + Deno; merchant actions not covered (J8) |
| Delete account (B1/B2) | ⚠️ | 80 local checks + 13 Deno; first production run failed, fix deployed, re-test not reported |
| Refunds / payouts | ❌ | No code |
| Reports / moderation | ❌ | No UI |

---

## 5. Known gaps and fragile places

### C. Known-but-flagged gaps (from today)

| Gap | Effect | Evidence |
|---|---|---|
| **Reconciler deployed but disabled** | Any async payment whose webhook is lost (or rejected, J4) stays `payment_processing` forever; student can't dispute or delete their account | `reconcile-payments` (`bd42d72`); research doc §5 (`RECONCILE_ENABLED=false`); no cron job |
| **UmunotaPay status endpoint not confirmed** | Reconciler can't be enabled safely; status words and reference unconfirmed | Research doc §4 U1–U4 (`GET /api/v1/payments/{reference}/status` found, response shape unknown) |
| **`support@unipicks.app` does not exist** | The public deletion page's "Can't sign in?" route (Google Play requirement) leads nowhere | `src/pages/DeleteAccount.jsx:8` (constant), `:78` (mailto link) |
| **`10fc197` not deployed** | After deleting an account the user sees the confirmation banner on top of the "how to delete" page | founder; `DeleteAccount.jsx` |
| **AI deal generator** | Gemini 403; fallback is a regex parser | dev history "Known issues" |
| **Merchant payout routing** | Today all money lands in Unipicks' UmunotaPay wallet; nothing pays merchants; the decided model (merchant-directed payouts) isn't built | J9 |
| **Webhook signature/callback config unknown** | Real callbacks may all be rejected (401) or never sent | J4; research U5 |
| **Email confirmation off** | Identity and student pricing are unproven (U1); turning it on breaks merchant signup (J2) | J1, J2 |
| **Chat RLS (social D2/D3)** | U2 | J7 |
| **No report flow / admin queue** | Safety SLA (D5) impossible | J7 |
| **Group orders: no deadline, dead groups** | Groups never end; a failed group order can't be retried | J5 |

### D. Places that work but are fragile

| Fragile dependency | What breaks if it fails | Evidence |
|---|---|---|
| **cron-job.org up and calling every 60 s** | Expiry stops; the lazy checks (`update-order-status:167-187`, `process-payment:620-640`) only fire when someone touches the order, so lists show stale `pending`/`confirmed` | `expire-orders` is only invoked externally (file header) |
| **`CRON_SECRET` header in the cron job** | Every call 401 → same as above | `expire-orders/index.ts` secret check |
| **UmunotaPay webhook delivery** | Async payments stuck (reconciler off) | J4 |
| **Merchant dashboard open in a browser** | 5-minute confirmation window passes unseen; no push/SMS (notifications audit #6) | Realtime only while open, `MerchantOrders.jsx:114-128` |
| **Student app open within 5 minutes of acceptance** | Payment window missed; acceptance arrives only as a chat message/badge | `update-order-status:186-219, 284-292` |
| **Student keeps the checkout page and reloads it** | Never learns "accepted", "failed" or "paid via webhook" without reloading or opening Messages | `PaymentCheckout.jsx:20-62` (no subscription) |
| **Client-side follow-up writes** | Merchant profile creation runs in the browser after signup with errors ignored | `RegisterMerchant.jsx:78-83` |
| **Exact pickup-message text as dedup key** | Changing the message wording breaks duplicate protection between `process-payment` and the webhook | `_shared/pickup-code-message.ts` header |
| **Test data in the production database** | 23 test transactions will mix with real ones in reports after launch | research doc §4 |

---

## 6. Top 10 fixes (prioritised findings — no implementation proposed here)

| # | What must change | Journeys | Why first |
|---|---|---|---|
| 1 | **Prove email ownership and gate student pricing on verified students** (and make merchant signup survive email confirmation) | J1, J2, J3 | Urgent U1: identity and pricing integrity; the two changes must ship together |
| 2 | **Close the chat RLS holes** (social D2/D3) | J7, J6 | Urgent U2: live abuse vector; chat is dispute evidence |
| 3 | **Decide and implement late-payment and refund handling** (record refunds; stop "charged but expired") | J3, J4, J9 | Urgent U3; must exist before real money |
| 4 | **Make async payments reliable**: confirm UmunotaPay callback URL + signature, then enable the reconciler with its cron job | J4 | Without both, any lost webhook = stuck order, no dispute, no deletion |
| 5 | **Tell the student what is happening on the checkout page** (waiting for merchant, accepted, failed, processing, paid, expired) | J3, J4 | Today the page is static and silent in 5 of 6 states |
| 6 | **Define and build merchant payouts** (routing to the merchant code or scheduled transfers) and show settlement to merchants | J9 | Core promise to merchants; nothing exists |
| 7 | **Make bans and deactivation actually stop merchants** (order actions, deals, code verification) | J2, J8 | A bad merchant currently can't be stopped short of deletion |
| 8 | **Show dispute updates to merchants (and admins) where they look** | J6 | N3b rows for merchants/admins are written but never displayed |
| 9 | **Group order lifecycle**: deadline, recovery when the order dies, member notifications, expiry check | J5 | Never tested; dead groups are permanent |
| 10 | **Reports flow + admin queue; Social in the mobile nav; create the support inbox** | J7, J8 | Store requirements (Apple 1.2, Google Play deletion contact) and the D1/D5 decisions |

**Recommended end-to-end tests before launch (testing dashboard, test money):** async payment with the app closed; payment completed after the window; merchant decline; group order (minimum met, then merchant declines); dispute raised → merchant view; ban a merchant mid-order; delete an account with history, then re-sign up.
