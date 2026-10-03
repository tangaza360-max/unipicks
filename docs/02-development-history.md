# Unipicks — Development History & Technical Decisions

## 1. Purpose

This document records important technical work, security decisions, testing decisions, product-development decisions, and unresolved issues in Unipicks.

It exists so future developers, AI assistants, and the founder can understand:

- what has already been done
- why it was done
- what must not be broken
- what remains unfinished
- where future development should continue

**Product source of truth:** `docs/01-product.md`

**Technical history and decision record:** `docs/02-development-history.md`

---

## 2. Development Philosophy

The Unipicks development workflow follows these principles:

1. Inspect existing work before changing it.
2. Do not rebuild working features unnecessarily.
3. Preserve existing functionality.
4. Make small changes.
5. Test after meaningful changes.
6. Commit stable checkpoints.
7. Solve the actual problem instead of repeatedly investigating the same problem.
8. Keep important security decisions documented.
9. Use the product blueprint as the source of truth for product decisions.
10. Future AI development should understand the existing architecture before modifying it.

Unipicks is also a learning project. Development should help the founder understand why something works, why a decision was made, what problem a change solves, and how the system behaves.

---

## 3. Product Foundation

Unipicks is a **university student companion**.

The initial focus is food, with future possibilities including:

- events
- recreation
- student services
- other student-focused experiences

The central product idea is:

> "Someone actually thought about me as a student."

The long-term product habit is:

> "If I want something, let me check Unipicks first."

The complete product vision is documented in:

`docs/01-product.md`

Future product development must follow that document.

---

## 2026-09-25 — Automated Order Expiry (Fixes lingering pending_confirmation orders)
- **Problem**: Orders past their `confirmation_deadline` stayed in `pending_confirmation` forever because the expiry check only ran when a merchant manually accepted/declined.
- **Solution**: Created new Edge Function `expire-orders` to find and expire these orders automatically.
- **Security**: Added `CRON_SECRET` to Supabase secrets; function requires `x-cron-secret` header to run.
- **Scheduling**: Configured cron-job.org to POST to the function every 1 minute.
- **Verification**: Manual test expired 2 older orders. Cron history shows successful 200 OK runs every minute.

## 2026-09-27 — Task 3 + 3.5 + 3.6: Student Order History

### Task 3 — Normal orders now visible to students
- `OrdersTab.jsx` now queries the `orders` table with `deals` and `redemptions(code)` joins.
- New "Your orders" section shows status, quantity, total, decline reason + note, pickup code.

### Task 3.5 — Toggle polish
- Toggle moved to the right of its label (platform convention).
- Default state changed to ON (complete record on first open — IS 19598).
- Label renamed "Show cancelled orders" → "Show all orders".
- Section header "Ordered deals" → "Completed Orders".

### Task 3.6 — Dedicated Order History page
- Profile now shows a clickable "Order History →" row.
- Tapping opens a dedicated page with `← Back to Profile`, page title, and full Order History.
- Toggle behavior aligned with standards:
  - **ON** (default): complete record — every order, every status
  - **OFF**: actionable only — confirmed orders awaiting payment + open group orders

### Bonus fix — Production GRANT missing
- Discovered that `can_access_group_order`, `is_open_group_order`, and `find_open_group_order_by_code` were missing `EXECUTE` grants for the `authenticated` role in production, causing the "permission denied" error for all students.
- New migration `20260925120000_regrant_group_order_function_access.sql` restores the grants.

## 2026-09-27 — Task 4.5–4.8: Chat & Notifications polish

### Task 4.5 — Chat timestamps + accept-message timezone fix
- `ChatThread.jsx` now renders a timestamp under every bubble (WhatsApp-style) and a date separator pill (`Today`, `Yesterday`, `Sep 25`) when the day changes.
- Input box + Send button heights aligned; container switched to `100dvh` for mobile keyboard safety.
- `update-order-status` accept message reworded to `Please pay within 5 minutes to confirm it.` — removing the server-side UTC time that confused students (e.g., "pay by 06:34" when local time was 08:32).

