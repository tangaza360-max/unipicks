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
