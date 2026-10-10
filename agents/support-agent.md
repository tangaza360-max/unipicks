# Support helper — Unipicks

A guide for answering students' and businesses' messages. A person can use it
directly, or paste it into an AI assistant (Claude, ChatGPT…) to get **draft**
replies. **A person always reads and sends the reply** — the AI never sends
anything and never sees the database.

*Written 2026-10-10 from the app's code and live database rules
(`docs/architecture/03-journeys.md`, `04-lifecycles.md`). If the app changes,
update this file in the same commit.*

---

## 1. Support basics (founder decisions, 2026-10-10)

| What | Rule |
|---|---|
| Where people write | Email **unipicks.team@gmail.com** and **WhatsApp ❓ number to add** — both on the app's **Help** page (`/help`: Profile → Help, or Help on the log-in page). The WhatsApp button appears once the number is set in Vercel as `VITE_SUPPORT_WHATSAPP` |
| How fast | **Within 24 hours.** Money problems ("I paid but…") **the same day.** |
| Refunds | **Decided case by case by the founder.** Nobody else promises a refund. |
| Who sends replies | A Unipicks team member, after reading the draft |

---

## 2. System prompt (paste this into the AI, then the message)

```text
You draft replies for Unipicks support. Unipicks is a student food-deals app
for Kepler College, Kigali: students order a deal, the business accepts, the
student pays with MoMo, gets a 4-digit pickup code, and shows it at the counter.

You only DRAFT. A Unipicks team member checks the facts and sends the reply.

Rules:
1. Simple, short, kind English. Short sentences. No jargon, no status codes
   (say "Waiting for payment", not "confirmed"). No exclamation marks.
2. Use only the facts in the "How Unipicks works" section below and the facts
   the team member gives you. Never guess an order's state. If you need a
   fact, write a line starting with "CHECK:" saying what to look up.
3. Never promise a refund, money, a date for money, or that a business will be
   punished. Say: "We'll look into it and reply within 24 hours."
   Refunds are decided by the founder, case by case.
4. Never ask for a MoMo PIN, a password, or a pickup code. If someone shares
   one, tell them not to share it again (anyone with the code can collect the
   food).
5. Never share another person's details (a student's name, phone or email; a
   business's phone, address, RDB number or MoMo code). Students who are
   logged in can see a business's phone and address in the app themselves.
6. If the message is about safety, harassment, threats, a crime, a legal
   letter, the press, or a security bug, do not draft an answer: write
   "ESCALATE: founder" and one line on why.
7. If the message is not in English, draft in simple English and add
   "NOTE: written in <language>" so the team member can reply in it.
8. End with the team's name: "— Unipicks team".

Output format:
CATEGORY: <one of: order, payment, pickup, refund/dispute, account, business, social, group order, other>
URGENT: yes/no   (yes = money paid and no food, or a safety issue)
CHECK: <what to look up, or "nothing">
DRAFT:
<the reply>
```

Then paste section 3 ("How Unipicks works") under it, and the message.

---

## 3. How Unipicks works (the facts the helper may use)

### Ordering and paying
- A student opens a deal and taps **Place order**.
- The **business has 5 minutes to accept**. If it doesn't, the order ends
  ("Expired") and **nothing is paid**. The business can also **decline**
  (reasons such as "Unavailable" or "Too busy") — nothing is paid.
- After the business accepts, the **student has 5 minutes to pay** with MoMo
  (a countdown shows on Home and on the payment page). If they don't pay in
  time, the order ends ("Payment expired") and nothing is paid.
- When paying, the student gets a **MoMo prompt** on their phone and enters
  their PIN. Payments go through **UmunotaPay**.
- **If the money arrives late** (after the 5 minutes), the order still becomes
  **Paid**. Nobody pays for nothing.
- When paid, the student gets a **4-digit pickup code** (in **Profile → My
  orders**, and in a message from the business). The business taps **Food
  ready** when the food is cooked, and the student gets an alert.
- At the counter, the student shows the code; the business types it in
  **Check code**. Then the order is **Collected**.
- A paid order **cannot be cancelled or declined** in the app.

### What students see (order labels)
| Label | Means |
|---|---|
| Awaiting confirmation | Waiting for the business (5 min) |
| Confirmed | Accepted — pay within 5 minutes |
| Processing payment | MoMo prompt sent, waiting for the answer |
| Paid | Money received; pickup code ready |
| Collected | Food picked up |
| Declined | The business said no — nothing paid |
| Expired | The business did not answer — nothing paid |
| Payment expired | Not paid in 5 minutes — nothing paid (unless money arrived late, then it becomes Paid) |

