# Go-to-market — launching at Kepler College

_Written 2026-10-10. Legend: 🔗 source · 🧮 calculation · ❓ open question · ✅ founder decision._

✅ **Kepler College (Kigali campus) only for the first 90 days** (2026-10-10).
ALU Rwanda and **one** University of Rwanda campus come next, only if the
day-90 gate in `metrics.md` is met.

## 1. Order of work: businesses first, then students

Students won't come back to an app with one food place. Today there is
**1 business** (Mr. Chips). So:

1. **Survey** — learn prices, payment habits and fears (week 1–2).
2. **Businesses** — sign 5 food places near Kepler before the big student push.
3. **Students** — ambassadors, posters, class groups.
4. **Habit** — weekly deals, group orders, reminders.

## 2. Step 1 — the student survey

The form is ready (`docs/user-research/`). ❓ Before sending, **add one
question**: "How many times a week do you buy food near campus? 0 · 1–2 · 3–4 ·
5 or more" — the money plan needs it (`market-analysis.md` §3).

Send it to the Kepler student email list (`docs/user-research/email-invite.md`),
with a reminder after 3 days. Go/no-go: **≥ 60%** answer 4–5 to "Would you use
Unipicks?" (`docs/user-research/google-form.md`).

## 3. Step 2 — signing food places

**Who:** food places a short walk from Kepler that students already use. Start
with the ones students name in survey Q6.

**The pitch (1 minute):**
- "Kepler students order ahead and pick up — no riders, no waiting."
- "You choose the deal and the hours (e.g. your slow 3–5 pm)."
- "You keep **98.5%** of every order (✅ Unipicks fee 1.5%, 2026-10-10).
  Delivery apps are said to take 12–28%" (unverified — see `revenue-model.md` §2).
- "Students pay by Mobile Money before you cook; they show a pickup code."

**Getting a business live (what the app already does):**
1. The owner registers as a business (name, phone, RDB number, address).
2. Unipicks' admin checks the details and approves it (Admin → Approvals now
   shows phone, email, address and RDB number).
3. The owner creates a deal — **with a price**, or students won't see it.
4. Sets the days and hours.
5. Accepts new orders quickly; the student pays; the owner checks the pickup
   code at the counter.

❓ **Before signing more businesses:** the merchant agreement (Unipicks collects
on the business's behalf and keeps 1.5%) and the **payout** from Unipicks'
UmunotaPay wallet to each business — both open items
(`docs/03-session-2026-10-03.md`). A business must know **when** it gets its
money.

## 4. Step 3 — campus ambassadors

✅ **Reward: free meals + a small bonus per active student** (2026-10-10).

- **How many:** ❓ suggestion: 3 ambassadors (about 1 per 170 students).
- **Their job:** show friends how to sign up and order; share deals in class
  WhatsApp groups; collect feedback; report problems the same day.
- **Free meals:** ❓ suggestion: ask partner food places to give each
  ambassador one free meal a week as marketing — it costs Unipicks nothing.
- **Bonus:** paid for each new student who **orders twice** (not just signs up,
  so fake sign-ups earn nothing). The app can check this: 2 picked-up orders
  in `orders`.
- 🧮 **Keep the bonus affordable:** Unipicks earns about 72 RWF per 4,800 RWF
  order. A bonus of B RWF pays back after B ÷ 72 orders from that student.
  Example: a 500 RWF bonus pays back after about 7 orders. ❓ Founder sets B.

## 5. Step 4 — reaching students

| Channel | Cost | Notes |
|---|---|---|
| Kepler student email list | Free | Survey first, then the launch email |
| Class WhatsApp groups (via ambassadors) | Free | Share a deal link: it shows a preview with the photo and price |
| Posters with a QR code at the food places and on campus | Printing | ❓ Ask Kepler which notice boards are allowed |
| "First lunch deal" at each partner | Paid by the business (its deal price) | A strong first reason to try |
| Group orders | Free | "Order with 4 friends for a better price" brings friends in |

## 6. Pricing for students

Students pay **only the deal price** — no fee (✅ 2026-10-10). Deal prices come
from the business; survey Q4 (good lunch price) guides what to suggest. Today's
deals cost 4,000–10,000 RWF; ❓ if most students answer "under 2,000 RWF",
ask businesses for smaller, cheaper student meals.

## 7. After day 90 (only if the gate is met)

1. **ALU Rwanda** (about 820 students — 🔗 [Libertify](https://www.libertify.com/universities/african-leadership-university-programs-guide/)): same playbook.
2. **One University of Rwanda campus** (UR has 30,176 students over many
   campuses — 🔗 [UR Facts and Figures 2023](https://UR.ac.rw/documents/Facts%20and%20Figures_2023.pdf)).
   ❓ Pick the campus closest to food places that already joined.

The app currently checks Kepler email addresses for "verified student"
(`app_metadata.university`). ❓ Adding a university means adding its email
domain — a small code change, done when needed.
