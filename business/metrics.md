# Metrics — the numbers to watch

_Written 2026-10-10. Legend: 🧮 calculation · ❓ open question · ✅ founder decision._

Each number below says **what it means**, **why it matters**, and **how to
count it** from the Unipicks database (Supabase → SQL editor; these queries
only read). Remove your own test accounts before counting
(❓ list their ids once, e.g. in a `test_accounts` note).

"Active student" = a student who **viewed a deal, searched, or ordered** that
day/week/month (the app records views in `deal_views`, searches in
`deal_searches`, orders in `orders`).

## 1. The 7 numbers

| # | Number | Meaning | Why it matters |
|---|---|---|---|
| 1 | **WAU** (weekly active students) | Active students in the last 7 days | Are students using it every week? For a lunch app, **weekly** fits better than daily |
| 2 | **MAU** (monthly active students) | Active students in the last 30 days | Size of the real audience; compare with Kepler's headcount |
| 3 | **Orders per active student per month** | Picked-up orders ÷ MAU | The habit: "check Unipicks first" |
| 4 | **Repeat rate** | % of students who ordered in a month and order again the next month | The single best sign it works |
| 5 | **Active businesses** | Approved businesses with at least 1 picked-up order in the last 30 days | Students need choice |
| 6 | **GMV** (gross merchandise value) | Total RWF of picked-up orders | Money flowing to food places |
| 7 | **Take rate and Unipicks revenue** | Revenue ÷ GMV; revenue = 1.5% × GMV (✅ 2026-10-10) | Should equal 1.5% — minus payment costs once known (`revenue-model.md` §3) |

Plus two health checks:
- **Order success rate:** picked up ÷ all orders. Low means businesses decline or students don't pay in time.
- **Business retention:** % of businesses active this month that are still active next month.

## 2. How to count them

Order statuses in production (2026-10-10): `paid`, `redeemed` (picked up),
`declined`, `confirmation_expired`, `payment_expired`. **Picked up = `redeemed`.**

```sql
-- 1 & 2. Weekly and monthly active students
with activity as (
  select student_id, viewed_at as at from public.deal_views
  union all select student_id, searched_at from public.deal_searches
  union all select student_id, created_at from public.orders
)
select
  count(distinct student_id) filter (where at > now() - interval '7 days')  as wau,
  count(distinct student_id) filter (where at > now() - interval '30 days') as mau
from activity;
```

```sql
-- 3, 6, 7. Picked-up orders, GMV and Unipicks revenue, last 30 days
select
  count(*)                                   as picked_up_orders,
  count(distinct student_id)                 as ordering_students,
  round(count(*)::numeric / nullif(count(distinct student_id), 0), 2) as orders_per_ordering_student,
  sum(total_price)                           as gmv_rwf,
  round(sum(total_price) * 0.015)            as unipicks_revenue_rwf
from public.orders
where status = 'redeemed' and created_at > now() - interval '30 days';
```

```sql
-- 4. Repeat rate: ordered last month AND this month
with m as (
  select student_id, date_trunc('month', created_at) as month
  from public.orders where status = 'redeemed' group by 1, 2
)
select
  count(*) filter (where exists (select 1 from m n where n.student_id = m.student_id
                                 and n.month = m.month + interval '1 month')) * 100.0
  / nullif(count(*), 0) as repeat_rate_pct
from m
where m.month = date_trunc('month', now()) - interval '1 month';
```

```sql
-- 5. Active businesses (last 30 days) and order success rate
select
  (select count(distinct merchant_id) from public.orders
    where status = 'redeemed' and created_at > now() - interval '30 days') as active_businesses,
  round(100.0 * count(*) filter (where status = 'redeemed') / nullif(count(*), 0), 1) as order_success_pct
from public.orders
where created_at > now() - interval '30 days';
```

**Checked 2026-10-10** (production, read-only — all queries run). The result
is the founder's own **test** orders, so it is not a baseline: WAU 2, MAU 2,
19 picked-up orders from 1 student, GMV 92,800 RWF (🧮 average 4,884 RWF per
order), 1.5% = 1,392 RWF, 1 active business, order success 32.8% (many test
orders were left to expire).

❓ Later: put these on the **Admin → Analytics** page so nobody has to run SQL.

## 3. Targets for the first 90 days at Kepler

❓ **These are proposals, not decisions** — the founder should confirm or
change them. They are set for about **500 students** at Kepler.

| Number | Day 30 | Day 60 | Day 90 | Why this level |
|---|---|---|---|---|
| Survey: % answering 4–5 to "Would you use Unipicks?" | ≥ 60% | — | — | The go/no-go already set in `docs/user-research/google-form.md` |
| Active businesses | 3 | 5 | 8 | Students need choice before they form a habit |
| MAU | — (soft launch starts week 5) | 100 (20%) | 150 (30%) | 🧮 % of 500 students; about 50 by week 6 (README plan) |
| Repeat rate | — | ≥ 30% | ≥ 40% | The real proof; below 20% means something is wrong |
| Orders per ordering student / month | — | 3 | 4 | About 1 lunch a week |
| Order success rate | ≥ 80% | ≥ 85% | ≥ 90% | Below this, fix declines and payment timeouts first |

**Gate at day 90 (✅ Kepler only for 90 days):** move to ALU and one UR campus
only if **repeat rate ≥ 40%** and **8+ active businesses**. If not, fix Kepler
first.
