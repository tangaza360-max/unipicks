# Unipicks — Changelog

One entry per deploy. Newest first. Format:
`YYYY-MM-DD HH:MM — type(scope): short description — files touched`

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `perf`

---

## 2026-10-03

- 17:30 — `docs(audit)`: notifications audit (in-app/Web Push scope, all roles) and student profile audit with merchant appendix — `docs/audits/notifications-audit.md`, `docs/audits/profile-audit.md`, `docs/audits/README.md`
- 17:00 — `fix(orders)`: redeem_pickup_code RPC redeems the code and moves the parent order paid → redeemed in one transaction; VerifyCode calls it; merchant UPDATE on redemptions removed — `supabase/migrations/20261003170000_add_redeem_pickup_code_rpc.sql`, `src/pages/VerifyCode.jsx`, `supabase/tests/redeem_pickup_code.test.sh`
- 16:05 — `fix(group-orders)`: create-group-order-payment rejects groups below the deal's min_participants (409, "needs N more member(s)"); Deno tests with in-memory Supabase fake — `supabase/functions/create-group-order-payment/index.ts`, `supabase/functions/tests/`
- 15:30 — `fix(orders)`: price orders by offer_type (fixed_amount, bogo, fixed_price; reject tiered/free_shipping), reject expired deals; order summary mirrors server pricing — `supabase/functions/create-order/index.ts`, `src/pages/OrderConfirmation.jsx`
- 15:10 — `fix(security)`: payment-webhook fails closed without secret (503), verifies HMAC-SHA256 of raw body or shared secret in constant time, optional IP allowlist, structured rejection logs — `supabase/functions/payment-webhook/index.ts`
- 14:55 — `fix(security)`: revoke student INSERT on redemptions; merchant code check requires a paid parent order — `supabase/migrations/20261003145500_revoke_student_redemption_insert.sql`, `src/pages/VerifyCode.jsx`
- 14:15 — `fix(group-orders)`: center My Groups page with max-w-xl wrapper — `src/pages/GroupOrders.jsx`
- 13:50 — `fix(group-orders)`: page gutters + even-width action buttons — `src/pages/GroupOrders.jsx`
- 12:30 — `feat(group-orders)`: redesign as "My Groups" with hosting + joined sections, deal thumbnails, progress bars, skeletons, empty states — `src/pages/GroupOrders.jsx`
- 11:55 — `feat(merchant)`: live group activity line on group-buy deal cards — `src/pages/MerchantDeals.jsx`
- 11:30 — `feat(group-orders)`: get_merchant_group_activity() RPC — `supabase/migrations/20261003102534_*.sql`
- 11:00 — `feat(group-orders)`: get_open_groups_for_deal() RPC + open-groups list on deal detail + prefill join code from URL — `supabase/migrations/20261003100909_*.sql`, `src/pages/DealDetail.jsx`, `src/pages/GroupOrders.jsx`
- 10:30 — `feat(group-orders)`: create-group-order-payment Edge Function + group_order_id column on orders — `supabase/functions/create-group-order-payment/index.ts`, `supabase/migrations/20261003092115_*.sql`, `src/pages/GroupOrders.jsx`
- 10:00 — `fix(group-orders)`: remove stray backticks, restrict Start dropdown to group_buy deals — `src/pages/GroupOrders.jsx`
- 09:15 — `feat(search)`: multi-tab student search (People / Businesses / Deals) + search_merchants RPC — `src/pages/StudentSearch.jsx`, `src/components/StudentLayout.jsx`, `supabase/migrations/20261003083422_*.sql`
- 08:30 — `fix(deals)`: hide offer badge when percentage deal has no discount value — `src/pages/DealsFeed.jsx`
- 08:00 — `feat(deals)`: offer-type badges (BOGO, group buy, bundle, etc.) on every deal card — `src/pages/DealsFeed.jsx`
- 07:30 — `feat(deals)`: multi-offer-type merchant form (dynamic fields + live preview + safe validation defaults) — `src/pages/MerchantDeals.jsx`, `supabase/migrations/20261001033906_*.sql`
- 07:00 — `feat(nav)`: URL-based dashboard tabs + back-button + per-route page titles — `src/main.jsx`, `src/pages/Dashboard.jsx`, `src/components/StudentLayout.jsx`, and 7 other files
- 06:30 — `feat(chat)`: sender names + role badges in chat threads — `src/components/ChatThread.jsx`
- 06:00 — `fix(generate-deal)`: remove stray shell heredoc lines from Edge Function — `supabase/functions/generate-deal/index.ts`
- 05:30 — `chore(ai)`: migrate generate-deal from OpenAI to Gemini 2.5 Flash (blocked by Google 403; fallback active) — `supabase/functions/generate-deal/index.ts`

---

## Workflow: adding a new entry

Before committing a deploy, prepend a new line to today's section (or create today's section if it's a new day) using this shape:

    - HH:MM — \`type(scope)\`: short description — \`file paths\`

Then commit with the deploy:

    git add -A && git commit -m "<same message as changelog>" && git push && vercel --prod

The changelog entry and the commit message should describe the same change.
