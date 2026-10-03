# Unipicks — Audit & Research Deliverables

Everything produced on branch `claude/unipicks-codebase-audit-9vd6fb` (2026-10-03), in one place.

## Deliverables

| # | Deliverable | Location | Summary | Status |
|---|---|---|---|---|
| 1 | E-Commerce Standards Audit | [`ecommerce-audit.md`](./ecommerce-audit.md) | 14-point audit against WCAG 2.1, ISO 20488/32111, Rwanda Laws 058/2021 and 36/2012, OWASP. Top risks: self-made pickup codes, unverified payment webhook, wrong price for 4 offer types, group discount below the minimum, no refunds or merchant settlement. Includes founder decisions (merchant-directed payouts, BOGO, free delivery, group minimum, eu-west-3 region). | ✅ Final |
| 2 | Social App Standards Audit | [`social-audit.md`](./social-audit.md) | 12 points plus the mobile-nav finding, against Instagram/WhatsApp/Facebook norms and Apple/Google store rules. Founder decisions D1–D5: nav = Home · Search · Social · Profile · Camera (Group Orders moves into Home); friends-or-accepted-request messaging and merchants only messaging past customers (migration spec included); stories are v2 and the camera becomes "Snap & share"; admin reports with a 24h SLA (admin Reports UI is a gap). | ✅ Final |
| 3 | 30-Second Explainer Video | [`../video-explainer/`](../video-explainer/) | `unipicks-explainer.mp4` (1080×1920) and `unipicks-explainer-16x9.mp4` (1920×1080), 30.0 s each, on-screen text only. Plus `script.md` (63-word voiceover), `storyboard.md` (frame-accurate), `assets.md` (royalty-free music, CapCut steps, pre-publish accuracy checklist) and the re-renderable source (`explainer.html` + `render.mjs`). | ✅ Final |
| 4 | Student Feedback Google Form | [`../user-research/`](../user-research/) | 12 questions in 5 sections (7 required, about 2 minutes): spec with rationale, paste-ready text, one-click Apps Script, Forms API JSON, distribution and analysis plan. v1: English only, no incentive; Kinyarwanda is v2 (see `README.md` there). | ✅ Final |

## App code changes (founder-approved, not yet deployed)

| Commit | Fix | Verified by |
|---|---|---|
| `efbc86c` | Students can no longer insert `redemptions` (self-made pickup codes); `VerifyCode` requires a paid order | Local Postgres 16 RLS test |
| `e05c266` | `payment-webhook` fails closed (503) without its secret; constant-time HMAC or shared-secret verification; optional IP allowlist; structured rejection logs | 8 Deno tests + `deno check` |
| `88158ea` | `create-order` prices by `offer_type`, rejects tiered, free_shipping and expired deals; order summary mirrors it | 29 Deno parity tests + build |
| `7c5fb93` | `create-group-order-payment` rejects groups below `min_participants` | 5 Deno tests in `supabase/functions/tests/` |

Run the committed tests from the repo root:
```bash
deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
```

**To deploy:**
1. Set `UMUNOTA_WEBHOOK_SECRET` **first**: `supabase secrets set UMUNOTA_WEBHOOK_SECRET=…`.
2. `supabase db push`.
3. `supabase functions deploy payment-webhook create-order create-group-order-payment`.
4. Deploy the frontend.

## Decided, but code still needs approval

- Social D1: mobile nav change (`StudentBottomNav.jsx` + a "My Groups" entry on Home).
- Social D2/D3: `chat_messages` RLS migration (spec in `social-audit.md` §3).
- Social D4: "Snap & share" camera relabel + removing the placeholder story tray.
- Social D5: admin Reports queue UI to meet the 24h SLA.
- E-commerce: merchant-directed payouts using `momo_pay_code`; reject `free_shipping` at deal creation; refunds table; light-mode contrast; privacy policy rewrite (eu-west-3 disclosure, NCSA).
