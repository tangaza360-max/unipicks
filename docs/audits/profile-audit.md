# Unipicks — Profile Page Audit

**Date:** 2026-10-03 · **Branch:** `claude/unipicks-codebase-audit-9vd6fb`
**Scope:** the student profile in full (`src/components/ProfileTab.jsx`, rendered by `StudentLayout.jsx:210`; the brief's `src/pages/ProfileTab.jsx` path doesn't exist), plus a short merchant appendix (`src/pages/MerchantProfile.jsx`).
**Navigation assumed:** the **current** mobile nav (Home · Search · [Camera] · Group Orders · Profile; `StudentBottomNav.jsx:12-28`). Changes that the decided-but-unbuilt D1 nav would bring are noted where relevant.

> **Code state.** Includes commits `7c5fb93` and `43a0d2f`, **committed but not yet deployed to production**. Neither touches the profile page.

> **Citations.** Formal sources used:
> - **WCAG 2.1** §1.4.3 Contrast (Minimum, AA, 4.5:1); §1.3.1 Info and Relationships (A); §2.4.7 Focus Visible (AA); §4.1.2 Name, Role, Value (A); §2.5.5 Target Size (44×44 px).
> - **WCAG 2.2** §2.5.8 Target Size (Minimum).
> - **Apple App Store Review Guideline 5.1.1(v)**: apps that support account creation must let users initiate account deletion within the app.
> - **Google Play's account deletion requirement** (User Data policy): in-app deletion plus a web link where users can request deletion.
> - **ISO 9241-11:2018**: usability as effectiveness, efficiency and satisfaction in a context of use.
>
> Two corrections to the brief's citations:
> 1. **§2.5.5 (44×44) is Level AAA in WCAG 2.1, not AA.** The AA floor is WCAG 2.2 §2.5.8 (24×24 CSS px). This audit treats 44 px as the target (it matches Apple HIG's 44 pt minimum) and 24 px as the hard floor.
> 2. **I couldn't verify an "IDEO design principles for mobile settings screens" standard, so it isn't cited.**
>
> Layout conventions from Instagram, Uber, Airbnb and Shopify customer accounts, and iOS Settings / Material list rows, are labelled **common practice**.

---

## 🔴 Security finding: students can rewrite their university and student ID

**What happens**
- The "Account Information" edit form lets a student change **University** and **Student ID** (`ProfileTab.jsx:443-469`).
- `handleSave` writes them into the signed-in user's own account data with `supabase.auth.updateUser({ data: { university, student_id, … } })` (`ProfileTab.jsx:166-182`).
- In Supabase, this data (`raw_user_meta_data`) is **writable by the user themselves**. Removing the form fields wouldn't close the hole: any student can call `auth.updateUser` from the browser console.

**Why it matters**
- **Admins see those self-edited values as fact.** `AdminStudentView.jsx:184-185`, the `get_all_students` RPC (`20260914005000_replace_get_all_students_auth.sql:20-21`; `20260914007000:21-22`) and the student lookup (`20260904000000_fix_student_lookup_return_types.sql:31-32`) all read `raw_user_meta_data->>'university'` and `->>'student_id'`.
- **Verification itself still holds.** Signup checks the email domain (`Register.jsx:39-45`), and the email can't be changed from the profile.
- **But the labels around it can be spoofed after signup.** A student verified at Kepler can relabel themselves as another university, or change their student ID to someone else's. An admin investigating a dispute or report would trust the wrong identity.
- That undermines the product principle *"Verified student status protects the value of student pricing"* (product doc §10). It becomes a real problem the moment a second university launches with different deals.
- **The social profile repeats the issue.** `student_profiles.university` and `campus` are free text the student edits (`ProfileTab.jsx:721-750`) and shows to other students.

**Recommended fix (smallest change)**
1. **Move verified identity to server-owned storage.** Supabase's `raw_app_meta_data` can only be written by the service role. A migration adds:
   - a trigger on `auth.users` insert that **derives `university` from the email domain** (not from the form), copies the signup `student_id`, and writes both to `app_metadata`;
   - a one-off backfill for existing users, using each user's email domain.
2. **Point the admin RPCs and `AdminStudentView`** at `raw_app_meta_data` instead of `raw_user_meta_data`.
3. **Make University and Student ID read-only** in the profile, with a verification badge ("✓ Verified · @keplercollege.ac.rw"). Student ID changes become an admin action.
4. **Lock `student_profiles.university`** to the verified value: set it in the same trigger and drop it from the editable social form. Campus becomes a dropdown.

Size: about 4 files and 1 migration. **🔴 Blocking MVP** (identity integrity for admins and future multi-university pricing).

*Related, lower risk:* **phone** is also in `user_metadata`, and `create-order` copies it onto orders as `student_phone` (`create-order/index.ts:113`). That's acceptable (it's a contact number), but it's unverified. Verify it when MoMo payment links the number (post-MVP).

