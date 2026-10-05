# Unipicks architecture map

One map of how Unipicks fits together, from the big picture down to the
details. Every page was checked against the code and the live database on the
date shown; anything not checked is marked **[inference]**.

| # | Page | Question it answers | Status |
|---|---|---|---|
| 1 | [The whole ecosystem](01-ecosystem.md) | Who uses Unipicks, and which outside services does it talk to? | ✅ 2026-10-05 |
| 2 | [The building blocks](02-building-blocks.md) | What are the parts inside Unipicks, and how do they talk? | ✅ 2026-10-05 |
| 3 | Main journeys, step by step | What happens, in order, when a student orders, pays, reports…? | next |
| 4 | Life of each thing | Which stages does an order / payment / group / story / report / refund go through? | planned |
| 5 | The data | Which tables exist and how are they linked? | planned |
| 6 | Who can see and do what | Which roles exist, and which rules protect each table? | planned |
| 7 | Running it | Where each part lives, deploys, secrets (names only), logs, what to check when it breaks | planned |

Open `architecture.html` (same folder) to see every diagram as pictures, on a
phone or a laptop. On GitHub the diagrams in these `.md` pages also show as
pictures (they are written in [Mermaid](https://mermaid.js.org/)).

## The rule that keeps this map true

**A commit that changes how parts connect also updates the page and diagram
that shows it**, in the same commit:

- a new or changed server function, scheduled job, outside service, secret
  or storage bucket → pages 1, 2 and 7;
- a new step in a journey → page 3;
- a new status → page 4;
- a new table or link between tables → page 5;
- a new role, policy or admin-only action → page 6.

The CHANGELOG entry then lists the architecture page among the files touched.

## How to read the diagrams

- Boxes are people or parts; arrows are "talks to" (the label says how).
- Colours: **green** = inside Unipicks, **grey** = outside services we pay or
  depend on, **amber** = people.
- "Server function" = a Supabase Edge Function (small program on Supabase's
  servers). "Rule" = a database policy (RLS) or trigger.