### Task 4.6 — Student notification bell removed
- The dead bell icon in `StudentTopBar` was removed (it dispatched a `unipicks-open-activity` event with no listener).
- The chat bubble now carries a red unread badge (`99+` cap) with an `aria-label` that reflects the count.
- `StudentLayout` fetches the unread count from `chat_messages` on mount and subscribes to Realtime.
- Rationale: the original Task 4 spec states "the chat message is the notification" — a separate bell was never part of the design.

### Task 4.7 — Mark chat messages as read
- `ChatThread.jsx` runs an `UPDATE` on `chat_messages` marking incoming messages as read when the thread is opened (or when new messages arrive while viewing). Works for both 1-to-1 and group chats.
- `StudentLayout` Realtime listener changed from `INSERT`-only to `event: '*'`, and refetches the true unread count on every event (safer than incrementing optimistically).

### Task 4.8 — Instant scroll on chat open
- `ChatThread.jsx` now jumps **instantly** to the bottom on first render (no visible scroll animation), and only animates **smoothly** for new incoming messages.
- Implemented via a `hasScrolledOnce` ref that flips after the initial load.

## 2026-09-27 — Step 2: Actionable chat notifications

### Migration
- `20260927140000_add_chat_message_links.sql` adds two nullable columns to `chat_messages`: `link_path` and `link_label`. Applied to production via Supabase SQL Editor.

### `update-order-status` Edge Function
- The accept message insert now includes:
  - `link_path = /payment?order_id=<id>`
  - `link_label = 'Pay Now'`
- Message text reworded to "Tap the button below to complete your payment."

### `ChatThread.jsx`
- Added `useNavigate` and a button rendered under any bubble whose message has a non-null `link_path`.
- Old messages (pre-change) have null `link_path` and render exactly as before.

### Outcome
- Student now goes from notification → payment in **one tap** (previously 5 taps).
- Standards met: IS 19598, WCAG 2.4.4, ISO 32111 §5.4.

## 2026-09-27 — Housekeeping: commit previously untracked files

- `supabase/functions/expire-orders/` — automated order expiry Edge Function (was created earlier, never committed).
- `supabase/migrations/20260925120000_regrant_group_order_function_access.sql` — production GRANT fix for group-order helper functions (was written earlier, never committed).

## 2026-09-27 — Mobile UI polish batch

### Dark mode wiring (root cause fix)
- `ThemeContext.jsx` was applying a **class** (`dark` / `light`) but `src/index.css` responds to a **`data-theme` attribute**. The toggle flipped but nothing visually changed.
- Fix: added `root.setAttribute('data-theme', ...)` alongside the existing class manipulation. Dark mode now works end-to-end.
- Confirmed `tailwind.config.js` has `darkMode: 'class'`; verified `0` usages of Tailwind `dark:` variants (app is 100% CSS-variable driven).

### Other mobile UI fixes
- **Email overflow** in Account Information — added `min-w-0 flex-1` + `truncate`. Long Kepler emails now clip with `…`.
- **Avatar squish** — added `shrink-0` to the 80×80 avatar div; it stays a perfect circle regardless of sibling text width.
- **Toggle knob positioning** — replaced `translate-x-6` / `translate-x-1` with explicit `left-[22px]` / `left-1` on both the Dark mode and Discoverability toggles. The knob no longer overflows the pill.
- **Toggle pill color** — Dark mode toggle now uses `bg-accent : bg-muted` (was hardcoded `bg-muted`).
- **Chat container height** — changed from `h-[calc(100dvh-16rem)]` to `h-[calc(100dvh-10rem)]` (removed 96px of empty space at the bottom).
- **Search input padding** — `px-4` → `pl-10 pr-4`, so the placeholder text starts **after** the search icon instead of under it.

### Chat polish
- Input + Send button both set to `h-11` (44px) for pixel-perfect alignment.
- Messages instant-scroll to bottom on first load, smooth only for new incoming messages.

## 2026-09-27 — Task 6 + 6.5: Merchant contact visibility

