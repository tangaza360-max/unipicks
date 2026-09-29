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
