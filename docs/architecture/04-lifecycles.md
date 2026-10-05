# 4. Life of each thing

*Checked 2026-10-05: the allowed values come from the live database rules
(CHECK constraints); "who moves it" comes from the code.*

Each thing in Unipicks goes through fixed stages. If something looks stuck,
find its stage here, then the step that should move it on.

---

## Order (`orders.status`)

```mermaid
stateDiagram-v2
  [*] --> pending_confirmation: create-order
  pending_confirmation --> confirmed: business accepts (update-order-status)
  pending_confirmation --> declined: business declines
  pending_confirmation --> confirmation_expired: 5 min, no answer (expire-orders)
  confirmed --> payment_processing: student presses Pay (process-payment)
  confirmed --> payment_expired: 5 min, no payment (expire-orders)
  payment_processing --> paid: callback success (payment-webhook)
  payment_expired --> paid: late callback success (accepted)
  paid --> redeemed: pickup code used (redeem_pickup_code)
  paid --> refunded: planned (refunds)
  declined --> [*]
  confirmation_expired --> [*]
  redeemed --> [*]
```

| Status | Means | Moved on by |
|---|---|---|
| `pending_confirmation` | Waiting for the business (5 min) | `update-order-status`, `expire-orders` |
| `confirmed` | Accepted, student must pay within 5 min | `process-payment`, `expire-orders` |
| `payment_processing` | MoMo prompt sent, waiting for UmunotaPay | `payment-webhook` (or `reconcile-payments`, switched off) |
| `paid` | Money received, pickup code sent | Business enters the code |
| `redeemed` | Collected ✓ | — |
| `declined`, `confirmation_expired`, `payment_expired` | Ended without food (late money still makes it `paid`) | — |
| `refunded` | Allowed by the database, **not used yet** (refunds planned) | — |
| `completed`, `cancelled` | Allowed by the database, **never set** for orders | — |

**Dispute** (`orders.dispute_status`, beside the status above):

```mermaid
stateDiagram-v2
  [*] --> open: student (raise_order_dispute)
  open --> under_review: admin
  open --> resolved: admin
  open --> rejected: admin
  under_review --> resolved: admin
  under_review --> rejected: admin
```

## Payment (`transactions.status`)

```mermaid
stateDiagram-v2
  [*] --> processing: process-payment (MoMo prompt sent)
  processing --> paid: callback success
  processing --> failed: callback failed / abandoned after 24 h (reconcile, off)
  failed --> paid: late success (accepted)
  paid --> refunded: planned (refunds)
```

`pending` is allowed but not used by the current flow.

## Pickup code (`redemptions`)

```mermaid
stateDiagram-v2
  [*] --> pending: payment-webhook creates the code
  pending --> redeemed: business enters it (redeem_pickup_code)
```

`confirmed` / `failed` and the `payment_status` column belong to the old
pre-order flow (before orders, September 2026) and are **not updated** by the
current flow. Read the order's status instead.

## Group order (`group_orders.status`)

```mermaid
stateDiagram-v2
  [*] --> open: host starts it (24 h)
  open --> closed: host submits → one order
  closed --> open: that order dies (declined / expired), fresh 24 h
  open --> cancelled: 24 h pass (expire-orders) or host cancels
  closed --> [*]: order paid
```

`group_order_members.payment_status` (`unpaid` / `pending` / `paid`) and the
table `group_order_payment_members` come from an earlier "each member pays"
design; the current flow submits **one order** for the whole group, owned by
the **host**, who pays the whole amount (`create-group-order-payment` sets the
order's student to the host). Members settle with the host themselves **[inference: nothing in the app records it]**.

## Business approval (`merchant_profiles.approved`)

```mermaid
stateDiagram-v2
  [*] --> waiting: sign-up (approved = false)
  waiting --> approved: admin approves
  approved --> waiting: business changes name or RDB (admins notified)
  approved --> waiting: admin deactivates
  waiting --> [*]: admin rejects (profile deleted)
```

Only an approved business **in good standing** (not banned) can publish deals
and receive orders.

## Friend request and message request

```mermaid
stateDiagram-v2
  [*] --> pending: send_friend_request / send_message_request
  pending --> accepted: accept_friend_request → friendships row
  pending --> declined
```

## Student story

```mermaid
stateDiagram-v2
  [*] --> live: posted (database sets 24 h)
  live --> ended: 24 h pass (hidden, row and photo kept)
  live --> deleted: owner deletes (row and photo removed)
  live --> hidden: owner deletes while a report is open (kept for the admin)
  live --> removed: admin "Remove story"
  hidden --> removed: admin "Remove story"
```

🟡 Ended stories and their photos are **never cleaned up** (no timer job yet).

## Report (`student_reports.status`)

```mermaid
stateDiagram-v2
  [*] --> pending: filed (admins notified)
  pending --> reviewing: admin "Start review"
  pending --> resolved: admin
  pending --> dismissed: admin
  reviewing --> resolved: admin
  reviewing --> dismissed: admin
```

Target: first answer within **24 hours** (the admin screen marks late ones red).

## Refund (planned, approved 2026-10-05)

```mermaid
stateDiagram-v2
  [*] --> to_send: admin starts it
  to_send --> sent: admin enters the MoMo reference
  to_send --> failed: MoMo did not go through
  failed --> sent: try again
  to_send --> cancelled: started by mistake
  failed --> cancelled
```