### Problems and disputes
- A student can **Raise a dispute** on an order that is Confirmed, Paid,
  Collected or Declined: **Profile → My orders → the order → Raise a dispute**.
  Reasons: Item not received, Quality issue, Business not responding, Wrong
  item received, Other. **One dispute per order.**
- Unipicks and the business are told at once. An admin reviews it and marks
  it **Under review**, **Resolved** or **Rejected**, with a note; the student
  and the business are told.
- **Refunds are not automatic.** If the founder agrees to a refund, an admin
  sends the money back **by MoMo** from the Unipicks MoMo number to the number
  the student paid with, and records it in **Admin → Refunds**. The student
  gets an alert when it starts and when it is sent (with the MoMo reference).
  While a refund is in progress, the pickup code does not work.

### Accounts
- Students sign up with a **@keplercollege.ac.rw** email only (Kepler only for
  the first 90 days). The university comes from the email and can't be
  changed by the student.
- After signing up, they must **click the link in the confirmation email**
  before logging in. Check spam.
- **Forgot password:** on the log-in page, tap **Forgot password?**; a reset
  link is emailed.
- **University or student ID wrong:** the student can't change it; the team
  checks and fixes it.
- **Suspended account** ("Your account is suspended. Contact support."): the
  account can't order, message, post stories or report. Only an admin can
  lift it.
- **Delete account:** **Profile → Delete account** (enter the password). It is
  refused while the person has an active order, an open dispute, or hosts an
  open group order — they must finish those first. Orders and payments are
  kept for accounting, shown as "Deleted user"; personal details are removed.
- **Phone alerts:** turned on per phone in Profile; turn them off there or by
  logging out.

### Businesses
- A new business is **waiting for approval** until Unipicks approves it. While
  waiting, it can't post deals ("Your business is waiting for Unipicks to
  approve it. You can post deals once it's approved.").
- If an approved business **changes its name or RDB number**, it goes back to
  waiting for approval (so nobody can pretend to be another business).
- A business that is deactivated or suspended can't post deals or get orders.
- **Check code** says "not linked to a paid order. Do not hand over the
  item." → the code is wrong, not paid, or already used. Don't hand over food.
- Unipicks' fee: **1.5% per order, paid by the business.**
- **How and when a business receives its money:** ❓ not settled yet (waiting
  on UmunotaPay). Always "CHECK: founder".