### Standards context
- **IS 19598** requires seller contact details to be "clearly, prominently, and easily accessible to consumers." Prior to this change, students had no way to contact the merchant — a compliance gap.
- **ISO 32111 §8.8** requires the durable transaction record to include enough info for post-transaction rights.
- **RFC 3966** governs `tel:` URIs.

### Task 6 — Merchant phone in three places
- `process-payment/index.ts` — added `merchant_phone` to the Order type + select, and appended a conditional "📞 Merchant contact" line to the pickup-code chat message.
- `PaymentCheckout.jsx` — added `merchant_phone` to the order query + a contact line on the payment success screen.
- `OrdersTab.jsx` — added `merchant_phone` to the query + a contact line under the pickup code in Order History.

### Task 6.5 — Tappable merchant phone
- New component `MerchantPhone.jsx`: renders the number as a `tel:` link (opens dialer) plus a Copy button (clipboard, WCAG §2.5.5 44px target).
- New helper `linkPhoneNumbers.jsx`: auto-detects Rwandan phone numbers (`07XXXXXXXX`, `+2507XXXXXXXX`, `2507XXXXXXXX`) in any chat message and wraps them as `tel:` links.
- `ChatThread.jsx` now pipes `m.message` through `linkPhoneNumbers()`, so the merchant phone in the pickup message is tappable from the chat.
- `PaymentCheckout.jsx` and `OrdersTab.jsx` now use `<MerchantPhone />` instead of plain text.

## 2026-09-27 — Task 5: Dispute record (full lifecycle)

### Standards context
- **ISO 32111 §7.4.3** — "Resolving disputes" is a named post-transaction activity; the platform must maintain a dispute history.
- **ISO 32111 §8.14** — "Dispute resolution rule" must exist as a documented process.
- **IS 19598** — "Transparent policies for returns, cancellations, and refunds" and "clear communication with the customer throughout the reversal process."

### Task 5.1 — Schema + RPC functions
- Migration `20260927160000_add_dispute_record.sql`:
  - Added 5 columns to `orders`: `dispute_status`, `dispute_reason`, `dispute_raised_by`, `dispute_raised_at`, `dispute_resolution_note`.
  - CHECK constraints for status (`open|under_review|resolved|rejected`), reason (`item_not_received|quality_issue|merchant_unresponsive|wrong_item|other`), and note length (1–500 chars).
  - Partial index on `dispute_status` where not null.
  - RPC `raise_order_dispute(p_order_id, p_reason, p_note)` — SECURITY DEFINER, validates caller owns the order, checks allowed status, prevents duplicate disputes, `is_read`-style column-restricted update.
  - RPC `resolve_order_dispute(p_order_id, p_status, p_resolution_note)` — SECURITY DEFINER, admin-only via `get_my_role()`, sets status + resolution note.
- Grants: `revoke all from public; grant execute to authenticated`.

### Task 5.2 — Student UI
- New `RaiseDisputeModal.jsx` — reason dropdown, note textarea (500 char limit), submit calls the RPC.
- `OrdersTab.jsx`:
  - Added 4 dispute columns to the query.
  - New `disputeTarget` state + modal render.
  - "Raise a dispute" button on orders in actionable states (`confirmed`, `paid`, `redeemed`, `completed`, `declined`) that don't already have a dispute.
  - Amber "Dispute: [status]" block on cards with an open dispute, including resolution note when present.
- **Note on the first deploy:** an earlier commit accidentally placed the modal render inside `OrderCard` instead of `OrdersTab`, causing a `ReferenceError` and a black screen. Fixed by anchoring the patch on the specific `function OrderCard({ order, type, quantity }) {` signature.

### Task 5.3 — Merchant view
- `MerchantOrders.jsx`:
  - Added `dispute_status`, `dispute_reason`, `dispute_resolution_note` to the orders query.
  - Amber dispute block on order cards — same visual language as the student side, with reason + resolution note.
  - Label maps for both status and reason values.

