# Unipicks — Student Feedback Google Form

**Goal:** validate demand, discover friction, rank features, and recruit beta testers and testimonials among Kepler College students before launch.
**Audience:** current and incoming Kepler students (potential early users).
**Length:** 12 questions in 5 short sections, about 2 minutes. Only 7 are required (Q1–Q4, Q6, Q8, Q9); the open-ended and contact questions are optional to protect the completion rate.

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
| Title | **Unipicks: Student Food Deals (2-minute survey)** | Says the time cost up front, which raises starts |
| Description | *Hi! 👋 We're building **Unipicks**, an app that gets Kepler students deals from local food spots near campus. Order, group up with friends, and pay with MoMo. Your answers (12 quick questions, about 2 minutes) decide what we build first. Answers are anonymous unless you choose to leave your email. Murakoze! 💚* | Context, time, anonymity and thanks |
| Collect email addresses | **Off** | Anonymity increases honesty; email is asked optionally in Q11 |
| Require sign-in / limit to 1 response | **Off** | Sign-in walls cut mobile completion. Deduplicate later by email or timestamp if needed |
| Show progress bar | **On** | Reduces drop-off on multi-section forms |
| Shuffle question order | Off (option order is shuffled per question where noted) | Sections must stay in a logical order |
| Confirmation message | *Murakoze! Thanks for helping shape Unipicks. If you left your email for the beta, we'll be in touch soon. 🍟* | Closes the loop |
| Theme | Header colour `#95BF47` (Unipicks lime), font "Basic" | On brand |

---

## Section 1 — About you

### Q1. What year of study are you in? *(required)*
- **Type:** Multiple choice (one answer)
- **Options:** Year 1 · Year 2 · Year 3 · Year 4 · Not at Kepler yet (starting soon) · Graduated / alumni
- **Rationale:** Segments results by life stage. First-years have the least local knowledge and the most to gain; "starting soon" captures the incoming-student audience from the video. Alumni responses can be filtered out or kept for the future "Professional Unipicks" stage (product doc §11).

### Q2. Which campus are you on? *(required)*
- **Type:** Multiple choice with "Other" (free text)
- **Options:** Kigali (Kinyinya) · Other: ______
- **Rationale:** Location drives which merchants to recruit first (product doc §13). The free-text "Other" catches satellite programmes without guessing at a campus list.

### Q3. How do you usually pay for food and snacks? *(required; select all that apply)*
- **Type:** Checkboxes, with "Other"
- **Options:** MTN MoMo · Airtel Money · Cash · Bank card · Other: ______
- **Rationale:** Checks that mobile-money-only checkout (UmunotaPay) fits how students actually pay. If many choose Cash only, payment adoption is a launch risk. Splitting MTN and Airtel shows whether both providers must be supported.

---

## Section 2 — Interest in Unipicks

*Section description:* "Unipicks shows you student-only deals from food spots near campus. You order in the app, the business confirms, you pay with mobile money and pick up with a code. You can also start a group order with friends to unlock group prices."

### Q4. How likely are you to use Unipicks? *(required)*
- **Type:** Linear scale 1–5
- **Labels:** 1 = Not at all likely · 5 = Very likely
- **Rationale:** The headline demand metric. Target: **≥ 60 % answering 4–5** as a "go" signal for the Kepler launch (product doc §22).

### Q5. What's the biggest problem Unipicks could solve for you? *(optional)*
- **Type:** Paragraph
- **Helper text:** "e.g. lunch is too expensive, I don't know the good spots, long queues, ordering for a group is messy…"
- **Rationale:** Surfaces the job students want done in their own words. It's the best source of testimonial quotes (with consent from Q12), and the examples lower the effort of answering.

---

## Section 3 — Feature priorities

### Q6. Rank these features from most to least useful to you. *(required)*
- **Type:** Multiple-choice grid, used as a ranking. Rows = features; columns = 1st … 5th. Turn on **"Require a response in each row"** and **"Limit to one response per column"** so each rank can be used only once.
- **Rows:**
  1. Student deals & discounts
  2. Group orders with friends
  3. Chat with the business
  4. Stories from businesses & friends
  5. Search (find food, places, people)
- **Columns:** 1st · 2nd · 3rd · 4th · 5th
- **Rationale:** A forced ranking stops everything being "important" (a common failure of 1–5 rating grids) and directly prioritises the roadmap. It also tests the social audit's open question about whether Stories belong in the MVP.

### Q7. What might stop you from using Unipicks? *(optional; select all that apply)*
- **Type:** Checkboxes, with "Other". Shuffle option order (keep "Other" last).
- **Options:**
  - I don't trust paying through an app
  - Discounts might be too small
  - Few of the places I like would be on it
  - Waiting for the business to confirm my order
  - I prefer paying cash
  - Mobile data cost / my phone storage
  - I don't want another app
  - Other: ______
- **Rationale:** Discovers friction before launch. Each option maps to a known risk from the audits: payment trust, merchant supply, the 5-minute confirmation wait, a cash-heavy culture, data cost (supports keeping the PWA light). Shuffling reduces order bias.

---

## Section 4 — Willingness to pay & participate