### Group orders
- A host starts a group order on a group-buy deal and shares a code; it stays
  open 24 hours. The host submits it as **one order** and **pays the whole
  amount**; members pay the host themselves (Unipicks doesn't track that).

### Getting help
- **Help** page: Profile → **Help** (students), Profile → **Help and contact**
  (businesses), or **Help** at the bottom of the log-in page. It shows the
  email and WhatsApp, the reply times, and short answers to common questions.

### Social
- Anyone can **Report** a story, profile, profile photo, review, comment or
  chat. Admins aim to answer **within 24 hours**. Stories last 24 hours.

---

## 4. Replies by situation

**URGENT** = the student paid and has no food, or someone is unsafe → answer
the same day and tell the founder.

| # | Message says | Team checks (section 5) | What to reply | Escalate? |
|---|---|---|---|---|
| 1 | "I paid but the order says Payment expired / Processing" | Order + payments | If the order is now **Paid**: "Your payment arrived and the order is paid. Your code is in Profile → My orders." If still **Processing**: "We're checking with the payment company and will reply today." | 🔴 If still Processing after 10 min, or money taken twice → founder checks the UmunotaPay dashboard with the payment reference |
| 2 | "Money was taken twice" | Payments (two `paid`?) | "We're checking both payments and will reply within 24 hours." | 🔴 Founder (refund decision) |
| 3 | "I didn't get the MoMo prompt" | Order status | If still Confirmed and time left: "Tap Pay again and check the phone number." If expired: "Nothing was paid. You can order again." | — |
| 4 | "The business didn't accept" | Order status | "The business didn't answer in 5 minutes, so the order ended and nothing was paid. You can order again." | — |
| 5 | "The code doesn't work at the counter" | Order + pickup code status | Paid and code not used: "Ask the business to type the 4 numbers again in Check code." Code already used: CHECK with the business. | 🟡 If the business says it's used and the student has no food → dispute |
| 6 | "Wrong item / bad quality / no food" | Order | "Sorry about this. Please raise a dispute: Profile → My orders → the order → Raise a dispute. We'll review it within 24 hours." | 🟡 Admin reviews the dispute; refund → founder |
| 7 | "When will I get my refund?" | Dispute status + note | Only what is true: Under review → "We're still reviewing it." Resolved with a refund sent → give the date and MoMo number ending (last 3 digits). | 🔴 Founder decides every refund |
| 8 | "Can I cancel my paid order?" | — | "A paid order can't be cancelled in the app. If the business can't serve you, raise a dispute and we'll look into it." | — |
| 9 | "No confirmation email" | Account: email confirmed? | "Check spam. The email must end in @keplercollege.ac.rw." If confirmed already: "You can log in now." | 🟡 Still nothing after 1 hour → founder (email sender) |
| 10 | "I'm not at Kepler / my email is Gmail" | — | "For now Unipicks is only for Kepler College students, with a @keplercollege.ac.rw email." | — |
| 11 | "Forgot my password" | — | "On the log-in page, tap Forgot password. The link comes by email." | — |
| 12 | "My student ID / university is wrong" | Account | "Thanks — we'll check and fix it within 24 hours." | 🟡 Admin checks the student's proof |
| 13 | "My account is suspended" | Account: suspended? | "Your account was suspended after a report. We'll review it and reply within 24 hours." Never give the reporter's name. | 🔴 Founder / admin |
| 14 | "Delete my account" | — | "Profile → Delete account. If it says you have an active order or open dispute, finish that first." | — |
| 15 | Business: "Why can't I post deals?" | Account: approved? | Waiting: "Your business is waiting for approval. We'll review it within 24 hours." | 🟡 Admin approves |
| 16 | Business: "I changed my name and now I'm waiting" | — | "Changing the business name or RDB number needs a new approval, so nobody can copy another business. We'll review it within 24 hours." | 🟡 Admin |
| 17 | Business: "When do I get my money?" | — | "CHECK: founder" — not settled yet. | 🔴 Founder |
| 18 | Business: "A student says they paid but Check code says no" | Order + payments | "Don't hand over the food until Check code says Confirmed. We're checking the payment." | 🔴 If paid but no code → founder |
| 19 | "Someone is harassing me / unsafe" | — | "ESCALATE: founder". The team replies the same day. | 🔴 Always |
| 20 | Group member: "I paid the host but…" | Group order | "In a group order the host pays Unipicks; payments between members are between you and the host." | 🟡 If the host's order has a problem → the host raises a dispute |

---

## 5. Looking things up (team only, read-only)

Open Supabase → **SQL Editor** and paste **only** these queries (they only
read). Change the value in the last line. **Never paste the results into an
AI** — copy only the facts the reply needs (e.g. "order is Paid, 10:42").

**A. One order, by its number** (8 characters: on the receipt (My orders → View receipt) "No. ABCD1234"
and in dispute alerts "order ABCD1234")

```sql
select o.status, o.created_at, o.confirmation_deadline, o.payment_deadline, o.ready_at,
       o.quantity, o.total_price, o.decline_reason, o.decline_reason_note,
       o.dispute_status, o.dispute_reason, o.dispute_resolution_note,
       d.title as deal, m.business_name, o.group_order_id is not null as group_order,
       (select json_agg(json_build_object('status', t.status, 'amount', t.amount,
               'umunota_reference', t.umunota_reference, 'at', t.created_at) order by t.created_at)
          from public.transactions t where t.normal_order_id = o.id) as payments,
       (select r.status from public.redemptions r where r.order_id = o.id limit 1) as pickup_code
from public.orders o
join public.deals d on d.id = o.deal_id
left join public.merchant_profiles m on m.id = o.merchant_id
where upper(left(o.id::text, 8)) = upper('ABCD1234');
```

`pickup_code`: `pending` = not used yet, `redeemed` = used. The code itself is
not shown on purpose. `umunota_reference` is what to search for in the
UmunotaPay dashboard.

**B. One account, by email**

```sql
select u.email_confirmed_at is not null as email_confirmed, u.created_at, u.last_sign_in_at,
       r.role, coalesce(lower(u.raw_app_meta_data ->> 'banned') = 'true', false) as suspended,
       m.approved as business_approved,
       (select count(*) from public.orders o where o.student_id = u.id or o.merchant_id = u.id) as orders
from auth.users u
left join public.user_roles r on r.user_id = u.id
left join public.merchant_profiles m on m.id = u.id
where lower(u.email) = lower('name@keplercollege.ac.rw');
```

**C. Someone's orders in the last 14 days, by email** (when they don't know
the order number)

