# Unipicks — Student Feedback Google Form

**Goal:** validate demand, discover friction, rank features, and recruit beta testers and testimonials among Kepler College students before launch.
**Audience:** current and incoming Kepler students (potential early users).
**Length:** 11 questions in 5 short sections, about 2 minutes. Only 6 are required (Q1–Q3, Q5, Q7, Q8); the open-ended and contact questions are optional to protect the completion rate. Kepler College has one campus (Kigali), so there is no campus question.
**Voice and design:** written by a student, for students. It presents Unipicks as a *student companion* for life around Kigali campus and names the real problems first (money runs out, lunch is expensive, hard to find good affordable places). Calm and professional: no emojis, no exclamation marks, one quiet header with the Unipicks logo (see `brand/`).

**Files in this folder**

| File | Use it to… |
|---|---|
| `google-form.md` (this file) | Read the full spec: wording, options, types, rationale, distribution and analysis plan |
| `google-form-paste.txt` | Copy and paste each question into Google Forms by hand |
| `create-form.gs` | **Fastest:** paste into Google Apps Script, press Run, and the whole form is built, including validations |
| `google-forms-api.json` | `forms.batchUpdate` request body for the Google Forms API (developers) |

---

## Form settings

| Setting | Value | Why |
|---|---|---|
| Title | **Unipicks: help us build your student companion** | Personal, and says what Unipicks is |
| Description | *Hello. I'm a Kepler student, and like you, I know the struggle: the money runs out before the month does, lunch near campus is expensive, and you never know where the good, affordable places are. That's why we're building Unipicks, a student companion for life around Kigali campus. It brings together student-only deals from food places near campus, lets you order ahead and pay with MoMo or Airtel Money, and lets you team up with friends on group orders to unlock better prices. You skip the queue and pick up with a code. This survey has 11 short questions and takes about 2 minutes. Your answers decide what we build first. It's anonymous unless you choose to leave your email at the end. Murakoze, thank you.* | Starts from the student's problem, then the solution, time cost, anonymity and thanks |
| Collect email addresses | **Off** | Anonymity increases honesty; email is asked optionally in Q10 |
| Require sign-in / limit to 1 response | **Off** | Sign-in walls cut mobile completion. Deduplicate later by email or timestamp if needed |
| Show progress bar | **On** | Reduces drop-off on multi-section forms |
| Shuffle question order | Off (option order is shuffled for Q6 only) | Sections must stay in a logical order |
| Confirmation message | *Murakoze. Thank you for helping us build something that truly works for Kepler students. If you left your email for the beta, we'll be in touch soon.* | Closes the loop |
| Theme (palette icon) | Header image `brand/form-header-1600x400.png` (logo, name and "Your student companion at Kepler, Kigali campus" on a light background); colour `#95BF47` (Unipicks green); background the lightest option; font style **Basic** | Simple, minimal and professional. One brand colour, no photos or emojis. All colour codes: `brand/README.md` |

---

## Section 1 — About you

### Q1. First, which year are you in? *(required)*
- **Type:** Multiple choice (one answer)
- **Options:** Year 1 · Year 2 · Year 3 · Year 4 · Joining Kepler soon · Graduated / alumni
- **Rationale:** Segments results by life stage. First-years have the least local knowledge and the most to gain; "Joining Kepler soon" captures incoming students. Alumni responses can be filtered out or kept for the future "Professional Unipicks" stage (product doc §11).

### Q2. How do you usually pay for food and snacks? *(required; pick all that apply)*
- **Type:** Checkboxes, with "Other"
- **Options:** MTN MoMo · Airtel Money · Cash · Bank card · Other: ______
- **Rationale:** Checks that mobile-money-only checkout (UmunotaPay) fits how students actually pay. If many choose Cash only, payment adoption is a launch risk. Splitting MTN and Airtel shows whether both providers must be supported.

---

## Section 2 — Unipicks, your student companion

*Section description:* "Here's the idea. Every food place near campus can post deals that only Kepler students get. You open the app, find a deal you like, and order it. The place confirms, you pay with mobile money, and you get a pickup code, so no waiting in line. Going with friends? Start a group order, everyone adds what they want, and the group gets a better price. You can also message the food place directly and connect with friends on campus."

### Q3. Honestly, how likely are you to use Unipicks? *(required)*
- **Type:** Linear scale 1–5
- **Labels:** 1 = Not likely at all · 5 = I'd use it a lot
- **Rationale:** The headline demand metric. "Honestly" invites a real answer instead of a polite one. Target: **≥ 60 % answering 4–5** as a "go" signal for the Kepler launch (product doc §22).

