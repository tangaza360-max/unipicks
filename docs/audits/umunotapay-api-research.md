# UmunotaPay API research — for `reconcile-payments`

Date: 2026-10-03. Research only: no code, secrets or deploys changed.
Goal: the values needed to turn on `supabase/functions/reconcile-payments` (`RECONCILE_ENABLED`, `UMUNOTA_STATUS_ENDPOINT`, `UMUNOTA_STATUS_METHOD`, `UMUNOTA_STATUS_AUTH_STYLE`).

---

## 1. Sources consulted

| # | Source | Date | Result |
|---|---|---|---|
| S1 | `https://pay.umunotapay.com` (direct fetch from the build environment) | 2026-10-03 | **Blocked** by this environment's network policy, not by UmunotaPay. Not used. |
| S2 | `https://api.umunotapay.com` (direct fetch) | 2026-10-03 | **Blocked** (same reason). Not used. |
| S3 | Screenshot, UmunotaPay testing dashboard → Developers (`pay.umunotapay.com`) | 2026-10-03 | Three sections: Integrations, API keys, Cashbox demo |
| S4 | Screenshot, Developers → Integrations (top of page) | 2026-10-03 | Base URL, OpenAPI download, rails, Setup / Payouts / Collect / Checkout tabs |
| S5 | Screenshot, Developers → Integrations → "Authentication & request signing" | 2026-10-03 | Headers and signature message |
| S6 | OpenAPI file downloaded from S4 ("Download OpenAPI"): `UmunotaPay Gateway API`, version `1.0.0`, OpenAPI 3.0.3, 279 KB | 2026-10-03 | All endpoints; no response schemas for the merchant API |
| S7 | Our own code: `supabase/functions/process-payment/index.ts` (collect call), production `transactions.webhook_payload` key list given by the founder | 2026-10-03 | How we already call UmunotaPay |