---

## Current layout vs proposed

```
CURRENT (ProfileTab.jsx, top → bottom)               PROPOSED (common practice: Instagram/Uber/Airbnb accounts)
┌──────────────────────────────────────────┐        ┌──────────────────────────────────────────┐
│ Account Information              [Edit]  │ :394   │  (photo)  Aline Uwase            [Edit]  │
│ ( A )  Aline Uwase                       │ :530   │           @aline · Kepler · Kigali       │
│        aline@keplercollege.ac.rw         │        │           ✓ Verified student             │
│        [student]   ← role chip           │ :541   │  "Bio text…"                             │
│ 📞 Phone ............ 0788…               │        ├──────────────────────────────────────────┤
│ 🎓 University ....... Kepler  ← editable! │        │   12 orders   ·   8 friends   ·   3 saved │
│ 🪪 Student ID ....... K123    ← editable! │        ├──────────────────────────────────────────┤
│ ✉  Email ............ aline@…            │        │ ACTIVITY                                 │
├──────────────────────────────────────────┤        │ 🧾 Order history         (2) needs action ›│
│ Social Profile                   [Edit]  │ :620   │ ♥  Saved deals                         › │
│ @aline · Aline U. · Kepler · Kinyinya    │        │ 👥 Friends & requests                  › │
│ description / bio                        │        ├──────────────────────────────────────────┤
│ Discoverability            [toggle] ✅   │ :870   │ PAYMENTS                                 │
├──────────────────────────────────────────┤        │ 📱 MoMo number (for checkout)          › │
│ Order History                         →  │ :912   ├──────────────────────────────────────────┤
├──────────────────────────────────────────┤        │ SETTINGS                                 │
│ Settings                                 │ :930   │ 🔔 Notifications  (real, with push)    › │
│ ▢ Appearance   Dark mode [toggle] ✅     │ :932   │ 🔒 Privacy: discoverability, blocked   › │
│ ▢ Notifications  Messages / Friend req / │ :963   │ 👤 Account: email, phone, password     › │
│   Orders / Deals / Events  ← NO TOGGLES  │        │ 🌙 Appearance                          › │
│ ▢ Privacy & Security  Password / Blocked │ :992   ├──────────────────────────────────────────┤
│   / Other  ← NOT CLICKABLE               │        │ SUPPORT                                  │
│ ▢ Communication  "coming soon"           │ :1016  │ 💬 Help & support                      › │
│ ▢ Account  Change password /             │ :1033  │ 📄 Terms · Privacy policy              › │
│   Delete account "coming soon"           │        ├──────────────────────────────────────────┤
│ ▢ About  Terms · Privacy · v0.1.0        │ :1056  │        Log out                           │
├──────────────────────────────────────────┤        │        Delete account                    │
│ [ Log out ]  (red-400)                   │ :1086  │        v0.1.0                            │
└──────────────────────────────────────────┘        └──────────────────────────────────────────┘
```

Notes on the proposal:
- **One header, one Edit button.** Merges the duplicate name/university fields from the two current cards.
- **Rows use icon + label + chevron**, grouped under section headers on subtle background panels (iOS Settings / Material list common practice).
- **No "Addresses" section.** Unipicks is pickup-only, so an address book isn't applicable until delivery exists.
- **When D1 ships** (Group Orders moves into Home), "My Groups" can also be linked from the Activity group here.

---