### Q8. For a good student lunch deal, what price feels right to you? *(required)*
- **Type:** Multiple choice
- **Options:** Under 1,000 RWF · 1,000–1,500 RWF · 1,500–2,000 RWF · 2,000–3,000 RWF · More than 3,000 RWF if the quality is great
- **Rationale:** Willingness to pay. This tells merchants what price point to design deals around (the product doc's "data → insight → decision" for the Mr. Chips problem), and it's shareable merchant-pitch evidence ("62 % of Kepler students want lunch deals between 1,000 and 2,000 RWF").

### Q9. Would you like to be a Unipicks beta tester? *(required)*
- **Type:** Multiple choice
- **Options:** Yes, sign me up! · Maybe, tell me more · No thanks
- **Helper text:** "Beta testers try Unipicks first, help us fix problems, and get early access to deals."
- **Rationale:** Measures willingness to participate and recruits the first cohort (roadmap Phase 5). "Maybe" keeps people who are curious but cautious.

---

## Section 5 — Open feedback & follow-up

### Q10. If you could change one thing about buying food around campus, what would it be? *(optional)*
- **Type:** Paragraph
- **Rationale:** The "one thing you'd improve" prompt, framed around their current life rather than an app they haven't used, so even non-users can answer. It surfaces needs beyond the current feature set (e.g. delivery, opening hours).

### Q11. Your email (optional, only if you'd like us to contact you)
- **Type:** Short answer, with response validation **Text → Email address**
- **Helper text:** "Leave this blank to stay anonymous. We'll only use it to contact you about Unipicks testing and never share it."
- **Rationale:** Follow-up for the beta and interviews. Optional and clearly explained, in line with Law N° 058/2021 (purpose limitation, consent).

### Q12. What can we do with your answers? *(optional; select all that apply)*
- **Type:** Checkboxes
- **Options:**
  - Contact me about the beta (using the email above)
  - Invite me to a 15-minute chat about Unipicks
  - Quote my answers in Unipicks posts using my first name only
- **Rationale:** Explicit, separate consent for each use: beta contact, interviews, and **testimonials** (only quote people who ticked the third box). This is standard research-ethics practice and keeps marketing honest.

---

## How to deploy this form

### Option A — One click with Apps Script (recommended, about 3 minutes)
1. Go to **script.google.com** → **New project**.
2. Delete the sample code and paste all of `create-form.gs`.
3. Click **Run** → choose `createUnipicksForm` → allow the permissions (it creates a form in **your** Drive).
4. Open **View → Logs** (or **Execution log**) to get the **edit link** and the **public link**.
5. Open the edit link, set the theme colour to `#95BF47`, preview on your phone, and submit one test response.

### Option B — Build it by hand
Open forms.google.com → **Blank**, then copy each question from `google-form-paste.txt`. Remember the Q6 grid settings ("Limit to one response per column") and the Q11 email validation.

### Option C — Google Forms API (developers)
Create the form (`forms.create` with only `info.title`), then send `google-forms-api.json` as the body of `forms.batchUpdate`. The API can't set response validation, so add Q6's one-response-per-column rule and Q11's email validation in the editor afterwards.

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
| **Campus posters** | A4 poster with QR code at the canteen, library and notice boards | Headline: *"Lunch too expensive? 2 minutes → help build Unipicks 🍟"*. Put the QR at least 5 cm wide at eye level, with "2 min · 12 questions" printed under it. |
| **In person** | Stand near the canteen at lunch with a phone showing the QR | Fastest way to reach 100. Students fill it in on their own phones; don't watch them answer. |
| **Instagram / TikTok** | Post the explainer video with the form link in bio | Pair with a story poll ("Would you use this? Yes / Maybe") that links to the form |
| **Merchant partners** | QR on the counter at partner food spots near campus | Reaches the actual buyers; also a nice early signal to the merchants |

**WhatsApp message template**

> Hey! 👋 Quick favour: I'm helping build **Unipicks**, an app for Kepler students to get deals from food spots near campus (order, group up with friends, pay with MoMo).
> Can you fill in this **2-minute survey**? Your answers decide what we build first 🙏
> 👉 [link]
> Murakoze! 💚

**Incentive:** none for v1 (founder decision: no raffle, to avoid the extra logistics). The ask is short (2 minutes) and the payoff is early access through the beta (Q9).

---

## Analysing the results

| Question | What to look at | Decision it drives |
|---|---|---|
| Q4 likelihood | % answering 4–5; split by Q1 year | **Go/no-go** for the Kepler launch: ≥ 60 % top-2 = strong |
| Q6 ranking | Average rank per feature (1 = best) and % ranked 1st | Roadmap order. If Stories average below 4th, park them (social audit question 3) |
| Q7 friction | % ticking each barrier | Payment trust → show the "Verified" badge and pickup-code guarantee; supply → recruit merchants; waiting → shorten the confirmation window |
| Q3 payment | % MoMo vs Airtel vs Cash-only | Whether UmunotaPay must support Airtel Money at launch; size of the cash-only risk |
| Q8 price | Distribution of price bands | The merchant pitch deck and deal-price guidance |
| Q9 beta | Count of Yes / Maybe with email | Size of the beta cohort |
| Q5, Q10 open text | Tag answers into themes (price, discovery, speed, group, delivery, trust) | New opportunities. Pull quotes only where Q12 allows |

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