The OpenAPI file was not added to the repo (it is UmunotaPay's document).

---

## 2. Confirmed facts (stated in their docs)

### Base URL and environments
- Base URL: `https://api.umunotapay.com` — "Use this host in all examples and Postman imports." **[S4]**
- There is a separate **testing dashboard** ("You are on the testing dashboard. Press Become Live when you are ready for real money.") **[S3, S4]**
- Rails: MTN MoMo, Airtel, Bank, RWF. **[S4]**
- The OpenAPI file's `servers` entry is only `http://localhost:8000` ("Local development"); the real host comes from S4. **[S6]**

### Payment status endpoint (question 1)
- **`GET /api/v1/payments/{reference}/status`**, summary "payment status", tag "Merchant API". **[S6, `paths./api/v1/payments/{reference}/status`]**
- `reference` is a required **path** parameter (string). **[S6]**
- Collect is `POST /api/v1/payments` ("Collect payment (phone → wallet)"), body `amount` (required), `phone` (required), `description`, `merchant_reference`, `service_fee`, `product_id`. **[S6]** This matches what `process-payment` sends. **[S7]**

### Authentication and signing (question 2)
- Merchant `/api/v1/*` uses **API key + HMAC**: `X-API-Key` (`pk_*`) plus `X-Timestamp`, `X-Nonce`, `X-Signature`. **[S5, S6 info.description, securitySchemes `ApiKeyAuth` = header `X-API-Key`]**
- The status endpoint itself requires `X-Timestamp`, `X-Nonce`, `X-Signature` and `ApiKeyAuth`. **[S6]** So the HMAC is required on the status call, not only the API key.
- Signature: **HMAC-SHA256 hex of `METHOD\nPATH\nRAW_BODY\nTIMESTAMP\nNONCE`, signed with the `whsec_` secret.** **[S5, S6]**
- "Join with newlines (no trailing newline) … Use the exact raw body bytes you send (**empty string for GET**)." **[S5]** → for the status call the message is `GET\n/api/v1/payments/<ref>/status\n\n<timestamp>\n<nonce>`.
- `X-Timestamp`: Unix seconds, must be within a window, **default 300 seconds**. **[S5 "5 min window", S6]**
- `X-Nonce`: min 8 characters, single use; reuse within the window → **409 "Replay detected"**. **[S5, S6]**
- `Idempotency-Key` (8–128 chars) is required on **money-moving POSTs**. **[S5, S6]** The status GET does not list it. **[S6]**

### Webhooks (part of question 4)
- UmunotaPay keeps a log of **payment callback delivery attempts**: `GET /auth/payment-webhook-deliveries` ("Institution inspects payment callback delivery attempts"). **[S6]**
- A missed delivery can be replayed: `POST /auth/payment-webhook-deliveries/{delivery_id}/retry` ("Replay a payment callback delivery the integrator missed or that exhausted its retries"). **[S6]** So automatic retries exist and can be exhausted.
- Both are `/auth/*` endpoints, which use **JWT** (dashboard login), not the API key. **[S6 info.description]**

### Bonus
- **Payouts to a phone:** `POST /api/v1/transfers` — "Cash out from the UmunotaPay wallet linked to your API key to a MoMo/Airtel phone number … Wallet is debited on verified success (not on 201)"; response "Transaction object (typically status=pending)". **[S6]**
- **Splits / routing:** products hold a destination and splits by wallet number (`82…`); "Institutions may pass `product_id` to apply saved destination + splits." Sub-account payments and transfers exist (`/api/v1/sub-account/payments`, `/api/v1/sub-account/transfers`). **[S6]**
- **Balance:** `GET /api/v1/balance` (API key). **[S6]**
- **Transaction list:** `GET /auth/transactions` exists, but it is `/auth/*` (JWT), not an API-key endpoint. No API-key "list payments" endpoint is listed. **[S6]**
- **Sandbox:** the testing dashboard (S3/S4). How test payments behave is not described in what we have.

---

## 3. Inferred (not stated — reasoning given)

1. **`{reference}` is most likely UmunotaPay's own reference** (our `umunota_reference`), not our `merchant_reference`. Reasons: the path is `/payments/{reference}`, and the collect response we store contains a `reference` key **[S7]**, which `process-payment` saves as `umunota_reference`. Our reconciler already uses `umunota_reference` first and falls back to `merchant_reference`, so it works either way **if** the endpoint accepts the one it receives. Not confirmed.
2. **The signing secret is the one we already use.** `process-payment` signs with `UMUNOTA_WEBHOOK_SECRET`; the docs say sign with the `whsec_` secret **[S5]**. If that env var holds the `whsec_…` value (it must, since collect calls work), the status call will verify too.
3. **The reconciler's HMAC already matches the documented scheme**: it signs `METHOD\nPATH+QUERY\nBODY\nTIMESTAMP\nNONCE` with an empty body for GET and a UUID nonce (36 chars ≥ 8). The status path has no query string, so `PATH+QUERY` = `PATH`.
4. **Pending payments can stay pending on their side**: their own staff endpoint is "Reconcile a pending MoMo/Airtel payment via ITECPay verify" (`GET /dashboard/staff/transactions/{lookup}/status`) **[S6]**. This suggests UmunotaPay itself sometimes has to verify pending payments with the upstream processor (ITECPay), i.e. a "pending" answer can be temporary. It says nothing about how long.

---

## 4. Unknown (must ask UmunotaPay, or check in production)

| # | Question | Why it matters |
|---|---|---|
| U1 | **Response shape of `GET /api/v1/payments/{reference}/status`**: where is the status field? The spec only says "object" and points to `docs/API.md`, which is not in the file. **[S6]** | The reconciler reads `status`, `data.status`, `payment_status`, `data.payment_status`. If it is elsewhere, every check counts as `errored` (safe, but useless). |
| U2 | **Full list of status values** and their meaning (especially any "expired", "reversed", "refunded", "partially…" values). | A wrong mapping could mark an unpaid order paid, or a paid one failed. Unknown values are already treated as `errored` (no action). |
| U3 | **Which reference** goes in `{reference}`: their `reference`, `itecpay_trans_id`, `request_id`, or our `merchant_reference`? | Wrong one → 404 → `errored`. |
| U4 | **Payment timeout**: after how long does an unanswered MoMo/Airtel prompt fail? **Can a payment complete more than 24 hours after it started?** | Decides if the 24-hour "abandoned" rule is safe. |
| U5 | **Webhook retry schedule** (how many tries, over how long) and **webhook signature**: header name and how it is computed for payment callbacks. | Our `payment-webhook` accepts an HMAC of the raw body or a shared-secret header; confirm which one they send. |
| U6 | Settlement timing to merchants (T+0 / T+1) and whether payouts can go straight to a merchant's MoMo code. | Bonus; not blocking. |

**U1 and U2 can be partly answered from our own production data, without asking anyone.** The `status` key already exists in stored collect responses (S7). This query reads only status words (no personal data):

```sql
select webhook_payload->>'status' as provider_status, status as our_status, count(*)
  from public.transactions
 group by 1, 2
 order by 3 desc;
```

It shows the status words UmunotaPay has really returned so far. It will not show values that have not happened yet (for example a timeout), so U2 still needs their answer.

---

## 5. Recommended env var values

Based on S4–S6:

```
UMUNOTA_STATUS_ENDPOINT   = https://api.umunotapay.com/api/v1/payments/{ref}/status
UMUNOTA_STATUS_METHOD     = GET
UMUNOTA_STATUS_AUTH_STYLE = hmac
RECONCILE_ENABLED         = false   (keep off until U1–U3 are answered)
```

Existing secrets stay as they are: `UMUNOTA_API_KEY` (the `pk_…` key) and `UMUNOTA_WEBHOOK_SECRET` (the `whsec_…` secret).

**Before setting `RECONCILE_ENABLED=true`:**
1. Run the SQL in §4 and compare the status words with the reconciler's lists (`supabase/functions/reconcile-payments/index.ts`, `PAID` / `FAILED` / `PENDING`). Any word that is missing, or that could mean something else, must be confirmed with UmunotaPay first.
2. Get answers to U1, U3 and U4.
3. Then enable it and watch the first runs' `[reconcile-payments]` log lines. An `errored:provider HTTP 404` means the wrong reference (U3); `errored:…no recognised status` means the status field or a value is not in our lists (U1/U2). Neither changes any order.

---

## 6. Questions for UmunotaPay support (smallest set)

1. For `GET /api/v1/payments/{reference}/status`: which value goes in `{reference}` — the `reference` returned by `POST /api/v1/payments`, or our `merchant_reference`? Please send one example response (success, failed and pending).
2. What are all possible payment status values, and which ones are final?
3. How long can a collect payment stay pending? Can it ever succeed more than 24 hours after it was started?
4. For payment webhooks: how is the request signed (header name and signed content), and how many times / for how long do you retry if our endpoint returns an error?
