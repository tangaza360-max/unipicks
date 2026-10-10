# Instructions for AI coding assistants (GitHub Copilot, Claude, others)

Unipicks is a student food-deals app for Kepler College, Kigali: React 18 +
Vite + Tailwind CSS 3.4 on Vercel, Supabase (Postgres, Auth, Storage, Edge
Functions) behind it. Read this before suggesting code. The longer sources are
`docs/style-guide.md` (design) and `docs/architecture/` (how the parts connect).

## 1. Code style

- **React function components and hooks only.** No class components.
- Routing with `react-router-dom` v7 (`BrowserRouter`, no data loaders). Shared logic in `src/lib/`, shared UI in
  `src/components/`, screens in `src/pages/`.
- Match the code around you: its naming, comment density and idioms.
- Pure logic (prices, rules) goes in `src/lib/*.js` so it can be unit-tested
  (`supabase/functions/tests/`).
- Money with `formatMoney()` (`4,800 RWF`); dates as `4 Oct 2026` (`en-GB`).

## 2. Colors and design

- **Use the semantic tokens, never hard-coded colors**: `bg-primary`,
  `text-primary-foreground`, `text-accent`, `bg-card`, `bg-muted`,
  `text-muted-foreground`, `border-border`, `status-bad` / `status-good`…
  No hex values or raw palette classes (`bg-purple-600`, `text-blue-400`) in
  screens. The only exceptions are listed in `docs/style-guide.md` §1
  (e.g. `bg-red-600` behind white text for Delete and count badges).
- Text contrast **≥ 4.5:1** in light **and** dark mode; tap targets
  **≥ 44 × 44 px** (`min-h-11`); no text under 12 px (WCAG 2.2 AA).
- Every icon-only button has an `aria-label`; decorative icons get
  `aria-hidden="true"`; every input has a `<label>`.
- **Plain, simple English** for users: no codes (`pending_confirmation` ✗ →
  "Waiting for you" ✓), "Business" not "Merchant", no exclamation marks.
- Every screen handles **loading, empty and error** states
  (`docs/style-guide.md` §9). Errors say what happened and what to do.
- Mobile first (390 px wide, no sideways scroll), then desktop.

## 3. Security rules (never break these)

- **Never put the service role key in the website.** The browser only has
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (`src/lib/supabaseClient.js`).
  `SUPABASE_SERVICE_ROLE_KEY` and other secrets (`UMUNOTA_*`, `VAPID_*`,
  `CRON_SECRET`) live **only** in Edge Functions (`Deno.env.get`). Never log,
  print or commit a secret; never commit `.env`.
- **Every table has Row Level Security on**, with policies written as
  `(select auth.uid())`. A new table without policies is a bug.
- **Roles come from the server, never from `user_metadata`.** Users can edit
  their own `user_metadata`. The role lives in `user_roles` and the app reads
  it with `supabase.rpc('get_my_role')`; the database checks it again in every
  policy and function (`private.is_admin()`, `can_post_student_story()`…).
  Hiding a button is not security — the database must refuse too.
- **`security definer` functions** set `search_path = ''`, check who is
  calling, `revoke all … from public` (and `anon` unless visitors need it), and
  `grant execute` only to the roles that need it.
- Other businesses' details come through `get_businesses()` /
  `get_receipt_seller()` only; students' names and photos follow
  `can_see_student_avatar()`. Don't read those tables directly.
- Never trust prices, totals or statuses from the browser: the server
  recomputes them (`supabase/functions/create-order`).
- Links taken from data go through `safeNext()` / an allow-list.

## 4. Database changes

- A change = a **new** file `supabase/migrations/YYYYMMDDHHMMSS_name.sql`.
  Never edit a migration that is already in production. Make it safe to run
  twice (`if exists`, `create or replace`).
- Add or extend a test in `supabase/tests/*.test.sh` (builds a local Postgres
  from every migration).
- People, not assistants, run `supabase db push`, `supabase functions deploy`
  and `vercel --prod`.

## 5. Commits

- Format: `type(scope): short summary` — types `feat`, `fix`, `refactor`,
  `perf`, `style`, `test`, `docs`, `chore`. Example:
  `fix(a11y): all buttons and stand-alone links at least 44x44 px`.
- **One change per commit.** The body says why, the test evidence, and the
  standard followed (e.g. WCAG 2.2 SC 2.5.8, OWASP A01).
- Add an entry at the top of `docs/CHANGELOG.md` (newest first).
- When how the parts connect changes, update `docs/architecture/*.md`.
- A pre-commit hook runs `npm run build`; fix the error rather than skipping it.

Before committing, go through `CODE_REVIEW.md`.
