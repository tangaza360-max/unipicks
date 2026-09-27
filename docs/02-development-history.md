# Unipicks — Development History & Technical Decisions

## 1. Purpose

This document records important technical work, security decisions, testing decisions, product-development decisions, and unresolved issues in Unipicks.

It exists so future developers, AI assistants, and the founder can understand:

- what has already been done
- why it was done
- what must not be broken
- what remains unfinished
- where future development should continue

**Product source of truth:** `docs/01-product.md`

**Technical history and decision record:** `docs/02-development-history.md`

---

## 2. Development Philosophy

The Unipicks development workflow follows these principles:

1. Inspect existing work before changing it.
2. Do not rebuild working features unnecessarily.
3. Preserve existing functionality.
4. Make small changes.
5. Test after meaningful changes.
6. Commit stable checkpoints.
7. Solve the actual problem instead of repeatedly investigating the same problem.
8. Keep important security decisions documented.
9. Use the product blueprint as the source of truth for product decisions.
10. Future AI development should understand the existing architecture before modifying it.

Unipicks is also a learning project. Development should help the founder understand why something works, why a decision was made, what problem a change solves, and how the system behaves.

---

## 3. Product Foundation

Unipicks is a **university student companion**.

The initial focus is food, with future possibilities including:

- events
- recreation
- student services
- other student-focused experiences

The central product idea is:

> "Someone actually thought about me as a student."

The long-term product habit is:

> "If I want something, let me check Unipicks first."

The complete product vision is documented in:

`docs/01-product.md`

Future product development must follow that document.

---

## 2026-09-25 — Automated Order Expiry (Fixes lingering pending_confirmation orders)
- **Problem**: Orders past their `confirmation_deadline` stayed in `pending_confirmation` forever because the expiry check only ran when a merchant manually accepted/declined.
- **Solution**: Created new Edge Function `expire-orders` to find and expire these orders automatically.
- **Security**: Added `CRON_SECRET` to Supabase secrets; function requires `x-cron-secret` header to run.
- **Scheduling**: Configured cron-job.org to POST to the function every 1 minute.
- **Verification**: Manual test expired 2 older orders. Cron history shows successful 200 OK runs every minute.

## 2026-09-27 — Task 3 + 3.5 + 3.6: Student Order History

### Task 3 — Normal orders now visible to students
- `OrdersTab.jsx` now queries the `orders` table with `deals` and `redemptions(code)` joins.
- New "Your orders" section shows status, quantity, total, decline reason + note, pickup code.

### Task 3.5 — Toggle polish
- Toggle moved to the right of its label (platform convention).
- Default state changed to ON (complete record on first open — IS 19598).
- Label renamed "Show cancelled orders" → "Show all orders".
- Section header "Ordered deals" → "Completed Orders".

### Task 3.6 — Dedicated Order History page
- Profile now shows a clickable "Order History →" row.
- Tapping opens a dedicated page with `← Back to Profile`, page title, and full Order History.
- Toggle behavior aligned with standards:
  - **ON** (default): complete record — every order, every status
  - **OFF**: actionable only — confirmed orders awaiting payment + open group orders

### Bonus fix — Production GRANT missing
- Discovered that `can_access_group_order`, `is_open_group_order`, and `find_open_group_order_by_code` were missing `EXECUTE` grants for the `authenticated` role in production, causing the "permission denied" error for all students.
- New migration `20260925120000_regrant_group_order_function_access.sql` restores the grants.