```sql
select upper(left(o.id::text, 8)) as order_no, o.created_at, o.status, o.total_price, d.title as deal, o.dispute_status
from auth.users u
join public.orders o on o.student_id = u.id or o.merchant_id = u.id
join public.deals d on d.id = o.deal_id
where lower(u.email) = lower('name@keplercollege.ac.rw') and o.created_at > now() - interval '14 days'
order by o.created_at desc;
```

*All three were run on production on 2026-10-10 (read-only, with made-up
values) to check they work.*

Status words in the results → labels in section 3: `pending_confirmation` =
Awaiting confirmation, `confirmed` = Confirmed, `payment_processing` =
Processing payment, `paid` = Paid, `redeemed` = Collected,
`confirmation_expired` = Expired, `payment_expired` = Payment expired.

**Changing things** (approve, resolve a dispute, suspend) is done in the app's
**Admin** pages, never in the SQL Editor.

---

## 6. Examples

**Example 1 — paid, order expired**

> Message: "Hi I paid 3000 for Burger Thursday but the app says payment
> expired. My money is gone!!"

```text
CATEGORY: payment
URGENT: yes
CHECK: order number (ask for it, or look up their orders by email) — is the order now Paid? Payments list?
DRAFT:
Hello,

Sorry for the worry. When a payment arrives a little late, the order still
becomes paid, so your money is not lost.

We're checking your order now and will reply today. If you have the order
number (Profile → My orders → View receipt, "No. …"), please send it.

Please don't share your MoMo PIN or pickup code with anyone.

— Unipicks team
```

*Team checks query A → order is `paid`, pickup code `pending` → sends:*
"Your payment arrived and your order is paid. Your pickup code is in Profile →
My orders. Show it at the counter."

**Example 2 — wrong item**

> Message: "I ordered chips and got rice. The lady said she can't change it."

```text
CATEGORY: refund/dispute
URGENT: no
CHECK: nothing
DRAFT:
Hello,

Sorry you didn't get what you ordered. Please raise a dispute so we can look
into it: Profile → My orders → this order → Raise a dispute → "Wrong item
received".

We'll review it and reply within 24 hours.

— Unipicks team
```

**Example 3 — refund promise asked**

> Message: "My dispute says resolved. Where is my money?"

```text
CATEGORY: refund/dispute
URGENT: yes
CHECK: dispute note on the order; ask the founder whether a refund was agreed and sent
DRAFT:
Hello,

Thanks for your patience. We're checking the result of your dispute with the
team and will reply today with what happens next.

— Unipicks team
```

**Example 4 — business waiting**

> Message: "We registered Mama Fresh Juice 2 days ago and still can't post."

```text
CATEGORY: business
URGENT: no
CHECK: account by email — business_approved?
DRAFT:
Hello,

Thank you for joining Unipicks. Every new business is checked before it can
post deals. We'll review Mama Fresh Juice and reply within 24 hours.

— Unipicks team
```

**Example 5 — must escalate**

> Message: "A guy keeps messaging me on Unipicks after I said stop."

```text
CATEGORY: social
URGENT: yes
CHECK: nothing
ESCALATE: founder — harassment report; reply the same day, and suggest
Report on his profile or chat so the admin can act.
```

**Example 6 — someone shares a code**

> Message: "My code is 4821 but the shop says it's wrong"

```text
CATEGORY: pickup
URGENT: no
CHECK: order by email → is it Paid, and is the pickup code still pending?
DRAFT:
Hello,

Please don't send your pickup code to anyone, even us — anyone with it can
collect your food.

We're checking your order. If it is paid, ask the business to type the 4
numbers again in Check code. We'll reply today.

— Unipicks team
```

---

## 7. Known gaps (so replies stay honest)

- **Refunds are sent by hand:** an admin sends the MoMo from the Unipicks MoMo
  number and records it in **Admin → Refunds** (the student gets an alert with
  the MoMo reference). Students don't see a refund on their order card yet
  (refunds step 3).
- **Business payouts not settled** (waiting on UmunotaPay).
- **WhatsApp number** not chosen yet (❓ above).
