# UI/UX audit — phone first (2026-10-04)

Read-only audit. Nothing in the app was changed.

**How it was done**
- 27 screens: sign-up and login, student, business and admin.
- Screenshots in Chromium at phone size (390 × 844, Android user agent). All in dark mode, and 8 key screens in light mode too.
- The app was a production build (`vite build`) running on fake data:
  - deals and Mr. Chips' business profile copied read-only from production (public data);
  - students and orders invented.
- An automatic check on every screen for:
  - sideways scrolling;
  - tap targets smaller than 40 px;
  - text smaller than 12 px;
  - page crashes.
- A code scan for colors, font sizes and button styles.

**Limits**
- Food photos are coloured placeholders: this environment can't load Unsplash or Supabase Storage.
- Fonts show the fallback (not Inter or Space Grotesk): Google Fonts is blocked here.
- Phone alerts show "blocked" because the test browser has no notification permission.
- Only phone size was checked. Laptop size and iPhone Safari were not.

Screenshots: `1-sign-up-and-login.jpg` … `7-light-mode.jpg` in this folder.

## Summary

The app works on a phone, and no screen scrolls sideways. The main problems are:
1. **Wrong or unfinished content that students see:** "Your Business", "0% off", raw status codes, contradictory prices.
2. **No shared building blocks:** 201 hand-written `<button>`s and raw colors in 39 files, so the same thing looks different on every screen.
3. **The business dashboard on a phone:** 6 tabs wrap into 3 rows, and the buttons are small.

## 🟡 Should fix (students or businesses notice these)

| # | Finding | Where | Evidence |
|---|---|---|---|
| Y1 | **"Your Business" shown as the seller** on 2 of the 4 deals: in the feed, the deal page, the payment page ("Your Business accepted your order") and the business stats. Deals keep a copy of the business name. Deals made with the AI generator saved the placeholder `'Your Business'`. | feed, deal, payment, stats | `src/pages/AIDealGenerator.jsx:189`; production rows `286bcf79…`, `75ea3d14…` |
| Y2 | **"0% off" badges:** on "30% off all pizzas" (saved with no percentage and no price) and on the group-buy deal. The pizza deal also shows **no price** to students. | business deals, deal page, order history "(0% off)" | production row `60eb628b…` (`discount_value` and `price` empty); `DealDetail.jsx:181`, `OrdersTab.jsx:329` |
| Y3 | **Raw status codes** shown to businesses: `pending_confirmation`, `confirmation_expired`. Recent orders in Stats say "pending". | business Orders, Stats | `MerchantOrders.jsx:303` prints `{order.status}` |
| Y4 | **Deal text contradicts itself:** "Original price 2500 RWF" next to a struck-out 6000 RWF; the title repeated inside the description; left-over words "Show" and "Show image". | feed, deal page | AI-generated descriptions of the two "Your Business" deals |
| Y5 | **Group buy shows the same price twice** (struck out 10000 RWF, then 10000 RWF), which looks like a fake discount. | feed, deal page | deal `a7aed803…` |
| Y6 | **Business dashboard on a phone:** 6 pill tabs take 3 rows (about ¼ of the screen) before any content; the content sits in a card inside another card; no bottom navigation, although students have one. | all business screens | `5-business.jpg` |
| Y7 | **Small buttons for businesses:** Edit / Pause / Delete on each deal are about 26 px tall, below the 44 px minimum (WCAG 2.5.5, Apple HIG). Quantity − / + on the order screen are 32 px. Business screens have up to 21 small tap targets each. | business Deals, Confirm order | automatic check (`small: 21` on business deals) |
| Y8 | **Low-contrast labels:** the "Active" badge is dark green on dark grey. In light mode, **white text on the light brand green** ("20% OFF", "Log in") is hard to read (measured: white on `#95BF47` is 2.1:1; WCAG 1.4.3 asks for 4.5:1). | business deals, badges, buttons | `7-light-mode.jpg` |
| Y9 | **Dead support address:** the delete-account page tells people to email `support@unipicks.app`, but you don't own that domain yet. | `/delete-account` | `6-business-and-admin.jpg` |
| Y10 | **Unstyled file pickers:** the browser's own "Choose File / No file chosen" on Stories (and on deal, logo and AI image uploads). | business Stories | `MerchantStories.jsx:157`, `MerchantDeals.jsx:1091`, `MerchantProfile.jsx:309` |