### Task 5.4 — Admin UI
- New migration `20260927180000_admin_orders_read_policy.sql`: RLS policy letting admins read all orders (`get_my_role() = 'admin'`). Without this, admins had no visibility into disputes.
- New `AdminDisputes.jsx`:
  - Three filter pills: Active / Resolved / Rejected.
  - Dispute cards with deal, business, raised timestamp, quantity × price, reason, status badge.
  - Resolve modal with three actions: Mark under review / Reject / Resolve, plus an optional resolution note.
  - Submits via the `resolve_order_dispute` RPC.
- `Dashboard.jsx`: added "Disputes" tab (with AlertCircle icon) to the admin tab row.

## 2026-09-29 — Merchant notification badges (Orders + Messages)

### Context
Standards: ISO 32111 §7.3.3 (order confirmation), IS 19598 ("efficient delivery notifications"). A merchant who can't see an order is waiting fails the accountability principle.

### Implementation
- `Dashboard.jsx` now tracks two live counts for the merchant role:
  - `pendingOrderCount` — number of orders with `status = 'pending_confirmation'`
  - `merchantUnreadCount` — number of unread `chat_messages` addressed to the merchant
- Both subscribe to Supabase Realtime and refetch the true count on any INSERT/UPDATE event. No optimistic increment, so the counts cannot drift.
- Red badges render on the Orders and Messages tabs when the counts are > 0.
- Badges clear as the merchant accepts/declines orders or reads messages.

### Result
- Real-time awareness of new orders and messages without manual refresh.
- Symmetric with the student side (chat bubble unread badge).

## 2026-10-03 — Session: Multi-offer deals, group orders, search, chat identity

### Standards context
- **E-commerce offer-type taxonomy** — deals are not just percentage discounts. Platforms standardize on a typed enum (percentage, fixed_amount, bogo, fixed_price, tiered, free_shipping, group_buy). This matches Medusa, Salesforce Commerce, Shopify, and Spree.
- **Group-buy model (hybrid)** — merchants design group deals; students form groups. Matches Pinduoduo, Temu, Groupon, AliExpress Group Buy.
- **Chat identity (marketplace standard)** — chat headers carry display name + role badge. Trust signal between strangers.
- **URL-based navigation for SPAs** — every perceived page needs a distinct URL, unique title, and history entry. Post-action redirects use `replace: true`.
- **User discovery (privacy-first)** — search is scoped, requests require approval, mutual visibility.
- **AI title generation standard** — generate 3-5 options, never invent features, disclose AI assistance (FTC / EU AI Act direction).

### Task 1 — AI deal generator crash fix
- `supabase/functions/generate-deal/index.ts` contained raw shell heredoc lines (`cat > ... << 'EOF'` and a trailing `EOF`) baked into the TypeScript file. Deno failed to parse the module at boot, producing `WORKER_ERROR` and a browser-side "Failed to fetch".
- Removed the stray lines. Redeployed. CORS preflight returned `HTTP/2 200`.
- Subsequent testing revealed OpenAI credits were exhausted (`429 insufficient_quota`). Migrated the function to **Gemini 2.5 Flash** with structured JSON output via `response_mime_type` and `response_schema`. `GEMINI_API_KEY` added as a Supabase secret.
- **Blocker:** Gemini returns `403 PERMISSION_DENIED — project has been denied access` for new users. The function retains the OpenAI fallback path and a hardcoded local fallback. AI generation is effectively **paused** pending Google verification or credit addition.

### Task 2 — Multi-offer-type deal creation
- Migration `20261001033906_add_deal_offer_fields.sql`:
  - New enum `deal_offer_type` with values: `percentage`, `fixed_amount`, `bogo`, `fixed_price`, `tiered`, `free_shipping`, `group_buy`.
  - New columns on `deals`: `offer_type` (NOT NULL default `percentage`), `discount_value`, `final_price`, `buy_quantity`, `get_quantity`, `min_participants`, `tiered_rules` (jsonb).
  - Backfilled legacy rows and added index `idx_deals_offer_type`.
