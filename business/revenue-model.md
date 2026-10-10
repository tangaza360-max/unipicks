# Revenue model

_Written 2026-10-10. Legend: 🔗 published source · 🧮 our calculation · ❓ open question · ✅ founder decision._

## 1. How Unipicks earns money

✅ **Founder decision (2026-10-10): Unipicks keeps 1.5% of each order, paid by
the business. Nothing else.** Students pay only the deal price. No monthly
subscription, no paid ("sponsored") deals for now.

This fits the model already agreed: **Unipicks is a marketplace agent** — the
food place sells, Unipicks collects the payment on its behalf and keeps only
its fee (`docs/03-session-2026-10-03.md`).

🧮 **What 1.5% means per order** (prices of today's live deals):

| Order | Unipicks keeps (1.5%) | Business gets (before payment costs) |
|---|---|---|
| 2,000 RWF | 30 RWF | 1,970 RWF |
| 4,000 RWF (Tacos Tuesday) | 60 RWF | 3,940 RWF |
| 4,800 RWF (Burger Thursday) | 72 RWF | 4,728 RWF |
| 10,000 RWF (After Class Thursday, group) | 150 RWF | 9,850 RWF |

## 2. Why 1.5% is attractive to businesses

- Delivery apps in Africa are said to take **12–28%** of each order — ❓ these
  figures come from a blog, not from the companies, so treat them as
  unverified (🔗 [Kolonell](https://kolonell.com/en/blog/last-mile-delivery-startup-africa-stack-2026)).
  Jumia Food in Morocco reportedly charged **15–20%** (🔗 [Le360](https://fr.le360.ma/economie/dans-les-coulisses-de-la-livraison-des-repas-indiscretions-sur-la-bataille-sans-merci-entre-glovo-et-241945/), unnamed sources).
- MTN MoMo Pay itself charges the business **0.5% above 4,000 RWF** (free
  below), and a business may **not** pass that fee to the customer
  (🔗 [The New Times](https://www.newtimes.co.rw/business/bnr-warns-merchants-against-transferring-momo-pay-charges-clients)).

So **1.5% is a very easy "yes"** for a food place. The pitch: _"Students who
already want to eat, at your slow hours, and you keep 98.5%."_

## 3. 🔴 The big risk: the payment cost may be bigger than 1.5%

Every Unipicks payment goes through **UmunotaPay**. Its fee is **not
published**. Other payment services in Rwanda list **1.4% to 3.5%** per
payment (🔗 [paymentproviders.io](https://paymentproviders.io/country/rw)).
If UmunotaPay charges more than 1.5% and Unipicks pays it, **Unipicks loses
money on every order.**

🧮 Example, a 4,800 RWF order: Unipicks keeps 72 RWF. A 2% payment fee is
96 RWF. Result: **−24 RWF per order**.

❓ **Ask UmunotaPay before launch** (add to the 4 questions already waiting,
`docs/audits/umunotapay-api-research.md` §6):
1. What is your fee per collection, and per payout to a business?
2. Who pays it — can it be taken from the business's share?
3. What is the `service_fee` field in your payment request for?

❓ **Then decide one of:**
- the payment fee is taken from the **business's share** (Unipicks still
  keeps its 1.5%), or
- raise the Unipicks fee so it covers the payment fee, or
- Unipicks pays it while small, as a launch cost (and knows how much).

## 4. 🧮 How many orders cover the costs

Unipicks' monthly costs are not written down anywhere yet. ❓ **Fill this in:**

| Cost per month | RWF |
|---|---|
| Supabase (database) | |
| Vercel (website) | |
| Domain and email (none yet — Gmail is used) | |
| Ambassadors (free meals + bonuses, see `go-to-market.md`) | |
| Phone, internet, transport | |
| **Total** | |

🧮 Orders needed per month = total costs ÷ Unipicks' share per order.
At a 4,800 RWF average order and **no** payment fee for Unipicks:
**every 100,000 RWF of monthly costs needs about 1,389 orders a month**
(100,000 ÷ 72).

🧮 What Kepler alone can give (example — replace with the survey's
"lunches per week"):

| Students ordering | Orders each per week | Orders per month (×4) | Unipicks per month (×72 RWF) |
|---|---|---|---|
| 50 (10% of 500) | 1 | 200 | 14,400 RWF |
| 150 (30%) | 2 | 1,200 | 86,400 RWF |
| 250 (50%) | 3 | 3,000 | 216,000 RWF |

**What this shows:** at 1.5%, Kepler alone earns little. The first 90 days are
for **proving students come back** (see `metrics.md`), not for profit. Profit
needs more campuses, more orders per student, or — later — a different fee.

## 5. Options for later (not decided — the founder chose 1.5% only)

Kept here so they are not forgotten. Revisit after day 90 with real numbers.

| Option | Idea | When it could make sense |
|---|---|---|
| Higher % per order | e.g. 5–10%, still below delivery apps | When businesses see many extra orders |
| Small student fee | e.g. a fixed amount per order | If students value order-ahead and group orders enough |
| Paid business plan | Monthly fee for extra tools (stories, stats, top position) | When 20+ businesses compete for attention |
| Sponsored deals | A business pays to appear first on Home | Same; must be clearly labelled "Sponsored" |

## 6. Check with an accountant / lawyer

❓ VAT and tax on Unipicks' fee, invoices to businesses, and the merchant
agreement for "collecting on behalf of" the seller. Not checked here.