### Q4. What's your biggest struggle with food around campus? *(optional)*
- **Type:** Paragraph
- **Helper text:** "For example: lunch costs too much, I don't know the good places, the queues are long, ordering for a group is a mess…"
- **Rationale:** Asks about the student's life, not about the app, so everyone can answer. It is the best source of testimonial quotes (with consent from Q11), and the examples lower the effort of answering.

---

## Section 3 — What matters most to you

### Q5. Which features would help you most? Put them in order. *(required)*
- **Type:** Multiple-choice grid, used as a ranking. Rows = features; columns = 1st … 5th. Turn on **"Require a response in each row"** and **"Limit to one response per column"** so each rank can be used only once.
- **Helper text:** "Give each feature a different rank. 1st = the one you'd use the most."
- **Rows:**
  1. Student deals and discounts
  2. Group orders with friends
  3. Chatting with the food place
  4. Stories from food places and friends
  5. Search for food, places and friends
- **Columns:** 1st · 2nd · 3rd · 4th · 5th
- **Rationale:** A forced ranking stops everything being "important" (a common failure of 1–5 rating grids) and directly prioritises the roadmap. It also tests the social audit's open question about whether Stories belong in the MVP.

### Q6. What could stop you from using Unipicks? *(optional; pick all that apply)*
- **Type:** Checkboxes, with "Other". Shuffle option order (keep "Other" last).
- **Helper text:** "Be honest, it helps us. Pick all that apply."
- **Options:**
  - I don't trust paying through an app
  - The discounts might be too small
  - My favourite places might not be on it
  - Waiting for the place to confirm my order
  - I prefer paying cash
  - Mobile data or phone storage
  - I don't want another app
  - Other: ______
- **Rationale:** Discovers friction before launch. Each option maps to a known risk from the audits: payment trust, merchant supply, the 5-minute confirmation wait, a cash-heavy culture, data cost (supports keeping the PWA light). Shuffling reduces order bias.

---

## Section 4 — Prices and early access

