# 3. Main journeys, step by step

*Checked 2026-10-05 against the code (`src/`, `supabase/functions/`,
`supabase/migrations/`). Function and file names are given so a problem can
be traced to the exact place.*

Each journey: a diagram (who talks to whom, in order), what can go wrong, and
where the code is.

---

## J1. A student signs up

```mermaid
sequenceDiagram
  autonumber
  actor S as Student
  participant W as Website<br/>Register.jsx
  participant A as Supabase Auth
  participant DB as Database
  participant M as Email
  S->>W: name, university email, password, student ID
  W->>A: signUp (role = student)
  A->>DB: new user row
  DB->>DB: triggers: user_roles = student,<br/>university from the email domain (server-owned)
  A->>M: "Confirm your email"
  M-->>S: email
  S->>A: clicks the link
  A-->>W: logged in → Home
  Note over S,W: First visit to Social: SocialOnboarding<br/>(username, 18+ check) → student_profiles
```

- **University comes from the email domain** (`keplercollege.ac.rw` → Kepler
  College), set by the database, so a student cannot pretend
  (`20261003190000_server_owned_verified_identity.sql`).
- **Can go wrong:** the confirmation email does not arrive (email sender, page 1);
  the person signs up twice with the same email (Supabase answers as if it worked,
  by design).

## J2. A business signs up and gets approved

```mermaid
sequenceDiagram
  autonumber
  actor B as Business
  participant W as Website<br/>RegisterMerchant.jsx
  participant A as Supabase Auth
  participant DB as Database
  actor AD as Admin
  B->>W: business name, RDB number, phone, MoMo code
  W->>A: signUp (role = merchant)
  A->>DB: new user
  DB->>DB: trigger creates merchant_profiles<br/>(approved = false)
  B->>W: logs in: "Waiting for approval"
  AD->>W: Admin → Approvals → Approve
  W->>DB: approved = true + activity log
  Note over B,DB: Only approved businesses in good standing<br/>can publish deals and receive orders<br/>(is_merchant_in_good_standing)
  B->>W: edits name or RDB later
  DB->>DB: guard: back to "waiting for approval",<br/>every admin notified
```

- **Can go wrong:** a business changes its name to look like another one →
  automatic re-approval (`20261004120000_merchant_profile_self_edit.sql`).

## J3. A normal order: order → accept → pay → collect

```mermaid
sequenceDiagram
  autonumber
  actor S as Student
  participant W as Website
  participant CO as create-order
  participant US as update-order-status
  participant PP as process-payment
  participant UP as UmunotaPay
  participant WH as payment-webhook
  participant DB as Database
  actor B as Business

  S->>W: taps a deal card on Home → deal page:<br/>quantity + "Place order" (3 taps to Pay)
  W->>CO: deal, quantity
  CO->>DB: checks: student not banned, business approved,<br/>deal live, price set → order pending_confirmation<br/>(business has 5 min)
  CO-->>B: phone alert "New order" + live update
  B->>US: Accept (or Decline with a reason)
  US->>DB: order confirmed, payment_deadline = now + 5 min
  US-->>S: chat message "Please pay within 5 minutes" + alert
  S->>W: Pay (MoMo number)
  W->>PP: order id, phone
  PP->>DB: checks the 5 minutes, creates the transaction (processing)
  PP->>UP: collect payment (API key + signature)
  UP-->>S: MoMo prompt on the phone
  S->>UP: enters PIN
  UP->>WH: callback "success" (signed)
  WH->>DB: transaction paid, order paid,<br/>pickup code (redemptions)
  WH-->>S: chat message with the pickup code + alert
  WH-->>B: alert "Payment received"
  B->>US: Food ready (when the food is cooked)
  US->>DB: order ready_at = now (status stays paid)
  US-->>S: chat message "Your food is ready" + alert<br/>+ live update of the order steps
  S->>B: shows the pickup code at the counter
  B->>DB: VerifyCode.jsx → redeem_pickup_code
  DB-->>B: order collected ✓
```

**Timers** (`expire-orders`, called by cron-job.org every 60 s):

```mermaid
flowchart LR
  classDef bad fill:#fdecea,stroke:#b42318,color:#1b1308
  classDef ok fill:#eef5e3,stroke:#547a29,color:#1b1308
  P[pending_confirmation]:::ok -- "business silent 5 min" --> CE[confirmation_expired]:::bad
  P -- "business declines" --> D[declined]:::bad
  P -- "business accepts" --> C[confirmed]:::ok
  C -- "student does not pay in 5 min" --> PE[payment_expired]:::bad
  C -- "student presses Pay" --> PR[payment_processing]:::ok
  PR -- "callback success" --> PAID[paid]:::ok
  PE -- "callback success arrives late<br/>(accepted)" --> PAID
  PAID -- "pickup code used" --> R[redeemed / completed]:::ok
```

