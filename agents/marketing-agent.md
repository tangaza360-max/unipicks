# Marketing helper — Unipicks

A guide for writing Unipicks posts, messages and launch material. A person can
use it directly, or paste it into an AI assistant (Claude, ChatGPT…) to get
**drafts**. **A person always checks every fact and price, and posts it** —
the AI never posts and never sees the database.

*Written 2026-10-10 from `business/` (the founder's decisions and 90-day
plan), `docs/style-guide.md` §10 (voice) and the live app. When a decision
changes, update this file in the same commit.*

---

## 1. What we can say (founder decisions and facts)

| Topic | The fact | Source |
|---|---|---|
| Who it's for | **Kepler College students, Kigali — only Kepler for the first 90 days** (from Mon 12 Oct 2026). Sign up with a **@keplercollege.ac.rw** email | `business/README.md` ✅ 2026-10-10 |
| What it is | Student deals from food places near campus. **Order ahead in the app, pay with MoMo, pick up** with a 4-digit code. **Pickup, not delivery** | `business/README.md` |
| What students pay | **Only the deal price. No fee for students** | `business/go-to-market.md` §6 ✅ |
| What businesses pay | **1.5% of each order. Nothing else** (no sign-up fee, no subscription, no paid placement) — they keep 98.5% | `business/README.md` ✅ |
| How fast | The business has 5 minutes to accept; the student then has 5 minutes to pay | the app (`agents/support-agent.md` §3) |
| Group orders | On group-buy deals, order with friends for a better price; the host pays for the group | the app |
| Ambassadors | **Free meals + a small bonus for each new student who orders twice** (❓ amount not set) | `business/go-to-market.md` §4 ✅ |
| Where to get help | The **Help** page in the app (Profile → Help) | the app |

**Not settled yet — never promise these:**
- ❓ **When businesses get their money** (payout from UmunotaPay) — a business
  pitch must not give a payout date until the founder sets it.
- ❓ The ambassador bonus amount and the number of ambassadors.
- ❓ Other universities (only after day 90, and only if the day-90 gate is met).
- ❓ Refunds are handled by hand, case by case — never write "money back
  guaranteed".

🔴 **Before the big student push (weeks 7–8):** the 3 items in
`business/README.md` ("Three things to settle before launch") must be done.
Until then, write for the **survey, food places and the soft launch** only.

---

## 2. System prompt (paste this into the AI, then the request)

```text
You draft marketing for Unipicks, a student food-deals app for Kepler College,
Kigali. Students order a deal in the app, pay with MoMo, and pick up their food
with a 4-digit code. Pickup only, no delivery. Students pay only the deal
price. Businesses pay Unipicks 1.5% per order.

You only DRAFT. A Unipicks team member checks every fact and posts it.

Rules:
1. Voice: simple English, short sentences, "you" and "we". Kind and warm,
   never pushy. No exclamation marks, no ALL CAPS. At most 2 emojis, and only
   in social posts and WhatsApp messages. Say "business" or "food place",
   never "merchant".
2. Use ONLY the facts below and the deals the team member gives you (title,
   business, price as shown in the app, days and hours, link). Never invent a
   deal, a price, a discount, a time, a number of users, a review or a quote.
   If you need a fact you don't have, write a line "CHECK: <what>".
3. Prices exactly as given, written like "4,800 RWF". Show a discount only if
   it is given ("20% off"). Never "cheapest", "best", "free" (unless the deal
   is free), "guaranteed", "money back", or "limited time" unless an end date
   is given.
4. Only Kepler College students, for now. Never suggest other universities
   can join.
5. Never name or show a student, or use a student's words or photo, unless
   the team member says the student agreed in writing.
6. No pressure tricks: no fake countdowns, no "only 2 left" unless given, no
   "everyone is using it".
7. Every post ends with what to do next: the deal link, or "Sign up with your
   @keplercollege.ac.rw email at unipicks.vercel.app".
8. If asked for something that breaks these rules, draft the closest honest
   version and add "NOTE:" explaining what you changed.

Output format:
TYPE: <deal post | weekly deals | business pitch | ambassador | email | poster | other>
CHANNEL: <WhatsApp | Instagram | X | email | poster | in person>
CHECK: <facts to confirm, or "nothing">
DRAFT:
<the text>
```

Then paste section 1 ("What we can say") under it, and the request.

---

## 3. What to write, and the shape of each

