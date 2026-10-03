# P3: Delete Account, Phase A (Inspect & Plan)

**Status:** plan only. No code has been written. **Date:** 2026-10-03
**Source:** the repo's migrations (this branch, including the undeployed `a792821` P1, `c789ef3` P4 and `2632310` N3b). Production row counts need the query in §1.3, because this environment has no production credentials.

---

## 1. FK dependency map: every column referencing `auth.users(id)`

### 1.1 The map

41 columns across 30 tables. "Raw delete" means what `DELETE FROM auth.users` (what `admin_delete_user` does today) would do.

| Table | Column(s) | On delete | Raw delete would… | Defined in |
|---|---|---|---|---|
| **orders** | `student_id`, `merchant_id`, `dispute_raised_by` | **NO ACTION** | **fail** (any user with an order or dispute) | `20260915073805`, `20260927160000` |
| **redemptions** | `student_id` | **NO ACTION** | **fail** (any student who ever paid) | `20260830074154` |
| **deals** | `merchant_id` | **NO ACTION** | **fail** (any merchant with a deal) | `20260830073344` |
| **merchant_profiles** | `id` | **NO ACTION** | **fail** (every merchant) | `20260830142031` |
| **group_orders** | `created_by` | **NO ACTION** | **fail** (anyone who hosted a group) | `20260831060237` |
| **group_order_members** | `student_id` | **NO ACTION** | **fail** (anyone who joined a group) | `20260831060237` |
| **system_settings** | `updated_by` | **NO ACTION** | fail (admins only) | `20260903214830` |
| **transactions** | `student_id` | **CASCADE** | ⚠️ **delete payment records** | `20260904110000` |
| **chat_messages** | `sender_id`, `receiver_id` | **CASCADE** | ⚠️ **delete the other party's chat history** (pickup codes, decline reasons, dispute evidence) | `20260831070000` |
| **ratings** | `student_id` | CASCADE | ⚠️ delete ratings and change merchants' scores | `20260904090000` |
| ratings | `merchant_id` | SET NULL | orphan the merchant's ratings | `20260904090000` |
| **student_reports** | `reporter_id`, `reported_id` | CASCADE | ⚠️ **wipe reports *against* the user** (deleting the account erases the evidence) | `20260917130000` |
| notifications (merchant inbox) | `merchant_id` | CASCADE | delete inbox ✅ | `20260903193712` |
| user_notifications | `user_id` / `actor_id` | CASCADE / SET NULL | delete inbox ✅ / keep others' rows ✅ | `20260917130000` (renamed in N3b) |
| merchant_stories | `merchant_id` | CASCADE | delete ✅ (storage files orphaned) | `20260913100000` |
| user_roles | `user_id` | CASCADE | delete ✅ | `20260914000000` |
| student_profiles | `user_id` | CASCADE | delete ✅ | `20260917130000` |
| friend_requests | `sender_id`, `receiver_id` | CASCADE | delete ✅ | `20260917130000` |
| friendships | `student_a`, `student_b` | CASCADE | delete ✅ | `20260917130000` |
| blocked_students | `blocker_id`, `blocked_id` | CASCADE | delete (also removes blocks *against* them, see R7) | `20260917130000` |
| message_requests | `sender_id`, `receiver_id` | CASCADE | delete ✅ | `20260917130000` |
| student_stories | `student_id` | CASCADE | delete ✅ (views/reactions cascade) | `20260917130000` |
| student_story_views | `viewer_id` | CASCADE | delete ✅ | `20260917130000` |
| student_story_reactions | `student_id` | CASCADE | delete ✅ | `20260917130000` |
| business_follows | `student_id`, `merchant_id` | CASCADE | delete ✅ | `20260917130000` |
| student_interests | `student_id` | CASCADE | delete ✅ | `20260917130000` |
| student_saved_items | `student_id` | CASCADE | delete ✅ | `20260917130000` |
| social_content_interactions | `student_id` | CASCADE | delete ✅ | `20260917130000` |
| deal_views | `student_id` | CASCADE | delete ✅ | `20260914170000` |
| deal_searches | `student_id` | CASCADE | delete ✅ | `20260914180000` |
| activity_logs | `admin_id` | SET NULL | keep audit log ✅ | `20260903220000` |

