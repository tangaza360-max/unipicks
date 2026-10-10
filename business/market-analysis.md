# Market analysis — student food deals in Rwanda

_Written 2026-10-10. Legend: 🔗 published source (link) · 🧮 our calculation (formula shown) · ❓ assumption or open question · ✅ founder decision._

> **How sure are these numbers?** The links come from web search results. The
> pages themselves could not be opened from the build machine, so **open each
> link and check the number before you show it to an investor or a partner.**

## 1. Who the customers are

Unipicks has two customers:

1. **Students** who want cheaper food near campus and a quick way to order it.
2. **Food businesses near campus** that want more student customers, especially
   on slow days and hours (see `docs/01-product.md` §4).

## 2. How many students — TAM, SAM, SOM

| Level | Meaning | Students | Source |
|---|---|---|---|
| **TAM** — all of Rwanda | Every student in higher education | **about 88,400** (2020/21, latest national count found) | 🔗 [ESSA policy brief 2024](https://essa-africa.org/sites/default/files/inline-files/ESSA%20Rwanda%20DAF%20Policy%20Brief%202024.pdf) — down from about 91,000 in 2016/17 |
| | Share of young people in higher education | **9%** (2024), up from 7.4% (2019) | 🔗 [Higher Education Council, Nov 2025](https://africa2025.csefrs.ma/wp-content/uploads/2025/12/0-kadozi-African-Conference-HEC-Rwanda-PPT.pdf) |
| **SAM** — the next campuses we could serve | Kepler (Kigali) + ALU Rwanda + University of Rwanda | **about 31,500** 🧮 = 500 + 820 + 30,176 | see the three rows below |
| | University of Rwanda | **30,176** (2023), many campuses | 🔗 [UR Facts and Figures 2023](https://UR.ac.rw/documents/Facts%20and%20Figures_2023.pdf) |
| | ALU Rwanda (Kigali) | **about 820** (third-party guide); campus built for 1,200 | 🔗 [Libertify guide](https://www.libertify.com/universities/african-leadership-university-programs-guide/) · 🔗 [MASS Design](https://massdesigngroup.org/work/design/african-leadership-university) |
| **SOM** — what we can reach in 90 days | Kepler College, Kigali campus only (✅ 2026-10-10) | **about 500+** | 🔗 [CauseIQ](https://causeiq.com/organizations/kepler,200934525) · 🔗 [Wikipedia](https://en.wikipedia.org/wiki/Kepler_(institution)) — Kepler's own 2023 note says **2,500+ enrolled over time** across Kigali and Kiziba ([kepler.org](https://kepler.org/kepler-celebrates-graduation-of-163/)) |

❓ **Get the real Kepler number:** ask Kepler's student office for the current
Kigali headcount. It is the most important number in this plan and no
published source gives a dated figure.

❓ **University of Rwanda has many campuses.** Pick **one** UR campus near
Kepler for the second step and get that campus's own headcount.

## 3. How much money — the market in RWF

Money = students × lunches bought near campus per week × price per lunch.

We **do not know** two of these numbers yet:

- **Price per lunch:** the survey asks it (Q4, price bands from under 1,000 to
  over 3,000 RWF). Today's live deals cost **4,000 – 10,000 RWF**
  (production, read-only, 2026-10-10).
- **Lunches per week:** nobody has measured it. ❓ **Add one question to the
  survey before sending it:** "How many times a week do you buy food near
  campus? 0 · 1–2 · 3–4 · 5 or more".

🧮 **Example only (replace with survey answers):** if 500 Kepler students each
buy 2 lunches a week near campus at 2,000 RWF, that is
500 × 2 × 2,000 = **2,000,000 RWF a week** spent on food near Kepler. This is
the pool the food businesses compete for — **not** Unipicks' income (see
`revenue-model.md`).

## 4. Competitors

| Who | What they do | Overlap with Unipicks | Source |
|---|---|---|---|
| **Vuba Vuba** | Food and shop **delivery** in Kigali, Rubavu, Musanze, Rusizi; 600+ businesses; started 2020 when Jumia Food left | Same food places; but delivery (higher cost, slower), not student-only prices | 🔗 [CNBC Africa 2020](https://cnbcafrica.com/2020/exit-jumia-food-enter-vuba-vuba-md-albert-munyabugingo-on-how-new-food-delivery-service-plans-to-cater-to-rwandan-market) · 🔗 [Africa Business Heroes](https://africabusinessheroes.org/en/the-prize/finalists/detail/202) |
| **Jumia Food** | Food delivery — **left Rwanda** (Vuba Vuba was founded by its former Rwanda head after the exit); closed food delivery in 7 more countries in Dec 2023 | No longer a competitor in Rwanda | 🔗 [CNBC Africa 2020](https://cnbcafrica.com/2020/exit-jumia-food-enter-vuba-vuba-md-albert-munyabugingo-on-how-new-food-delivery-service-plans-to-cater-to-rwandan-market) · 🔗 [TechCrunch 2023](https://techcrunch.com/2023/12/14/jumia-discontinues-food-delivery-across-seven-markets-shifts-focus-to-expanding-physical-goods-business) · 🔗 [The EastAfrican](https://theeastafrican.co.ke/tea/business/jumia-to-close-down-food-delivery-business-4465006) (lists a related story "Jumia suspends food delivery service in Rwanda"; its date was not found) |
| **Glovo** | Delivery app in Kenya, Uganda, Nigeria and others | **No evidence it operates in Rwanda** (searched 2026-10-10) | 🔗 [Digest Africa](https://digestafrica.com/spanish-logistics-glovo-launches-nairobi) (only says it "might" come to Rwanda one day) |
| **Campus Discounts** (Kenya) | Students see discounts from businesses near their campus | The closest model to Unipicks — but in Kenya, not Rwanda | 🔗 [Capital FM](https://capitalfm.africa/tech-platform-offers-kenyan-students-location-based-discounts/) |
| **Walking to the canteen and paying cash** | What most students do today | ❓ Our inference: this is the real competitor. Survey Q3 (how do you pay) and Q5 (what could stop you) will measure it | — |

No student-discount app for Kigali showed up in search (2026-10-10).

**Lesson from Jumia Food:** Jumia said its food business was never profitable
and blamed "very high" costs and heavy competition
(🔗 [TechCrunch 2023](https://techcrunch.com/2023/12/14/jumia-discontinues-food-delivery-across-seven-markets-shifts-focus-to-expanding-physical-goods-business)).
Unipicks avoids the biggest cost — riders — because students **pick up**.

## 5. Why Unipicks can win

1. **Student-only prices** (verified students only — `docs/03-session-2026-10-03.md`).
2. **Pick-up, not delivery:** no riders, so cheaper for everyone.
3. **Order ahead in 3 taps**, and **group orders** with friends.
4. **Social:** likes, comments, friends, stories — students bring each other.
5. **Built for one campus first**, so it can feel personal.

## 6. Risks

| Risk | What we do |
|---|---|
| Too few food places (today: **1**, Mr. Chips) | Sign 5+ before launch (`go-to-market.md`) |
| Students prefer cash | Survey Q3 and Q5; show the pickup-code guarantee |
| Unipicks' 1.5% fee may not cover the payment cost | Ask UmunotaPay its fee (`revenue-model.md` §3) |
| Kepler is small (about 500 students) | Prove it works, then add ALU and one UR campus |
| Payment money sits in Unipicks' wallet before reaching the business | Already an open item (UmunotaPay payouts, `docs/03-session-2026-10-03.md`) |
