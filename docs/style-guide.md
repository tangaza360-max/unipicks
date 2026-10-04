# Unipicks style guide (v1, approved 2026-10-04)

One page that every screen follows. It turns the founder's rule — **simple,
minimal, elegant, professional, no shouting graphics** — into checkable rules.
Based on the phone UI audit (`docs/ui-audit/README.md`).

Every contrast number below was measured on the app's real theme colors
(`src/index.css`) with the WCAG 2.2 formula. Preview: `style-guide-preview.png`.

## 0. Four rules that are always checked

| Rule | Standard |
|---|---|
| Text contrast **≥ 4.5:1** (large text and icons ≥ 3:1) | WCAG 2.2 SC 1.4.3 / 1.4.11 |
| Tap targets **≥ 44 × 44 px** | Apple HIG 44 pt, Material 48 dp, WCAG 2.5.8 |
| **Plain words, never codes** (`pending_confirmation` ✗, "Waiting for you" ✓) | NN/g heuristic 2 |
| **Honest prices**: the price paid is clear, strike-through only for a real discount, the seller always named | Baymard; FTC dark-patterns report (2022) |

## 1. Colors

**One brand green. No purple, no blue.** Color carries meaning, not decoration.

| Token | Value | Use | Contrast (measured) |
|---|---|---|---|
| Green | `#93C149` | Main buttons, active tab, selected chips, offer badges | Ink on green **8.7:1** ✓ |
| Ink | `#1B1308` | Text **on** green, in light and dark mode | — |
| Text green (light mode) | `#547A29` *(new)* | Links and green text on light backgrounds | on white **5.0:1** ✓ (today's green: 2.1 ✗) |
| Text green (dark mode) | `#93C149` | Links and green text on dark backgrounds | on dark surface **7.4:1** ✓ |
| Red | `red-400` dark / `red-600` light | Errors, Delete, Declined, Expired | 5.7:1 / 4.8:1 ✓ |
| Amber | `amber-400` dark / `#9B5E08` light | "Waiting…" states, warnings | 9.4:1 / 5.3:1 ✓ |
| Main text | theme `text-primary` | Body text | 15.0:1 dark / 14.1:1 light ✓ |
| Secondary text | theme `text-secondary` | Descriptions, labels | 6.5:1 dark / 5.8:1 light ✓ |
| Muted text | theme `text-muted` | **Only** for 18 px+ or non-essential hints | 4.0:1 dark / 3.4:1 light ✗ for small text |

**Fixes this implies**
- Buttons use **ink** text, never the page background color. Today
  `text-background-foreground` turns white in light mode: **2.1:1 ✗**.
- Group buy: purple button and badge → green, like every other deal. The
  badge text ("GROUP BUY · 5 NEEDED") already says what it is.
- "Accept" (`bg-green-600`) and offer badges (`bg-green-500/600`) → the one brand green.
- No raw Tailwind colors in screens (`bg-purple-600`, `text-blue-400`…); use the tokens.

## 2. Type

| Style | Font | Size / weight | Use |
|---|---|---|---|
| Page title | Space Grotesk | 24 px / 600 | One per screen |
| Section title | Space Grotesk | 18 px / 600 | "Your deals", "Order history" |
| Card title | Inter | 16 px / 600 | Deal or order name |
| Body | Inter | 14–16 px / 400 | Text, inputs (inputs **16 px**, so phones don't zoom) |
| Small | Inter | 12 px / 500 | Labels, badges, dates |

- **Nothing smaller than 12 px.** Today 24 places use 8–11 px.
- **Sentence case everywhere**: "Place order", not "Place Order"; "Edit profile", not "Edit Profile".
- Small uppercase labels ("MR. CHIPS") are allowed only for the seller name on cards.

## 3. Space and shape

- Page side padding **16 px** on phones; space between cards **12 px**.
- Cards: radius **12 px**, 1 px border, **one level only** (no card inside a card).
- Buttons and inputs: radius **8 px**. Chips and badges: fully round.
- Photos: 16:10, with the name in text, not baked into the image.

## 4. Buttons (3 types + link)

| Type | Look | When |
|---|---|---|
| **Main** | Green fill, ink text, full width on phones | The one next step: Order now, Pay now, Save |
| **Secondary** | Border, no fill | Other actions: Call student, Cancel, Check code |
| **Danger** | Red text + red border | Delete, Decline. A filled red button only inside the "Are you sure?" dialog |
| Link | Text green, underline on hover | "View receipt", "Forgot password?" |

- Height **≥ 44 px** (Edit / Pause / Delete on deal cards are about 26 px today).
- **One main button per screen.**
- Labels start with a verb and are short: "Order now", "Pay 4,800 RWF", "Save changes".
- Disabled buttons say why, next to them ("Price not set", "Available Mon–Fri, 11:00–14:00").

## 5. Status labels

One `StatusBadge` everywhere (done for orders). Color by **meaning**, not by status name:

| Meaning | Color | Examples |
|---|---|---|
| Needs someone to act | Amber | Waiting for you · Waiting for payment · Awaiting confirmation |
| In progress | Neutral grey | Payment in progress · Open |
| Done, good | Green | Paid · ready for pickup · Collected |
| Ended, not good | Red | Declined · Expired · no answer · Cancelled |

Deal state ("Active" / "Paused") uses the same badge: Active = green, Paused = neutral.

## 6. Money, dates, numbers

- Money: **`4,800 RWF`**: comma for thousands, no decimals, "RWF" after. Never `4800 RWF`.
- Dates: **`4 Oct 2026`**. Times: **24-hour, Kigali time**: `20:27`.
- Recent things: "5 minutes ago", "Yesterday, 20:27". Older than 7 days: the date.
- One helper each (`formatMoney`, `formatDate`) so no screen uses the phone's own format.

## 7. Navigation

- **Back**: one style on every screen: `← Back`, grey, top left, 44 px tall.
  Replaces "← Back to dashboard", "← My orders", "← Back to Profile".
- Page title right under it.
- **Students**: bottom bar with **icon + word** (Home, Search, Social, Profile).
- **Businesses on phones** *(proposal)*: the same bottom bar instead of the 6
  pill tabs that fill 3 rows: Orders, Deals, Stats, Profile, and **More**
  (Stories, Messages). Laptop keeps the tabs.
- Log out lives in Profile (not as a header icon next to the theme switch).

## 8. Forms

- One column on phones. Label **above** the field, always visible.
- Optional fields say "· optional". Required ones don't need a star.
- Errors appear under the field, in plain words, and say how to fix it:
  "Enter the price before any discount, more than 0 RWF."
- File uploads: a styled "Add photo" button with a preview, not the browser's "Choose File".

## 9. Empty, loading, error

| State | Pattern | Example |
|---|---|---|
| Loading | Grey shapes (skeleton) of the real layout | Feed cards |
| Empty | One sentence + one main button | "No deals yet." **[Create your first deal]** |
| Error | What happened + what to do | "We couldn't load your orders. Check your connection and try again." **[Try again]** |

No placeholder text that looks unfinished ("Group order (code ----)", empty "Stories" circles).

## 10. Writing voice

- **Simple English**, short sentences, "you" and "we". Kind, never pushy.
- Say what happens next: "Mr. Chips has 5 minutes to accept. We'll tell you."
- Name things the same everywhere: **Collected** (never Redeemed), **Business**
  (never Merchant, for users), **Pickup code**.
- No codes, no exclamation marks, no ALL CAPS sentences. Emojis only in chat messages.

| Don't | Do |
|---|---|
| "Profile updated successfully!" | "Profile updated." |
| "pending_confirmation" | "Waiting for you" |
| "Something went wrong" (alone) | "We couldn't save. Please try again." |
| "Continue to Order" | "Continue" |

## 11. Before a screen ships (checklist)

- [ ] Phone width 390 px: no sideways scroll, nothing cut off
- [ ] Light and dark mode: text contrast ≥ 4.5:1
- [ ] Every tap target ≥ 44 px
- [ ] No text under 12 px
- [ ] No code words, money as `4,800 RWF`, dates as `4 Oct 2026`
- [ ] One main button; sentence case labels
- [ ] Empty, loading and error states exist

## 12. Founder decisions (2026-10-04, all approved)

1. This guide is approved as v1.
2. Group buy uses the brand green, like every other deal (no purple).
3. Business navigation on phones: bottom bar (Orders, Deals, Stats, Profile, More); laptops keep the tabs.
4. Text green for light mode: `#547A29`.