**Indirect cascades to watch:** deleting a **deal** cascades to every student's `redemptions`, `group_orders` and `deal_views` for that deal, and sets `ratings.deal_id` / `transactions.deal_id` to NULL. A merchant's deletion must therefore **never delete their deals**.

### 1.2 Your query won't return this

Its subquery selects the column names of `auth.users`' own keys (just `id`), so it only matches FK columns that happen to be named `id`. That returns `merchant_profiles.id` and misses the other 40 columns.

### 1.3 Corrected query (validated on Postgres 16): run in the SQL Editor

```sql
select c.conrelid::regclass::text                             as table_name,
       a.attname                                              as column_name,
       case c.confdeltype when 'a' then 'NO ACTION' when 'r' then 'RESTRICT'
                          when 'c' then 'CASCADE'   when 'n' then 'SET NULL'
                          when 'd' then 'SET DEFAULT' end    as on_delete,
       (xpath('/row/n/text()', query_to_xml(
          format('select count(*) as n from %s', c.conrelid::regclass), false, true, '')))[1]::text::bigint
                                                              as table_rows,
       (xpath('/row/n/text()', query_to_xml(
          format('select count(%I) as n from %s', a.attname, c.conrelid::regclass), false, true, '')))[1]::text::bigint
                                                              as rows_with_user_set
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
 where c.contype = 'f'
   and c.confrelid = 'auth.users'::regclass
 order by on_delete, table_name, column_name;
```

It also lists Supabase's own `auth.*` tables (`identities`, `sessions`, `refresh_tokens`, `mfa_factors`, …). Those are handled by the auth admin API, not by us. **Any public table in the output that isn't in §1.1 is production drift; please flag it.**

---

## 2. Findings that shape the design

| # | Finding | Consequence |
|---|---|---|
| F1 | **Seven tables reference users with NO ACTION** (orders, redemptions, deals, merchant_profiles, group orders and members, system_settings) | A hard delete **fails** for every real user who has ordered, paid, posted a deal or joined a group |
| F2 | **The existing `admin_delete_user` is a raw `DELETE FROM auth.users`** (`20260914006000`) | It is already broken: it fails per F1, or for users without those records it silently cascades away payments (F3) and others' chats (F4). Unsafe to keep as is |
| F3 | `transactions.student_id` **CASCADE** | Deleting the user erases payment records that must be retained (§4) |
| F4 | `chat_messages` **CASCADE** on both sides | Erases the counterparty's history: pickup codes, decline reasons, dispute evidence |
| F5 | `student_reports` **CASCADE** on `reported_id` | Deleting your account wipes every report against you (abuse evasion) |
| F6 | Deal deletion cascades into other students' data | Merchant deletion must deactivate deals, never delete them |
| F7 | **Personal data is copied into plain text columns**, outside any FK:<br>• `orders.student_phone`, `merchant_phone`<br>• `transactions.phone_number`<br>• `redemptions.student_name`<br>• `group_orders.host_name`<br>• `group_order_members.student_name`<br>• `notifications.student_name`, `student_email`, `message`<br>• `activity_logs.target_name`<br>• `ratings.review`<br>• dispute notes, chat text | FK handling alone leaves personal data behind; each column needs explicit scrubbing |
| F8 | **Storage isn't FK-linked:**<br>• `deal-images/<merchantId>/…`<br>• `merchant-logos/<merchantId>/…`<br>• `story-images/merchants/<id>/…` | Files are orphaned unless they're deleted through the **Storage API**. Deleting `storage.objects` rows in SQL doesn't remove the file |
| F9 | **P1 trigger gotcha:** `set_verified_identity` preserves `app_metadata.student_id` whenever an update omits it | A plain scrub of `student_id` would be **silently resurrected** by our own trigger. The trigger must honour a `deleted_at` marker |
| F10 | Access tokens stay valid for up to an hour after deletion | Revoke refresh tokens or sessions. P4's ban flag already blocks writes during that window |

---

## 3. Recommended approach: scrub and tombstone, not physical deletion

