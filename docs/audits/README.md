# Unipicks — Audit & Research Deliverables

Everything produced on branch `claude/unipicks-codebase-audit-9vd6fb` (2026-10-03), in one place.

## Deliverables

| # | Deliverable | Location | Summary | Status |
|---|---|---|---|---|
| 1 | E-Commerce Standards Audit | [`ecommerce-audit.md`](./ecommerce-audit.md) | 14-point audit against WCAG 2.1, ISO 20488/32111, Rwanda Laws 058/2021 and 36/2012, OWASP. Top risks: self-made pickup codes, unverified payment webhook, wrong price for 4 offer types, group discount below the minimum, no refunds or merchant settlement. Includes founder decisions (merchant-directed payouts, BOGO, free delivery, group minimum, eu-west-3 region). | ✅ Final |
| 2 | Social App Standards Audit | [`social-audit.md`](./social-audit.md) | 12 points plus the mobile-nav finding, against Instagram/WhatsApp/Facebook norms and Apple/Google store rules. Founder decisions D1–D5: nav = Home · Search · Social · Profile · Camera (Group Orders moves into Home); friends-or-accepted-request messaging and merchants only messaging past customers (migration spec included); stories are v2 and the camera becomes "Snap & share"; admin reports with a 24h SLA (admin Reports UI is a gap). | ✅ Final |
| 3 | 30-Second Explainer Video | [`../video-explainer/`](../video-explainer/) | `unipicks-explainer.mp4` (1080×1920) and `unipicks-explainer-16x9.mp4` (1920×1080), 30.0 s each, on-screen text only. Plus `script.md` (63-word voiceover), `storyboard.md` (frame-accurate), `assets.md` (royalty-free music, CapCut steps, pre-publish accuracy checklist) and the re-renderable source (`explainer.html` + `render.mjs`). | ✅ Final |
| 4 | Student Feedback Google Form | [`../user-research/`](../user-research/) | 7 questions on one page (5 one-tap, 4 required; 2 optional typing; about 1 minute; Kigali only; calm design, no emojis): spec with rationale, paste-ready text, one-click Apps Script, Forms API JSON, distribution and analysis plan. v1: English only, no incentive; Kinyarwanda is v2 (see `README.md` there). | ✅ Final |
| 5 | Notifications Audit | [`notifications-audit.md`](./notifications-audit.md) | In-app + Web Push scope (email should-add, SMS post-MVP), all three roles. Top findings: students get order updates only as merchant chat messages; `payment-webhook` never sends the pickup code; no admin dispute alerts; no expiry or payment-failure notices; group chats never show unread; fake preference rows; no out-of-app channel. | ✅ Final |
| 6 | Profile Page Audit | [`profile-audit.md`](./profile-audit.md) | Student profile in full + merchant appendix. Top findings: **students can rewrite university and student ID** (admins trust it); no in-app account deletion (Apple 5.1.1(v), Google Play); non-functional settings rows; no password change, help, saved deals or stats; tap targets, label association and light-mode contrast. | ✅ Final |
| 7 | UmunotaPay API Research | [`umunotapay-api-research.md`](./umunotapay-api-research.md) | From their OpenAPI file and dashboard screenshots. Status endpoint `GET /api/v1/payments/{reference}/status` with API key + HMAC (empty body for GET, 5-min window); recommended reconciler env values; still unknown: response shape, status values, which reference, payment timeout, webhook signing/retries (4 questions for support + one production SQL). | 🟡 Waiting on UmunotaPay |
| 8 | Ecosystem Flow Audit (Project 2) | [`ecosystem-flow-audit.md`](./ecosystem-flow-audit.md) | 9 journeys end to end across app, database, Edge Functions, UmunotaPay and cron, with an order state map and a verified-vs-untested table. Urgent: unverified emails get a Verified identity and student prices; chat RLS holes still live; late payments are kept but the order expires (no refund). Also: checkout page never updates; stuck `payment_processing` (reconciler off) blocks disputes and deletion; merchants never see dispute alerts; bans don't stop merchants; no payouts; dead group orders. | ✅ Final — fixes 1–9 applied (see its status update) |

**Work log for 2026-10-03** (everything done, deploy checklist, open items): [`../03-session-2026-10-03.md`](../03-session-2026-10-03.md)

## App code changes (founder-approved, not yet deployed)

| Commit | Fix | Verified by |
|---|---|---|
| `efbc86c` | Students can no longer insert `redemptions` (self-made pickup codes); `VerifyCode` requires a paid order | Local Postgres 16 RLS test |
| `e05c266` | `payment-webhook` fails closed (503) without its secret; constant-time HMAC or shared-secret verification; optional IP allowlist; structured rejection logs | 8 Deno tests + `deno check` |
| `88158ea` | `create-order` prices by `offer_type`, rejects tiered, free_shipping and expired deals; order summary mirrors it | 29 Deno parity tests + build |
| `7c5fb93` | `create-group-order-payment` rejects groups below `min_participants` | 5 Deno tests in `supabase/functions/tests/` |
| `43a0d2f` | `redeem_pickup_code` RPC redeems the code and moves the order `paid → redeemed` in one transaction; `VerifyCode` calls it; merchant UPDATE on `redemptions` removed | 18 checks in `supabase/tests/redeem_pickup_code.test.sh` (local Postgres 16) |

Run the committed tests from the repo root:
```bash
deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
```

**To deploy:**
1. Set `UMUNOTA_WEBHOOK_SECRET` **first**: `supabase secrets set UMUNOTA_WEBHOOK_SECRET=…`.
2. `supabase db push`.
3. `supabase functions deploy payment-webhook create-order create-group-order-payment` (`supabase db push` in step 2 also applies the `redeem_pickup_code` migration).
4. Deploy the frontend.

## Decided, but code still needs approval

- Social D1: mobile nav change (`StudentBottomNav.jsx` + a "My Groups" entry on Home).
- Social D2/D3: `chat_messages` RLS migration (spec in `social-audit.md` §3).
- Social D4: "Snap & share" camera relabel + removing the placeholder story tray.
- Social D5: admin Reports queue UI to meet the 24h SLA.
- E-commerce: merchant-directed payouts using `momo_pay_code`; reject `free_shipping` at deal creation; refunds table; light-mode contrast; privacy policy rewrite (eu-west-3 disclosure, NCSA).