- **Late payments are accepted:** if the money arrives after the 5 minutes,
  the order still becomes paid; nobody pays for nothing.
- **Can go wrong:**
  - the callback never arrives → the order stays `payment_processing`;
    `reconcile-payments` is built to ask UmunotaPay but is **switched off**;
  - the business is not approved / banned → `create-order` refuses
    ("This business isn't taking orders right now.");
  - money must go back (sold out, dispute) → **refunds not built yet**
    (plan approved).

## J4. A group order

```mermaid
sequenceDiagram
  autonumber
  actor H as Host student
  actor F as Friends
  participant W as Website<br/>DealDetail / GroupOrders
  participant DB as Database
  participant G as create-group-order-payment
  actor B as Business
  H->>W: "Start group order" on a group-buy deal page
  W->>DB: create_group_order_with_host → join code (open 24 h)
  H-->>F: shares the code
  F->>DB: join with the code (group_order_members)
  H->>G: submit the group
  G->>DB: ONE order for the business (group_order_id)
  Note over G,B: from here it is J3: accept → pay → pickup code
  DB-->>F: members told: sent / paid / not completed
  Note over DB: order dies (declined, expired) → group open again for 24 h<br/>24 h with no order → group closed
```

- Code: `20261003310000_group_order_lifecycle.sql`, `GroupOrders.jsx`,
  `create-group-order-payment`.

## J5. A dispute

```mermaid
sequenceDiagram
  autonumber
  actor S as Student
  participant DB as Database
  actor AD as Admin
  actor B as Business
  S->>DB: RaiseDisputeModal → raise_order_dispute<br/>(accepted, paid, collected or declined order)
  DB-->>AD: notification (bell)
  DB-->>B: notification
  AD->>DB: Admin → Disputes → resolve_order_dispute<br/>(under review / resolved / rejected + note)
  DB-->>S: notification with the outcome<br/>(the business is told too)
  Note over AD,DB: Resolved for the student → refund<br/>(planned: "Resolve and refund")
```

## J6. Report and ban

```mermaid
sequenceDiagram
  autonumber
  actor R as Student or business
  participant DB as Database
  actor AD as Admin
  R->>DB: ReportDialog → student_reports<br/>(chat, profile, business, story,<br/>profile photo, review or comment)
  DB-->>AD: every admin notified ("respond within 24 hours")
  AD->>DB: Admin → Reports: start review / resolve / dismiss<br/>(story: see photo, Remove story<br/>profile photo: see it, Remove photo<br/>review: see it, Remove review<br/>comment: see it, Remove comment)
  AD->>DB: Ban reported account (admin_ban_user)
  Note over DB: a banned account cannot message, order,<br/>sell, post stories or report (triggers)
```

## J7. Student stories

```mermaid
sequenceDiagram
  autonumber
  actor S as Student
  participant W as Website<br/>StudentCamera
  participant ST as Storage<br/>student-stories (private)
  participant DB as Database
  actor F as Friend
  S->>W: photo / GIF / Boomerang → "Post to your story"
  W->>ST: upload to S's own folder (≤ 5 MB, images)
  W->>DB: student_stories row (database sets 24 h)
  F->>DB: Social → get_story_tray (friends only, not blocked)
  F->>ST: private link (1 hour), only while the story is live
  F->>DB: view recorded (student_story_views)
  S->>DB: "Seen by" list
  F->>DB: Report → admin (J6), a reported story is kept until reviewed
```

## J8. Deleting an account

```mermaid
sequenceDiagram
  autonumber
  actor U as Student or business
  participant W as Website
  participant D as delete-my-account
  participant DB as Database
  U->>W: Profile → Delete account (enters password)
  W->>D: request
  D->>DB: refuses while an order is active, a dispute is open,<br/>a hosted group is open, or it is an admin account
  D->>DB: tombstone_user: removes personal data and stories,<br/>keeps orders, payments, chats and reports<br/>(shown as "Deleted user")
  D-->>U: logged out
```

---

**Not drawn yet (not built):** refunds (plan approved 2026-10-05), payouts to
businesses (waiting for UmunotaPay).