- `MerchantDeals.jsx` rewritten to support a dynamic form:
  - Offer-type dropdown drives which fields render.
  - Validation branches per type (percentage 0-100; BOGO ≥1; group_buy ≥2 participants; tier rules parsed as `"N for M"`).
  - **Critical bug fix:** `const maxDiscountPercent = Number(maxDiscount)` coerced `null` to `0`, causing a false "Discount cannot exceed 0%" error. Replaced with null-safe defaults (100% and 1,000,000 RWF).
  - Live preview card with type-aware badge colors (green/accent for discounts, blue for quantity deals, purple for group/special).
- `DealsFeed.jsx` — badge rendering moved to shared `getOfferBadge` / `getOfferBadgeClass` helpers. **Hides the badge when a percentage deal has no discount value** (was previously rendering a misleading "0% OFF").
- `DealsFeed.jsx` — for `group_buy` deals, the "Order now" button becomes a purple "🛒 Start group order" that creates the group in one click and navigates to `/dashboard/orders`.

### Task 3 — URL-based dashboard routing + back button
- `main.jsx`: `/dashboard/*` wildcard route; `RouteTitle` component sets `document.title` per route (e.g., `Orders | Unipicks`).
- `Dashboard.jsx`: tab state derived from URL (`pathname.split('/')[2]`), invalid tabs redirect to the role default with `replace: true`.
- `StudentLayout.jsx` and merchant/admin tabs navigate via `navigate('/dashboard/<tab>')`.
- `navigate(-1)` usages removed; explicit back targets used instead.
- Post-action redirects (`Login`, `Register`, `RegisterMerchant`, `PaymentCheckout`, `OrderConfirmation`, `Dashboard.handleLogout`, `ProfileTab`) now use `replace: true` to prevent back-button loops.

### Task 4 — Chat sender names + role badges
- `ChatThread.jsx`:
  - Loads sender profiles for merchant (`merchant_profiles.business_name`) and student (`get_student_message_profiles` RPC returning `display_name`).
  - Received messages show sender name above the bubble; own messages are unlabeled.
  - Chat header shows display name + a role pill: "🏪 Merchant" (green) or "🎓 Student" (blue).
  - Group chats label all non-self senders.
  - Works with Realtime inserts.

### Task 5 — Multi-tab student search
- Migration `20261003083422_add_search_merchants.sql`: new RPC `search_merchants(search_query text)` returning `user_id, business_name, full_name, address`. Only approved merchants, normalizes query, `SECURITY DEFINER`, authenticated-only.
- New page `src/pages/StudentSearch.jsx`:
  - Single search input with 300 ms debounce.
  - Three tabs: **People** (via existing `search_students`), **Businesses** (via new `search_merchants`), **Deals** (direct query on `deals`).
  - People cards use `StudentAvatar` + friend state via `are_students_friends` + `send_friend_request`.
  - Informative empty and loading states; error surfaced inline.
- `StudentLayout.jsx` — `case 'search'` now renders `<StudentSearch />` instead of the previous placeholder that re-rendered `DealsFeed`.
- `DealsFeed.jsx` search input icon overlap fixed with `!pl-10` (Tailwind important modifier to beat `field-input` padding).

### Task 6 — Group order payment path
- Problem discovered: hosts clicking "Pay Now" on a group order routed to `/payment?order_id=<group_orders.id>`, but `PaymentCheckout` queried the `orders` table by that id — always "Order not found". Payments were structurally unreachable.
- Migration `20261003092115_add_group_order_id_to_orders.sql`: added `group_order_id uuid` FK on `orders` + index.
- New Edge Function `create-group-order-payment`:
  - Auth via Bearer token; only the host can submit.
  - Rejects already-submitted groups (dedup via `group_order_id`).
  - Aggregates member quantities; computes unit price (respecting `discount_percent`); creates **one** `orders` row with `group_order_id` set, `status='pending_confirmation'`, 5-minute confirmation deadline.
  - Closes the group (`status='closed'`) and notifies the merchant via `notifications`.