## 🟢 Consistency and polish

| # | Finding | Where |
|---|---|---|
| G1 | **4 different "back" links:** "← Back" (grey), "← Back to dashboard" (green), "← My orders", "← Back to Profile". | deal, payment, receipt, orders |
| G2 | **Button wording:** "Order now" / "Continue to Order" / "Place Order" / "Pay Now" / "Log in" mix Title Case and sentence case. | student flow |
| G3 | **Several greens and a purple:** brand green `#95BF47`, a brighter green for "Accept" and the deal badges (`bg-green-500/600`), and **purple** for group buy (`bg-purple-600`), which is outside the brand colors. 36 different raw Tailwind colors in 39 files instead of theme colors. | code scan |
| G4 | **Status labels look different everywhere:** grey chips (business), small coloured text (student history), "Paid" / "Collected" (receipt). | orders, history, receipt |
| G5 | **Dates and money in different formats:** "10/4/2026", "Oct 4, 2026 at 06:20 PM", "4 Oct 2026, 20:27"; "4800 RWF" vs "4,800 RWF". 29 calls use the phone's own locale. | feed vs receipt vs stats |
| G6 | **Logo missing on Login and Forgot password**, but present on both sign-up pages. Page title sizes differ ("Forgot your password?" is larger). | `1-sign-up-and-login.jpg` |
| G7 | **Tiny text:** 24 places use 8–11 px text (`text-[10px]`, `text-[8px]`): "Are you a business? Sign up here", "Terms · Privacy", status chips, chart labels (15 tiny labels on Stats). | code scan, Stats |
| G8 | **Cramped two-column fields on phones:** "Kepler Colleg…" is cut off; Password / Confirm side by side. The student ID example says "UR12345" (a University of Rwanda format) on a Kepler-only app. | `/register` |
| G9 | **Bottom navigation has icons but no words** (Home, Search, Social, Profile), so new students must guess. | student screens |
| G10 | **Empty states look unfinished:** Social shows 3 empty grey circles labelled "Stories" and "Social content will appear here."; Messages shows "Group order (code ----)". | Social, Messages |
| G11 | **Two search boxes:** one on Home ("Search deals or restaurants…") and the Search tab. | Home, Search |
| G12 | **Header actions:** businesses have **Log out** as a header icon next to the theme switch, where it is easy to tap by mistake. Students have it at the bottom of Profile. | business header |
| G13 | **The student profile is very long:** account, social profile, order history, appearance, alerts, privacy, account, about and log out on one page. | `/dashboard/profile` |

## Robustness note (inference)
Order History crashed in the test when a group-order membership came without its group: `OrdersTab.jsx:255` reads `membership.group_orders.deals` with no check. In production the database normally sends the group, so this is **not seen live**. It would crash the whole Order History screen if a group ever became unreadable (for example deleted or hidden). One `?.` fixes it.

## What already works well
- Clear money flow on the payment page: quantity, unit price, total and a countdown.
- The receipt: tidy, printable, with the seller's identity.
- No sideways scrolling on any screen at 390 px.
- Consistent card style and the green brand color in the student feed.
- Empty states have short, friendly text.
- Dark and light modes both work.

## Recommended order of work
1. **Data fixes (no redesign):**
   - Y1: replace "Your Business" with the real name, and stop the AI generator saving it;
   - Y2: no "0% off", a required price or percentage;
   - Y3: readable status words;
   - Y5: no fake strike-through;
   - Y9: support address;
   - the robustness `?.`.
2. **One-page style guide**, for your approval:
   - colors (one green, plus red/amber for warnings), no purple;
   - 3 button types and minimum sizes;
   - status label style;
   - date and money format;
   - back link;
   - writing voice.
3. **Shared building blocks:** `Button`, `StatusBadge` (exists, extend it), `BackLink`, `PageHeader`, `FilePicker`, `formatMoney`, `formatDate`.
4. **Screens:**
   - business dashboard on phones (Y6, Y7);
   - then the student flow;
   - then sign-up and login.

   Before/after screenshots for each.