Because of F1–F6, **don't delete the `auth.users` row.** Instead, in **one database transaction**:
- delete everything personal or social;
- anonymise the personal fields inside records that must be kept;
- turn the account into a **tombstone**: no email, no name, no password, banned, `deleted_at` set.

FKs stay valid, financial records stay intact but pseudonymous, and other users keep their own history. A scheduled purge after the retention period can be added post-MVP.

This matches common practice: WhatsApp and Instagram keep your messages in the *other* person's chat and show you as "Deleted user". Both app stores accept retaining data the law requires, as long as account data is deleted and the retention is disclosed.

### 3.1 Per-table actions

**Delete** (personal or social, no retention need):
- `student_profiles`
- friend requests, friendships, message requests
- blocks the user created
- student stories (views and reactions cascade); story views/reactions by them
- business follows, interests, saved items, content interactions
- `deal_views`, `deal_searches` (behavioural tracking)
- their `user_notifications` (rows they *caused* for others: `actor_id → NULL`)
- the merchant inbox (`notifications`)
- `merchant_stories` + storage files
- logos + storage files

**Keep, anonymised** (financial, transactional or safety records):

| Table | Keep | Scrub |
|---|---|---|
| `orders` | the row (amounts, status, dates, dispute fields) | `student_phone` → NULL (student deletion) · `merchant_phone` → NULL (merchant deletion) |
| `transactions` | the row (amount, reference, status) | `phone_number` → **masked** `078****123` (decision D3) |
| `redemptions` | the row | `student_name` → NULL |
| `ratings` | the score (anonymous aggregate already) | `review` text → NULL |
| `group_orders` / `group_order_members` | rows | `host_name` / `student_name` → `'Deleted user'` |
| `notifications` (others' merchant inbox rows about this student) | rows | `student_name`, `student_email` → NULL; `message` → generic ("Order from a deleted user") |
| `chat_messages` | messages, so counterparties keep their history | sender shown as "Deleted user" by the UI |
| `student_reports` (by and against) | rows, for moderation records | none (tombstone ID only) |
| `activity_logs` | rows (admin audit) | `target_name` → `'Deleted user'` |

**Merchant-specific:**
- `deals` → `active = false`, kept, because students' orders reference them.
- `merchant_profiles` → kept: `approved = false`, `momo_pay_code` / `logo_url` → NULL. The business name stays, as public commercial information.
- `deal-images` files: decision D5.

**Tombstone the auth user** (via the Auth admin API in the Edge Function):
- `email` → `deleted-<uuid>@deleted.unipicks.invalid`; phone cleared.
- `user_metadata` → `{}`.
- `app_metadata` → `{ deleted_at, banned: true }`, with `student_id` and `university` removed (needs the F9 trigger fix).
- Random password; `ban_duration` effectively permanent; all sessions signed out.

Because the email changes, **the person can register again later with the same university email** as a brand-new account. Old orders won't follow them; this will be documented on the deletion page.

### 3.2 Pre-checks: refuse deletion while money or obligations are in flight

| Role | Blocked if… | Message |
|---|---|---|
| Student | an order is `pending_confirmation`, `confirmed`, `payment_processing`, or `paid` but not redeemed | "Finish or cancel your active orders first." |
| Student | a dispute they raised is `open` or `under_review` | "Wait for your dispute to be resolved." |
| Student | they **host** an open group order | "Cancel or submit your group order first." |
| Merchant | any of their orders is in an active status above, or has an open dispute | "Complete or decline your active orders first." |
| Admin | always | Self-service deletion is disabled for admins: demote first, to avoid locking the platform out |

### 3.3 Architecture (Phase B)

1. **`delete_my_account()` (SECURITY DEFINER SQL, one transaction).** Runs the pre-checks, then every delete, anonymise and tombstone-flag step in §3.1. Any error rolls the whole thing back. Its core is reusable as `admin_delete_user`, which replaces the unsafe raw DELETE.
2. **`delete-account` Edge Function.** Verifies the caller's JWT, then:
   - calls the RPC;
   - updates the auth user via the admin API (email, password, ban, sign-out);
   - deletes storage files via the Storage API.

   Steps 2–3 are idempotent and safe to retry. The database step comes first, so a failure never leaves personal data behind with the account still usable.
3. **UI** (`ProfileTab`): "Delete account" → explanation of what is deleted and kept → confirm by typing your username (decision D2) → call the function → sign out → land on the public page.
4. **Public page** `/account-deletion` (no login needed, linked from Privacy and the store listings):
   - what is deleted;
   - what is retained, why, and for how long;
   - in-app steps;
   - an email request path (support@unipicks.app placeholder) for people who can't sign in, which **Google Play requires**.
5. **Tests:** a local Postgres suite using the real migrations, in the style of the N3b test, plus Deno tests for the function. Then your test account in Phase B.

Expected size: ~9–10 files (1 migration, 1 Edge Function, `ProfileTab`, a new page + route, `Privacy.jsx` link, 2 tests, CHANGELOG). **That's at your "split" threshold**, so I recommend:
- **B1:** database + Edge Function + tests;
- **B2:** UI + public page.

---

## 4. Retention (Rwanda Law N° 058/2021)

- The law requires keeping personal data **no longer than necessary for the purpose**, and allows retention where another law requires it.
- Order and transaction records are accounting and tax records. **The exact retention period under Rwandan tax and accounting rules must be confirmed with a Rwandan lawyer or the RRA.** I won't state a number I can't verify.
- Retained records keep only **pseudonymous IDs**, amounts and dates. Direct identifiers are removed (§3.1).
- The public page and Privacy Policy must state what is retained and for how long (Apple 5.1.1(v), Google Play).

---

## 5. What could go wrong

| # | Risk | Mitigation |
|---|---|---|
| R1 | Irreversible mistake (wrong account, impulsive tap) | Typed confirmation; optional grace period (D1) |
| R2 | A raw delete erases others' data (F3–F6) | Tombstone design; rewrite `admin_delete_user` onto the same path |
| R3 | P1 trigger resurrects `student_id` (F9) | Trigger honours `deleted_at`; a test asserts it |
| R4 | Partial failure between DB, Auth API and Storage | DB transaction first; idempotent retries; an orphaned-file sweep later |
| R5 | A live token is used after deletion | P4 ban blocks writes; sessions revoked; reads only see scrubbed rows |
| R6 | Deleting mid-payment, or with a paid but unredeemed order | Pre-checks (§3.2) |
| R7 | A hard delete would also erase blocks *against* the user | The tombstone avoids this: blocks they created are deleted, blocks against them stay (harmless; the tombstone can't act) |
| R8 | A group member deletes, so the group falls below `min_participants` | Members' rows are kept (anonymised), so counts don't change; open-group *hosts* are blocked |
| R9 | Other users' screens show the old name until refresh | Acceptable; names are scrubbed server-side |
| R10 | Production has FKs or columns not in the repo | Run §1.3 first; Phase B migration asserts the expected FK set and aborts on drift |
| R11 | Legal retention period unknown | Lawyer/RRA confirmation before launch (§4) |
| R12 | The same email re-registers expecting old data | Documented on the public page |

---

## 6. Decisions needed before Phase B

| # | Decision | Recommendation |
|---|---|---|
| D1 | Immediate deletion, or a grace period (e.g. 14 days, cancel by signing in)? | **Immediate for MVP** (simpler, store-compliant); grace period post-MVP |
| D2 | Confirmation: type username, or re-enter password? | **Re-enter password** (stronger; protects an unlocked phone). Typing "DELETE" plus the username is the fallback if you prefer no password step |
| D3 | `transactions.phone_number`: mask (`078****123`) or delete? | **Mask**: keeps refund/reconciliation possible with UmunotaPay, minimal data |
| D4 | Chat messages from the deleted user: keep for the counterparty ("Deleted user"), or delete? | **Keep** (WhatsApp/Instagram practice; dispute evidence) |
| D5 | Merchant `deal-images` files: delete, or keep for students' order history? | **Delete** with the account (old cards fall back to the placeholder) |
| D6 | Fix `admin_delete_user` in P3 (route it through the same scrub)? | **Yes**: today it's unsafe (F2) |
| D7 | Split Phase B into B1 (DB + function + tests) and B2 (UI + page)? | **Yes**, per your ~10-file rule |
| D8 | Retention period for financial records | Needs a lawyer/RRA answer; the page can say "as required by Rwandan law" until then |