- `GroupOrders.jsx` — "Pay Now" now calls the new function, then navigates to `/payment?order_id=<new orders.id>`.

### Task 7 — Group order discovery on deal detail
- Migration `20261003100909_add_get_open_groups_for_deal.sql`: new RPC `get_open_groups_for_deal(p_deal_id uuid)` returning id, host_name, join_code, created_at, member_count, total_quantity. Returns up to 20 open groups per deal.
- `DealDetail.jsx` — new "Open groups for this deal" section listing open groups with host, member count, total quantity, relative start time, and a one-tap **Join** button that navigates to `/dashboard/orders?join_code=XXX`.
- `GroupOrders.jsx` — reads `?join_code=` from URL, auto-opens the join form, and prefills the code (`JoinOrder({ initialCode })`).

### Task 8 — Merchant group activity
- Migration `20261003102534_add_merchant_group_activity_rpc.sql`: new RPC `get_merchant_group_activity()` returning `(deal_id, open_group_count, total_members, total_quantity)` scoped to the authenticated merchant's own `group_buy` deals.
- `MerchantDeals.jsx` — group-buy deal cards now show a muted line: `🛒 N open groups · M joined · K items`. Hidden when count is 0. Separate subtle "Waiting for the first group" hint when `min_participants` is set but no groups exist yet.

### Task 9 — My Groups page redesign
- `GroupOrders.jsx` rewritten as **"My Groups"**:
  - Removed the "Start one" dropdown flow (group creation now happens from deal cards).
  - "Join with a code" is now an inline, dismissible form; still auto-opens when `?join_code=` is present.
  - Two sections: **Groups you're hosting** and **Groups you've joined** (query joins `group_order_members` to `group_orders` to `deals`).
  - Shared `GroupOrderCard` renders deal thumbnail, title · business, host label, status pill (Open/Closed), member progress bar driven by `min_participants`, item count + total, expandable member list.
  - Hosted card keeps **Copy invite code**, **View & Pay**, **Mark as ordered / close**, and **Cancel order**. Joined card has **View** only.
  - Loading uses skeleton cards; empty state has a "Browse deals" CTA when both lists are empty; each section shows "None right now." when only one is empty.

### Migrations added in this session
1. `20261001033906_add_deal_offer_fields.sql` — offer type enum + columns
2. `20261003083422_add_search_merchants.sql` — merchant search RPC
3. `20261003092115_add_group_order_id_to_orders.sql` — order ↔ group link
4. `20261003100909_add_get_open_groups_for_deal.sql` — group discovery RPC
5. `20261003102534_add_merchant_group_activity_rpc.sql` — merchant group stats RPC

### Edge Functions added or modified
- `generate-deal` — migrated from OpenAI to Gemini; AI still blocked by Google `403`
- `create-group-order-payment` — **NEW**; converts a group order into a merchant-facing `orders` row

### Known issues / untested paths
- **AI deal generator** — Gemini 403 (project denied). Fallback behaves as a regex parser.
- **Group order payment end-to-end** — the `create-group-order-payment` path has never been exercised with a real host paying. This is the top testing priority.
- **Merchant fulfillment of group orders** — merchant sees the order with `group_order_id` set, but the accept → prepare → fulfill loop has not been tested for group-sourced orders.
- **Group order deadline** — no `group_deadline` column exists. Groups stay open indefinitely. Blocks min-participant enforcement and countdown UX.
- **Min-participant enforcement** — payment currently proceeds regardless of member count vs. `min_participants`.
- **Purple nav badge on Orders icon** — planned (Phase 3), not yet shipped.

---

## 2026-10-03 — Payment reconciliation (`reconcile-payments`, disabled until configured)

**Why:** an asynchronous MoMo payment is only recorded when UmunotaPay's webhook reaches `payment-webhook`. If that never happens (endpoint down, 500 past the provider's retry window), the student has paid but the order stays `payment_processing`.

**What:** `supabase/functions/reconcile-payments/index.ts`, called by cron every 5 minutes. No new order status: the "accepted, waiting for result" state is the existing `payment_processing` order + `processing` transaction (decision: reuse it rather than add `payment_pending_confirmation`).