### Q7. For a good student lunch deal, what price feels right? *(required)*
- **Type:** Multiple choice
- **Options:** Under 1,000 RWF · 1,000–1,500 RWF · 1,500–2,000 RWF · 2,000–3,000 RWF · More than 3,000 RWF if the food is really good
- **Rationale:** Willingness to pay. This tells merchants what price point to design deals around (the product doc's "data → insight → decision" for the Mr. Chips problem), and it's shareable merchant-pitch evidence ("62 % of Kepler students want lunch deals between 1,000 and 2,000 RWF").

### Q8. Want to try Unipicks before everyone else? *(required)*
- **Type:** Multiple choice
- **Options:** Yes, count me in · Maybe, tell me more · No thanks
- **Helper text:** "Beta testers use the app first, tell us what's not working, and get the first deals."
- **Rationale:** Measures willingness to participate and recruits the first cohort (roadmap Phase 5). "Maybe" keeps people who are curious but cautious.

---

## Section 5 — Your ideas

### Q9. If you could change one thing about buying food around campus, what would it be? *(optional)*
- **Type:** Paragraph
- **Rationale:** The "one thing you'd improve" prompt, framed around their current life rather than an app they haven't used, so even non-users can answer. It surfaces needs beyond the current feature set (e.g. delivery, opening hours).

### Q10. Your email (optional)
- **Type:** Short answer, with response validation **Text → Email address**
- **Helper text:** "Only if you want us to contact you, for example about the beta. Leave it blank to stay anonymous. We'll never share it."
- **Rationale:** Follow-up for the beta and interviews. Optional and clearly explained, in line with Law N° 058/2021 (purpose limitation, consent).

### Q11. Is it okay if we… *(optional; pick all that apply)*
- **Type:** Checkboxes
- **Options:**
  - Contact you about the beta (using the email above)
  - Invite you to a 15-minute chat about Unipicks
  - Quote your answers in Unipicks posts (first name only)
- **Rationale:** Explicit, separate consent for each use: beta contact, interviews, and **testimonials** (only quote people who ticked the third box). This is standard research-ethics practice and keeps marketing honest.

---

## How to deploy this form

### Option A — One click with Apps Script (recommended, about 3 minutes)
1. Go to **script.google.com** → **New project**.
2. Delete the sample code and paste all of `create-form.gs`.
3. Click **Run** → choose `createUnipicksForm` → allow the permissions (it creates a form in **your** Drive).
4. Open **View → Logs** (or **Execution log**) to get the **edit link** and the **public link**.
5. Open the edit link → **Theme** (palette icon): header image `brand/form-header-1600x400.png`, colour `#95BF47`, lightest background, font style Basic (details in `brand/README.md`). Turn on **Shuffle option order** for Q6 (⋮ menu). Preview on your phone and submit one test response.

### Option B — Build it by hand
Open forms.google.com → **Blank**, then copy each question from `google-form-paste.txt`. Remember the Q5 grid settings ("Limit to one response per column"), the Q10 email validation and the theme above.

### Option C — Google Forms API (developers)
Create the form (`forms.create` with only `info.title`), then send `google-forms-api.json` as the body of `forms.batchUpdate`. The API can't set response validation, so add Q5's one-response-per-column rule and Q10's email validation in the editor afterwards.

### Before you share it
- [ ] Test on a phone over mobile data. Each section should fit without much scrolling.
- [ ] Turn on **Responses → Link to Sheets** for analysis.
- [ ] Shorten the link (e.g. `forms.gle` is automatic) and make a **QR code** (Google Forms → Send → link → copy into any QR generator, or Chrome's "Create QR code").
- [ ] Ask Kepler student affairs or the student council whether posters and class announcements need approval.

---

## Distribution plan

**Target:** at least 100 responses, so that a 10-point difference between options is meaningful. Allow 7–10 days.

| Channel | How | Tips |
|---|---|---|
| **Class WhatsApp groups** | Short message plus link (template below) | Post at **12:00–13:00** (lunch, when food is on their mind) or **19:00–21:00**. Send a reminder 3 days later. One post per group, no spam. |
| **Class reps / student council** | Ask each rep to forward it to their class group with a personal line | People respond to someone they know. Give reps a ready-made message and the QR code. Thank them publicly afterwards. |
| **Campus posters** | A4 poster with QR code at the canteen, library and notice boards | Headline: *"Lunch too expensive? Help build Unipicks in 2 minutes."* Plain layout: light background, the Unipicks logo (`brand/unipicks-logo.png`), one green accent, no photos. Put the QR at least 5 cm wide at eye level, with "2 min · 11 questions" printed under it. |
| **In person** | Stand near the canteen at lunch with a phone showing the QR | Fastest way to reach 100. Students fill it in on their own phones; don't watch them answer. |
| **Instagram / TikTok** | Post the explainer video with the form link in bio | Pair with a story poll ("Would you use this? Yes / Maybe") that links to the form |
| **Merchant partners** | QR on the counter at partner food spots near campus | Reaches the actual buyers; also a nice early signal to the merchants |

**WhatsApp message template**

> Hello, a quick favour. I'm a Kepler student building **Unipicks**, a student companion for life around Kigali campus: student-only deals from food places nearby, order ahead, group orders with friends, and pay with MoMo.
> Could you fill in this **2-minute survey**? Your answers decide what we build first.
> [link]
> Murakoze.

**Incentive:** none for v1 (founder decision: no raffle, to avoid the extra logistics). The ask is short (2 minutes) and the payoff is early access through the beta (Q8).

---

## Analysing the results

| Question | What to look at | Decision it drives |
|---|---|---|
| Q3 likelihood | % answering 4–5; split by Q1 year | **Go/no-go** for the Kepler launch: ≥ 60 % top-2 = strong |
| Q5 ranking | Average rank per feature (1 = best) and % ranked 1st | Roadmap order. If Stories average below 4th, park them (social audit question 3) |
| Q6 friction | % ticking each barrier | Payment trust → show the "Verified" badge and pickup-code guarantee; supply → recruit merchants; waiting → shorten the confirmation window |
| Q2 payment | % MoMo vs Airtel vs Cash-only | Whether UmunotaPay must support Airtel Money at launch; size of the cash-only risk |
| Q7 price | Distribution of price bands | The merchant pitch deck and deal-price guidance |
| Q8 beta | Count of Yes / Maybe with email | Size of the beta cohort |
| Q4, Q9 open text | Tag answers into themes (price, discovery, speed, group, delivery, trust) | New opportunities. Pull quotes only where Q11 allows |

**Data handling:**
- Keep the response Sheet private.
- Delete emails once the beta cohort is contacted (or within 6 months).
- Never share individual answers with merchants; share only totals ("62 % prefer…").

This matches the privacy commitments in the app's own policy and Law N° 058/2021.

---

## Decisions (2026-10-03)

- **No raffle or incentive** for v1.
- **English only** for v1. A bilingual (English + Kinyarwanda) version is a **v2 improvement**; see `README.md`.
- **Still to decide:** create the form from a dedicated Unipicks Google account rather than a personal one, so responses stay with the project.