## 2B-1. Header and identity

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Avatar with edit affordance** | ❌ | Initial letter in a circle (`ProfileTab.jsx:530-532`); no upload | No photo; nothing suggests it's editable | Add a photo upload (Storage bucket `avatars`, ≤1 MB, EXIF stripped) with a camera badge on the avatar. Photos need moderation (social audit D5) | 🟢 |
| **Display name + @username** | ⚠️ | Header shows `full_name` (`:535`); @username appears only in the Social card (`:840`) | Two names (auth `full_name` vs social `display_name`); @handle not in the header | One identity header: display name + @username | 🟡 |
| **University + campus** | ⚠️ | University row (`:563`), campus in the Social card | Split across cards, and **user-editable** (security finding) | Read-only verified university; campus from a dropdown | 🔴 (security) |
| **Verification badge** | ❌ | A generic role chip "student" (`:541`) | No sign that the email was verified, though verification is the core trust feature (product doc §10) | "✓ Verified student · @keplercollege.ac.rw", from server-owned data | 🟡 |
| **Bio, character-limited** | ⚠️ | Editable bio (`:769-775`); **no `maxLength`** in the form, no length check in `student_profiles` | Unbounded text breaks layout and invites spam | `maxLength={150}` (Instagram's limit, common practice) + DB `check (char_length(short_bio) <= 150)` | 🟢 |

## 2B-2. Stats and primary action

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Stats row** (orders, friends, saves) | ❌ | None | No at-a-glance value ("I've used Unipicks 12 times"), which feeds the product's return habit (§3) | Three counts from `orders`, `friendships`, `student_saved_items` (all queryable under existing RLS) | 🟢 |
| **Prominent "Edit profile"** | ❌ | Two separate text-link "Edit"s (`:405`, `:643`): `text-sm text-accent`, about 20 px tall | Below WCAG 2.2 §2.5.8's 24 px floor and far below the 44 px target. Light-mode contrast **2.04:1** (accent on background, measured in the e-commerce audit), failing §1.4.3 | One full-size "Edit profile" button (`min-h-11`) under the header, opening a single edit screen | 🟡 |

## 2B-3. Sections

| # | Section | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|---|
| 1 | **Order history** (with status badges) | ✅ / ⚠️ | Row at `:912-927` opens `OrdersTab` (`:385`), which has `StatusBadge` per order | Placed third, below two identity cards; no "needs action" indicator (notifications audit S1) | Move it to the top of an "Activity" group; add the needs-action badge | 🟡 |
| 2 | **Saved deals / favourites** | ❌ | `student_saved_items` table exists (`20260917130000:366-379`); no UI anywhere | Students can't save deals | Heart on deal cards + "Saved deals" row | 🟢 |
| 3 | **Payment method / MoMo number** | ❌ | Checkout starts with an empty phone field every time (`PaymentCheckout.jsx:14`); the profile phone isn't reused | Re-typing the MoMo number on every order adds friction (ISO 9241-11 *efficiency*) | "MoMo number" row (MTN 078/079 or Airtel 072/073, same pattern as `PaymentCheckout.jsx:7`); pre-fill checkout from it | 🟡 |
| 4 | **Addresses** | n/a | Pickup-only product | — | Revisit with delivery | — |
| 5 | **Notification preferences** | ❌ misleading | 5 display-only rows with **no toggles** (`:963-990`): Messages, Friend requests, Orders, Deals, Events | Implies control that doesn't exist; Deals and Events notifications don't exist | **Remove now; rebuild as real toggles with Web Push.** Reasoning in notifications audit §2A-5 | 🟡 |
| 6 | **Privacy controls** | ⚠️ | Discoverability toggle works (`:870-900`). "Blocked students" and "Other privacy controls" are non-clickable text (`:992-1015`) | Can't view or unblock blocked students from the profile; the placeholder text looks like a control | "Blocked students" list with Unblock (RPC `unblock_student` already exists). Remove the "Other privacy controls" placeholder | 🟡 |
| 7 | **Account settings** (email, password, phone) | ❌ | "Change password" is non-clickable text (`:1043`); email isn't changeable; phone is editable (`:427-437`) | No password change (`supabase.auth.updateUser({ password })` is one call); the "Communication… coming soon" card (`:1016-1031`) adds noise | Real "Change password" screen; remove the Communication card until email exists | 🟡 |
| 8 | **Help / support** | ❌ | None | No way to get help besides disputes, so users have no path for account problems (ISO 9241-11 *effectiveness*) | "Help & support" row: a WhatsApp link to the support number and/or an email, plus a short FAQ | 🟡 |
| 9 | **Legal** | ✅ | Terms and Privacy buttons (`:1066, 1073`), app version | Rows are about 32 px tall (`pt-3 text-sm`) | Standard list rows (`min-h-11`) | 🟢 |
| 10 | **Delete account** | ❌ | "Delete/deactivate account… coming soon", non-clickable (`:1044`); only the admin RPC `admin_delete_user` exists | **Fails Apple 5.1.1(v)** and **Google Play's account-deletion requirement**, which will block the planned app-store release (roadmap Phase 3). Also needed for Law N° 058/2021 erasure requests | "Delete account": confirm by typing the username → a SECURITY DEFINER RPC that anonymises orders and ratings (keeping financial records), deletes the social profile, friendships and messages, then the auth user. Plus a public web deletion-request page for Google Play | 🔴 (store launch) · 🟡 (web MVP) |
| — | **Sign out** | ✅ / ⚠️ | `:1086-1093`, `text-red-400` | Light-mode contrast **2.66:1** (fails §1.4.3); about 40 px tall | `text-red-700` on light (≥4.5:1), `min-h-11` | 🟡 |

## 2B-4. Visual structure (common practice)

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Clean dividers, subtle panels** | ⚠️ | Every group is a bordered card (`rounded-xl border border-border bg-card`), and every row adds `border-t` (`:932-1084`) | Borders inside borders make it look heavy and busy | Grouped panels with subtle `bg-muted/40` backgrounds, a section caption above each, hairline dividers between rows only | 🟢 |
| **Icon + label + chevron rows** | ❌ | Only Order History has an arrow (`:925`); settings rows have no icons and no chevrons; some look tappable but aren't (`:978-1050`) | Users can't tell what's interactive (ISO 9241-11 *effectiveness*) | A shared `ProfileRow` component: icon · label · optional value/badge · chevron. Only rendered when the row does something | 🟡 |
| **Consistent spacing** | ✅ / ⚠️ | `space-y-4`/`pt-5`/`pt-6` mix | Minor inconsistency | 16 px row padding, 24 px between groups | 🟢 |

## 2B-5. Mobile-first

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Tap targets ≥ 44 px** (WCAG 2.1 §2.5.5 target; 2.2 §2.5.8 floor 24 px) | ❌ | Edit links about 20 px (`:398-405`, `:636-643`); Discoverability switch 24 px tall (`:881-893`, `h-6 w-11`); Terms/Privacy about 32 px; Log out about 40 px. ✅ Theme row and Order History row are full width | Several controls below 44 px; the Edit links are below even the 24 px floor | `min-h-11` on every row and button; make the whole row the switch's hit area | 🟡 |
| **One-handed reachability** | ⚠️ | Edit buttons top right; long single scroll | Common practice: frequent actions in the lower two-thirds. Here, "Order history" sits below two large cards | The proposed order puts Activity (order history) right under the compact header | 🟢 |
| **No horizontal scroll** | ✅ | Email truncation fixed (`:610`, dev history 2026-09-27) | — | — | — |
| **Loading states per async section** | ⚠️ | Whole page shows text "Loading profile…" (`:360-361`); the social card has its own loading flag (`:45`) | Text-only and page-blocking; `Skeleton.jsx` exists but is unused here | Skeleton header + per-section skeletons | 🟢 |

## 2B-6. Accessibility (WCAG 2.1 AA)

| Item | Status | Evidence | Gap | Recommended fix | Priority |
|---|---|---|---|---|---|
| **Contrast ≥ 4.5:1** (§1.4.3) | ⚠️ | Dark mode passes (7.3–8.7:1). Light mode: accent "Edit" links **2.04:1**; `text-red-400` errors (`:366, 504`) and Log out **2.66:1** | Light mode fails | Darker light-mode tokens (see e-commerce audit §11) | 🟡 |
| **Accessible labels** (§1.3.1, §4.1.2) | ❌ | **0 `htmlFor` and 0 input `id`s** in `ProfileTab.jsx`: every `<label className="field-label">` (`:413-490, 679-771`) is visually next to its input but not programmatically associated. ✅ The Discoverability switch has an `aria-label` (`:883`) | Screen readers announce "edit text, blank" without the field name | `id` + `htmlFor` on every field, or wrap the input in the label | 🟡 |
| **Focus visible** (§2.4.7) | ⚠️ | Inputs have a `:focus` style (`src/index.css:146`); buttons and rows have none (repo-wide, only 2 `focus-visible` usages) | Keyboard users lose their place | Global `:focus-visible` ring | 🟡 |

---

## Merchant profile: brief appendix (`src/pages/MerchantProfile.jsx`)

Not a deep dive; these are the obvious issues only.
- **Business identity is self-editable after approval.** `business_name` and other fields are updated directly on `merchant_profiles` (`MerchantProfile.jsx:63-70`). Only the `approved` flag is protected (`20260914002000_prevent_merchant_self_approval.sql`), so an approved merchant can rename themselves without re-review. → Lock the name (and future RDB number) after approval, or send changes back to `pending`. 🟡
- **MoMo Pay code is optional** (`:70`), but under the founder's merchant-directed payout decision it's required. → Make it required and validated before approval (e-commerce audit decision 1). 🔴 when payouts are built
- **No delete-account or support entry** (same Apple 5.1.1(v) / Google Play requirement applies to merchants). 🔴 for store launch
- **Logo upload works** (`:104-131`) ✅. No size or type check client-side beyond the file picker. 🟢

---

## Top 10 prioritized actions

| # | Action | Standard | Files | Migration | MVP? |
|---|---|---|---|---|---|
| 1 | **Verified identity is server-owned:** university derived from the email domain into `app_metadata`; admin views read it; University/Student ID read-only with a verified badge | Product §10; data integrity | ~4 | 1 (trigger + backfill) | 🔴 blocking |
| 2 | **Delete account** (student + merchant), with confirm, anonymising RPC and a web request page | Apple 5.1.1(v); Google Play account deletion; Law 058/2021 | ~3 | 1 (RPC) | 🔴 for store launch |
| 3 | **Remove fake settings rows** (Notifications toggles, "Other privacy controls", "Communication… coming soon", non-clickable "Change password") | ISO 9241-11 effectiveness; honest UI | 1 | no | 🟡 (quick win) |
| 4 | **Change password** screen | Account management common practice | 1–2 | no | 🟡 |
| 5 | **Restructure into header + grouped rows** (single Edit profile, `ProfileRow` icon/label/chevron, Order history first with needs-action badge) | Common practice; WCAG §2.5.5 target | 2–3 | no | 🟡 |
| 6 | **Blocked students list with Unblock** | Social safety (social audit §6) | 1–2 | no | 🟡 |
| 7 | **Accessibility pass:** label association, `:focus-visible`, light-mode contrast for accent/red, `min-h-11` targets | WCAG §1.3.1, §4.1.2, §2.4.7, §1.4.3, §2.5.5 | 2 | no | 🟡 |
| 8 | **MoMo number saved in profile + pre-filled at checkout** | ISO 9241-11 efficiency | 2 | maybe (column) | 🟡 |
| 9 | **Help & support row** (WhatsApp/email + short FAQ) | ISO 9241-11 effectiveness; app-store expectation of a support contact | 1 | no | 🟡 |
| 10 | **Stats row, saved deals, avatar upload, bio limit** | Common practice (Instagram/Airbnb) | ~5 | 1 (avatars bucket + bio check) | 🟢 post-MVP |

---

## Open questions
1. **Student ID after signup:** should students be able to *request* a correction (admin approves), or is it fixed at signup?
2. **Support channel:** WhatsApp number, email, or both? I need the actual contact to put in the "Help & support" row.
3. **Avatar photos:** they need moderation (social audit D5). OK to defer to post-MVP as proposed?