Per run, up to 20 orders (oldest first) in `payment_processing`, not updated for 5+ minutes, with a `processing` transaction:

| Provider says | Transaction | Order | Side effects |
|---|---|---|---|
| paid | `paid` | `paid` | redemption ensured, pickup code chat message (shared helper), merchant `payment_received` notification |
| failed | `failed` | `confirmed` (student can retry, as in process-payment) | student `user_notifications` row `payment_failed` |
| pending, < 24h | unchanged | unchanged | none |
| pending, ≥ 24h | `failed` | `payment_expired` | none (abandoned) |
| HTTP error / not JSON / unknown status | unchanged | unchanged | counted `errored`, next run retries |

Writes are guarded by the current status, so racing `payment-webhook` or a second run never repeats an action. Response: `{ success, checked, confirmed, failed, still_pending, abandoned, errored }`. Logs: one summary line plus `order=… tx=… provider_status=… action=…` per order; no phone, name or email.

A late payment is accepted (unlike the 5-minute window in `process-payment` / `payment-webhook`): by the time reconciliation runs the window has always passed, and the student's money has been taken.

**Env (read on every call; no redeploy needed to change them):**
- `RECONCILE_ENABLED` — must be `true` to run. Anything else returns `{ skipped: true, reason: "reconcile disabled" }`.
- `UMUNOTA_STATUS_ENDPOINT` — URL with `{ref}`, replaced by `umunota_reference` (or `merchant_reference` when that is null).
- `UMUNOTA_STATUS_METHOD` — `GET` (default) or `POST` (sends `{}`).
- `UMUNOTA_STATUS_AUTH_STYLE` — `hmac` (default; `X-API-Key` + `X-Timestamp`/`X-Nonce`/`X-Signature`, signed like process-payment's collect call over `METHOD\npath\nbody\ntimestamp\nnonce` with `UMUNOTA_WEBHOOK_SECRET`), `apikey` or `bearer`.
- Existing: `UMUNOTA_API_KEY`, `UMUNOTA_WEBHOOK_SECRET`, `CRON_SECRET`.

**Status parsing:** the first string among `status`, `data.status`, `payment_status`, `data.payment_status`; paid = paid/success/successful/succeeded/completed/complete/approved; failed = failed/failure/cancelled/canceled/declined/rejected/expired/timeout/timed_out; pending = pending/processing/initiated/accepted/queued/in_progress/submitted. Anything else is treated as an error, never guessed.

**Open:** UmunotaPay's status-query endpoint, its signing rule for GET, its status values and its own payment timeout (confirms the 24h abandonment rule). Cron job: `POST https://<project-ref>.supabase.co/functions/v1/reconcile-payments`, every 5 minutes, header `x-cron-secret`.

---

## 2026-10-03 — Follow-up queued (post-launch): friend groups

**Idea (founder):** when the same students order together more than 3 times, treat them as a saved **friend group**, so one of them can start a new group order for the same people in one tap.

**Status:** not built. Decided as a **post-launch** feature, after the group-order lifecycle fix (24-hour groups, reopen when the order is declined or expires, member notifications; migration `20261003310000`).

**Notes for when it's picked up:**
- Data already exists: `group_order_members` per `group_orders`, with `orders.status` showing which groups actually completed. "Ordered together" should count completed orders only (paid / redeemed), not abandoned groups.
- Needs consent: members should be able to leave a saved group, and blocks (`blocked_students`) must break it.
- Likely shape: a `friend_groups` + `friend_group_members` pair, suggested after the 3rd completed co-order, plus "Start a group with …" on Home.

### 2026-10-03 — Historical order cleanup

5 orders from 2026-09-15 (created before migration `20260915100000_add_payment_deadline_to_orders.sql`) had `status = 'confirmed'` with `payment_deadline = NULL`. They were moved to `payment_expired` via a one-time SQL update setting `payment_deadline = confirmation_deadline + interval '5 minutes'`.

