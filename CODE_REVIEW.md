# Code review checklist

Paste this into Claude (or go through it yourself) **before every commit**,
with the diff (`git diff --staged`). Rules behind each item:
`.github/copilot-instructions.md` and `docs/style-guide.md`.

> Review the diff below against this checklist. For each item answer
> ✅ / ❌ / n/a, and for every ❌ give the file, the line and the fix.

## 1. It works
- [ ] **Loading, empty and error states** are all handled — no blank screen,
      no endless spinner; the error says what to do next.
- [ ] Double taps can't send twice (button disabled while saving).
- [ ] Nothing new in the browser console (no errors, no stray `console.log`).

## 2. Data and security
- [ ] **Supabase queries are RLS-safe:** a new table has RLS on and policies
      using `(select auth.uid())`; nothing relies on the browser to hide data.
- [ ] **Roles are checked on the server** (policy or function), not only by
      hiding a button; never read a role from `user_metadata`.
- [ ] **Role-specific screens check the role** before showing anything
      (`get_my_role`), and show a plain message to the wrong role.
- [ ] **No secrets:** no service role key, API key, token or `.env` value in
      the code, the commit or a log line.
- [ ] `security definer` functions set `search_path = ''`, check the caller and
      grant execute only to who needs it.
- [ ] Prices, totals and statuses are computed by the server.
- [ ] Other people's data comes only through the safe functions
      (`get_businesses`, `get_student_avatars`, …).

## 3. Design
- [ ] **No hard-coded colors** (no hex, no `bg-purple-…`, `text-blue-…`); only
      tokens or the exceptions listed in the style guide.
- [ ] **Responsive:** 390 px phone (no sideways scroll, nothing cut off) and
      desktop.
- [ ] Light **and** dark mode: text contrast ≥ 4.5:1.
- [ ] Tap targets ≥ 44 px; icon buttons have an `aria-label`; inputs have labels.
- [ ] Words are plain English, money as `4,800 RWF`, dates as `4 Oct 2026`.

## 4. Tests and records
- [ ] A test proves the change (unit, database or browser) — or the commit
      gives steps to check it by hand.
- [ ] Database change = a new migration file + a test in `supabase/tests/`.
- [ ] `npm run build` passes (the pre-commit hook runs it).
- [ ] Commit message `type(scope): summary`, one change only, with test
      evidence and the standard followed.
- [ ] `docs/CHANGELOG.md` entry added; `docs/architecture/` updated if
      connections changed.
- [ ] `agents/support-agent.md` updated if a rule users ask about changed
      (timers, order labels, disputes, refunds, approval, account steps).
- [ ] Deploy steps written down if the founder must run `supabase db push`,
      `supabase functions deploy` or `vercel --prod`.
