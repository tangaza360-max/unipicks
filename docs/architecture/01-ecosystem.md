# 1. The whole ecosystem

*Checked 2026-10-05 against the code (`src/`, `supabase/functions/`), the live
Supabase project `dylgephsnywowxxasifs` and `docs/audits/ecosystem-flow-audit.md`.*

Who uses Unipicks, and every outside service it talks to.

```mermaid
flowchart LR
  classDef people fill:#fdf3e1,stroke:#9b5e08,color:#1b1308
  classDef ours fill:#eef5e3,stroke:#547a29,color:#1b1308
  classDef outside fill:#f1f0ee,stroke:#8a8377,color:#1b1308

  S([Student<br/>phone browser]):::people
  B([Business<br/>owner / staff]):::people
  A([Admin<br/>Unipicks team]):::people

  U[["Unipicks<br/>website + database + server functions"]]:::ours

  UP[UmunotaPay<br/>payment gateway]:::outside
  MM[MTN MoMo / Airtel Money]:::outside
  PUSH[Phone alert services<br/>Google · Apple · Mozilla]:::outside
  SEN[Sentry<br/>error reports, EU]:::outside
  GEM[Google Gemini<br/>AI deal text]:::outside
  UNS[Unsplash<br/>deal photos]:::outside
  CRON[cron-job.org<br/>timer, every 60 s]:::outside
  MAIL[Supabase Auth email<br/>sign-up, password reset]:::outside

  S -- "browse deals, order, pay,<br/>chat, stories" --> U
  B -- "deals, orders, stories,<br/>chat, stats" --> U
  A -- "approvals, reports,<br/>disputes, bans" --> U

  U -- "ask for a payment" --> UP
  UP -- "MoMo prompt on the phone" --> MM
  MM -- "student confirms with PIN" --> S
  UP -- "callback: paid / failed" --> U

  U -- "order alerts" --> PUSH
  PUSH -- "notification" --> S
  PUSH -- "notification" --> B
  U -- "app crashes (no names, no phones)" --> SEN
  U -- "write a deal" --> GEM
  U -- "find a photo" --> UNS
  CRON -- "expire old orders" --> U
  U -- "confirm email, reset password" --> MAIL
  MAIL -- "email" --> S
  MAIL -- "email" --> B
```

## The people

| Who | Uses | Main things they do |
|---|---|---|
| **Student** | Phone browser (the website, can be added to the home screen) | Find deals, order alone or in a group, pay with MoMo, collect with a pickup code, chat, stories, report, dispute |
| **Business** | Phone or laptop | Register (needs approval), create deals, accept/decline orders, see stats, post stories, chat with students who ordered |
| **Admin** | Laptop | Approve businesses, handle reports (24 h) and disputes, ban, see analytics and the activity log |

## The outside services

| Service | Why Unipicks needs it | How it connects | If it is down |
|---|---|---|---|
| **UmunotaPay** | Takes MoMo / Airtel payments | Server function `process-payment` → `api.umunotapay.com` (API key + signature); UmunotaPay → `payment-webhook` (callback, signed) | Students cannot pay; orders wait, then expire. Late payments are still accepted when the callback arrives. |
| **MTN MoMo / Airtel** | The student's money | Only through UmunotaPay | Same as above |
| **Phone alert services** (Google FCM, Apple, Mozilla) | Order alerts on phones ("New order", "Order accepted", "Payment received") | Server functions send Web Push (`_shared/web-push.ts`, VAPID keys) | Alerts don't arrive; the bell inside the app still shows them |
| **Sentry** (EU) | Tells us when the app crashes | Website sends error reports (`src/lib/monitoring.js`); no names, emails or phones | We stop seeing crashes; the app works |
| **Google Gemini** | AI writes deal text for businesses | Server function `generate-deal` | "Generate with AI" fails; businesses can still type deals |
| **Unsplash** | Suggests a photo for an AI deal | Server function `generate-deal` | No suggested photo |
| **cron-job.org** | Timer: closes orders nobody answered or paid | Calls `expire-orders` every 60 s with a secret header | Old orders stay "waiting" until someone opens them (the server also checks when a business acts) |
| **Supabase Auth email** | Sign-up confirmation, password reset | Supabase sends it with our templates (`docs/email-templates/`). Which mail sender is used is **[inference: Supabase's built-in sender]** — to confirm in the Supabase dashboard; a custom domain + sender is still an open item | People cannot confirm accounts or reset passwords |

**Hosting** (where Unipicks itself runs) is on page 2: the website on
**Vercel**, everything else on **Supabase**, the code on **GitHub**.

## Not connected yet

- **Payouts to businesses**: not built; waiting for UmunotaPay's answer.
- **Refunds**: plan approved 2026-10-05 (`refund-plan`), not built yet.
- **Payment status check** (`reconcile-payments`): built, **switched off**
  (`RECONCILE_ENABLED` not set, no timer job).