| Type | Channel | Length | Must include |
|---|---|---|---|
| **Deal post** | WhatsApp status / class groups (via ambassadors), Instagram | 2–4 lines | Deal name, business, price (+ real discount), days/hours if limited, the **deal link** |
| **This week's deals** | WhatsApp, Instagram carousel | One line per deal | Each deal's name, business, price, link; "Pickup only" |
| **Business pitch** | In person, WhatsApp to the owner | 5 short points | Order ahead, they choose deal and hours, keep 98.5%, students pay before cooking, how to join; no payout date (❓) |
| **Ambassador message** | WhatsApp | Short | What they do, what they get (free meals + bonus for students who order twice — amount ❓), who to ask |
| **Launch email** | Kepler student list | ≤ 120 words | What it is, why (student prices near campus), how (3 steps), the link, Help |
| **Poster** | Notice boards (❓ which are allowed), counters of partner food places | Headline ≤ 6 words + 3 steps + QR | QR code to `unipicks.vercel.app` (or a deal's `/d/` link at that food place) |
| **Survey invite** | Email | — | Already written: `docs/user-research/email-invite.md` |

**Link to use for a deal:** `https://unipicks.vercel.app/d/<deal id>` — in
WhatsApp, X and Facebook it shows a preview card with the deal's photo, name,
business and price, then opens the deal (checked on production 2026-10-10).
The app's **Share** button on a deal gives the same link.

---

## 4. Getting the facts (team only, read-only)

**Live deals today** — Supabase → SQL Editor, paste only this (it only reads
public deal information):

```sql
select d.title, m.business_name, d.offer_type, d.available_days, d.available_from, d.available_until,
       d.expires_at::date as ends, 'https://unipicks.vercel.app/d/' || d.id as link
from public.deals d
join public.merchant_profiles m on m.id = d.merchant_id
where d.active and m.approved and (d.expires_at is null or d.expires_at > now())
order by d.created_at desc;
```

*Run on production 2026-10-10 (read-only): 3 live deals, all from Mr. Chips.*

**The price:** open each deal's link and copy the price **exactly as the deal
page shows it** (it already applies the discount). Don't work it out from the
database — offers have several types.

**Numbers about users or orders** (e.g. "50 students ordered this week"):
only from the queries in `business/metrics.md`, and only if the founder agrees
to share them.

---

## 5. A posting plan that follows the 90-day plan

| Weeks | Dates | Write |
|---|---|---|
| 1–2 | 12 – 25 Oct | Survey invite + reminder after 3 days (`docs/user-research/`). Nothing public about the app yet. |
| 3–4 | 26 Oct – 8 Nov | Business pitch for each food place visited; a thank-you message when one joins. |
| 5–6 | 9 – 22 Nov | Soft launch: invite the survey's beta testers; ambassador message; one deal post per partner. |
| 7–8 | 23 Nov – 6 Dec | 🔴 Only if section 1's red items are done. Launch email, posters with QR, "This week's deals" every Monday, one deal post per day at most. |
| 9–10 | 7 – 20 Dec | Habit: weekly deals, group-order posts, ask for reviews in the app. |
| 11–13 | 21 Dec – 10 Jan | ❓ Check Kepler's holidays; pause student posts while campus is closed. |

---

## 6. Before anything is posted (checklist)

- [ ] Every price matches the deal page **today**, and the link opens it.
- [ ] The deal is live on the days and hours the post says.
- [ ] Nothing from "Not settled yet" (section 1) is promised.
- [ ] No student's name, face or words without written agreement.
- [ ] **Photos:** today's deals use stock photos. Before the campus launch, ask
      each food place for a real photo of the dish, so the post shows what
      students get. Never use someone else's photo without permission.
- [ ] Plain words, no exclamation marks, at most 2 emojis.
- [ ] Ends with the link or how to sign up.

**Honest advertising:** Rwanda's consumer-protection law forbids misleading
claims. A new law (n° 011/2026, 26 Feb 2026) is reported to replace Law
36/2012 ([AllAfrica, 2026](https://allafrica.com/stories/202603170337.html)) —
❓ add "advertising rules" to the lawyer's review list. Until then, follow
rules 2–6 of the system prompt.

---

## 7. Examples

**Example 1 — deal post**

> Request: "Make a WhatsApp status for Burger Thursday."
> Team gives: For Thursday: Burger Thursday · Mr. Chips · 4,800 RWF · 20% off · every day ·
> https://unipicks.vercel.app/d/286bcf79-0ab4-49d4-851b-283aae1a3499

```text
TYPE: deal post
CHANNEL: WhatsApp
CHECK: nothing
DRAFT:
For Thursday: Burger Thursday at Mr. Chips 🍔
4,800 RWF for Kepler students (20% off).
Order in Unipicks, pay with MoMo, pick it up with your code.
https://unipicks.vercel.app/d/286bcf79-0ab4-49d4-851b-283aae1a3499
```

**Example 2 — business pitch**

> Request: "Message for the owner of a juice place near Kepler."

```text
TYPE: business pitch
CHANNEL: WhatsApp
CHECK: when businesses receive their money (payout) — not settled
DRAFT:
Hello, I'm Olivier from Unipicks, a food app for Kepler College students.

- Students order ahead in the app and pick up. No riders, no waiting.
- You choose the deal, the price and the hours, for example your slow afternoons.
- Students pay with MoMo before you prepare the order.
- You keep 98.5% of every order. Unipicks takes 1.5%. No other fees.
- Joining is simple: you register, we check your details, then you post your first deal.

Can I visit this week to show you?

— Olivier, Unipicks
```

**Example 3 — a request that breaks the rules**

> Request: "Write 'Cheapest food in Kigali, 1,000+ students already use
> Unipicks!'"

```text
TYPE: other
CHANNEL: Instagram
CHECK: real number of students (business/metrics.md), only if the founder agrees to share it
DRAFT:
Student prices from food places near Kepler.
Order in the app, pay with MoMo, pick up with your code.
Sign up with your @keplercollege.ac.rw email at unipicks.vercel.app
NOTE: removed "cheapest" (can't be proved) and "1,000+ students" (not a
number we have); removed the exclamation mark (house style).
```

**Example 4 — ambassador message**

```text
TYPE: ambassador
CHANNEL: WhatsApp
CHECK: bonus amount (not set yet)
DRAFT:
Hi, would you like to be a Unipicks ambassador at Kepler?

What you do: show friends how to sign up and order, share deals in your class
groups, and tell us about any problem the same day.

What you get: free meals from our partner food places, and a bonus for every
new student who orders twice. (CHECK: amount)

Interested? Reply here and we'll meet this week.

— Unipicks team
```

---

## 8. Not now

- Paid ads (not in the 90-day plan).
- Posts for other universities (after day 90 only).
- Automatic posting: every post is checked and posted by a person.
