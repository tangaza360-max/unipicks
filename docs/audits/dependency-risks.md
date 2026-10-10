# Dependency warnings we accept for now

Last checked: **2026-10-10** (`npm audit` on commit after `af5e26d`).

## Summary

- `npm audit --omit=dev` (what runs in students' browsers): **0 warnings**.
- `npm audit` (all, build tools included): **7 warnings**, all under
  Tailwind CSS 3 (`tailwindcss@3.4.19`, a dev dependency).
- These packages run only while the app is **built** (on a laptop or on
  Vercel), reading **our own files** (`tailwind.config.js` →
  `content: ['./index.html', './src/**/*.{js,jsx}']` and our CSS). They are
  not in the files sent to phones, and no student or visitor can send them
  input.

## The warnings

| Package | Via | Advisory | Fixed in | Why it doesn't reach users |
|---|---|---|---|---|
| `braces` 3.0.3 | `chokidar`, `micromatch`, `fast-glob` (Tailwind 3) | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) — a deeply nested brace pattern crashes Node (stack overflow) | **No fix exists** ("Patched versions: None") | The only patterns are our own `content` globs. |
| `postcss-selector-parser` 6.1.4 | Tailwind 3, `postcss-nested` | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) — a huge flat selector (`.a.a.a…`) takes very long to parse | 7.1.6 (Tailwind 3 needs 6.x) | Parses only our CSS. The advisory says: "Build-time use on trusted input is not affected." |

`npm audit` counts each package in the chain (`braces`, `chokidar`,
`micromatch`, `fast-glob`, `tailwindcss`, `postcss-selector-parser`,
`postcss-nested`), which makes 7.

## Why not Tailwind 4 (the only way to clear them)

Tailwind 4 needs **Chrome 111+, Safari 16.4+ (iOS 16.4) and Firefox 128+**;
the Tailwind docs say it "will not work in older browsers" and recommend
staying on v3.4 for them
([tailwindcss.com/docs/compatibility](https://tailwindcss.com/docs/compatibility) —
found by web search on 2026-10-10; the page itself could not be opened from
the build machine). Today the app works on **Chrome 87+, Safari 14+,
Firefox 78+** (Vite 6 default target; we stayed on Vite 6 for this reason).
Tailwind 4 is also a large change (theme moves into CSS, new defaults for
borders, rings and shadows), so every screen would need checking again.

We don't yet know which phones Kepler students use: Vercel Web Analytics is
off, and the login records (read-only, 2026-10-10) show only 6 people in 90
days, all on new browsers (likely the team).

**Founder decision (2026-10-10):** stay on Tailwind 3; accept these warnings.

## When to look again

- Once we know students' phones (turn on Vercel Web Analytics, or ask in the
  survey): if nearly everyone has iOS 16.4+ / Chrome 111+, plan Tailwind 4.
- If a Tailwind 3.4.x release removes `braces` or moves to
  `postcss-selector-parser` 7.
- If any of these packages ever appears in `npm audit --omit=dev`, it is no
  longer build-only: fix it at once.
