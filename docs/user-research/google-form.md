# Unipicks — Student Feedback Google Form

**Goal:** learn whether Kepler students will use Unipicks, which feature matters most, how they pay, what price works, and what could stop them; and collect beta testers.
**Audience:** Kepler College students (one campus, Kigali).
**Length:** 7 questions on **one page**, about **1 minute**. 5 are one tap; only Q1–Q4 are required. The 2 typing questions are optional.

**Why so short:** students fill this in on their phones, often on mobile data. Every extra question and every extra page loses people. Each question below is kept only because its answer drives a real decision (see "Analysing the results"). Ranking grids, sections and consent tick boxes were removed because they are slow and hard on a phone.

**Files in this folder**

| File | Use it to… |
|---|---|
| `google-form.md` (this file) | Read the spec: wording, why each question exists, how to share it and read the results |
| `google-form-paste.txt` | Copy and paste each question into Google Forms by hand |
| `create-form.gs` | **Fastest:** paste into Google Apps Script, press Run, and the whole form is built |
| `google-forms-api.json` | `forms.batchUpdate` request body for the Google Forms API (developers) |
| `brand/` | Header image, logo and colour codes |

---

## Form settings

| Setting | Value |
|---|---|
| Title | **Unipicks: 1-minute student survey** |
| Description | *Hi, I'm a Kepler student building Unipicks: student deals from food places near Kigali campus. You order ahead, pay with MoMo or Airtel Money, and pick up without waiting in line. 7 quick questions, about 1 minute. Most are just one tap. No name needed. Murakoze.* |
| Collect email addresses | **Off** (email is optional in Q7) |
| Require sign-in / limit to 1 response | **Off** (sign-in walls stop phone users) |
| Pages | **One page**, no sections, no progress bar needed |
| Confirmation message | *Murakoze. Your answers help us build Unipicks for Kepler students.* |
| Theme (palette icon) | Header image `brand/form-header-1600x400.png`; colour `#95BF47`; lightest background; font style **Basic** |

---

## The 7 questions

| # | Question | Type | Required | Why we ask |
|---|---|---|---|---|
| Q1 | **Would you use Unipicks?** (1 = No … 5 = Yes, a lot) | Scale 1–5 | Yes | Go/no-go for the Kepler launch |
| Q2 | **Which would you use the most?** Student deals and discounts · Order ahead and skip the queue · Group orders with friends for a better price · Chat with the food place | One choice | Yes | What to build and promote first |
| Q3 | **How do you pay for food?** MTN MoMo · Airtel Money · Cash · Bank card | Tick all | Yes | Is mobile-money-only checkout OK; do we need Airtel Money at launch |
| Q4 | **What is a good price for a student lunch?** Under 1,000 · 1,000 to 1,500 · 1,500 to 2,000 · 2,000 to 3,000 · More than 3,000 RWF | One choice | Yes | Deal prices to suggest to food places; evidence for the merchant pitch |
| Q5 | **What could stop you from using it?** I don't trust paying in an app · My favourite places may not be on it · The discounts may be too small · I prefer cash · Other | Tick all | No | Biggest launch risk: trust, supply, value or cash |
| Q6 | **What would make food around campus better for you?** | One line of text | No | New ideas in students' own words |
| Q7 | **Want to try Unipicks first? Leave your email.** (validated as an email; "We will only use it to invite you to the beta, and never share it.") | Short answer | No | Beta testers. The email is optional and its single purpose is stated (Law N° 058/2021: consent and purpose limitation) |

**Removed from the longer version, and why:** year of study (nice to have, no decision depends on it), the 5-row ranking grid (hard on a phone; Q2 "pick one" gives the top feature), Stories and Search as options (not core for launch), a separate beta question (Q7 does both), and the consent tick boxes (we only use emails for the beta, and we will ask before quoting anyone).

---

## How to deploy this form

### Option A — One click with Apps Script (recommended, about 3 minutes)
1. Go to **script.google.com** → **New project**.
2. Delete the sample code and paste all of `create-form.gs`.
3. Click **Run** → choose `createUnipicksForm` → allow the permissions (it creates a form in **your** Drive).
4. Open **View → Logs** (or **Execution log**) to get the **edit link** and the **public link**.
5. Open the edit link → **Theme** (palette icon): header image `brand/form-header-1600x400.png`, colour `#95BF47`, lightest background, font style Basic (details in `brand/README.md`). Preview on your phone and submit one test response.

### Option B — Build it by hand
Open forms.google.com → **Blank**, then copy each question from `google-form-paste.txt`. Remember the Q7 email validation.

### Option C — Google Forms API (developers)
Create the form (`forms.create` with only `info.title`), then send `google-forms-api.json` as the body of `forms.batchUpdate`. Add Q7's email validation in the editor afterwards.

### Before you share it
- [ ] Test on a phone over mobile data. It should take about a minute.
- [ ] Turn on **Responses → Link to Sheets** for analysis.
- [ ] Copy the short `forms.gle` link and make a **QR code** for posters.
- [ ] Ask Kepler student affairs or the student council whether posters, emails and class announcements need approval.

---

## Distribution plan

**Target:** at least 100 responses, so that a 10-point difference between options is meaningful. Allow 7–10 days.

| Channel | How | Tips |
|---|---|---|
| **Class WhatsApp groups** | Short message plus link (template below) | Post at **12:00–13:00** (lunch, when food is on their mind) or **19:00–21:00**. Send a reminder 3 days later. One post per group, no spam. |
| **Class reps / student council** | Ask each rep to forward it to their class group with a personal line | People respond to someone they know. Give reps a ready-made message and the QR code. Thank them publicly afterwards. |
| **Campus posters** | A4 poster with QR code at the canteen, library and notice boards | Headline: *"Lunch too expensive? Help build Unipicks in 1 minute."* Plain layout: light background, the Unipicks logo (`brand/unipicks-logo.png`), one green accent, no photos. Put the QR at least 5 cm wide at eye level, with "1 minute · 7 questions" printed under it. |
| **In person** | Stand near the canteen at lunch with a phone showing the QR | Fastest way to reach 100. Students fill it in on their own phones; don't watch them answer. |
| **Instagram / TikTok** | Post the explainer video with the form link in bio | Pair with a story poll ("Would you use this? Yes / Maybe") that links to the form |
| **Merchant partners** | QR on the counter at partner food spots near campus | Reaches the actual buyers; also a nice early signal to the merchants |

**WhatsApp message template**

> Hello, a quick favour. I'm a Kepler student building **Unipicks**, a student companion for life around Kigali campus: student-only deals from food places nearby, order ahead, group orders with friends, and pay with MoMo.
> Could you answer **7 quick questions** (1 minute, mostly taps)? Your answers decide what we build first.
> [link]
> Murakoze.

**Incentive:** none for v1 (founder decision: no raffle, to avoid the extra logistics). The ask is short (1 minute) and the payoff is early access through the beta (Q7).

---

## Analysing the results

| Question | What to look at | Decision it drives |
|---|---|---|
| Q1 would use | % answering 4–5 | **Go/no-go** for the Kepler launch: ≥ 60 % = strong |
| Q2 most used | % per feature | What to build, polish and promote first |
| Q3 payment | % MoMo vs Airtel vs Cash only | Whether UmunotaPay must support Airtel Money at launch; size of the cash-only risk |
| Q4 price | Spread of price bands | Deal-price guidance for food places and the merchant pitch |
| Q5 barriers | % ticking each | Trust → show the "Verified" badge and pickup-code guarantee; supply → recruit more food places; value → bigger first deals; cash → plan for it |
| Q6 ideas | Group answers into themes (price, speed, places, groups, delivery, trust) | New opportunities. Ask permission before quoting anyone |
| Q7 email | Number of emails | Size of the beta group |

**Data handling:**
- Keep the response Sheet private.
- Use emails only to invite people to the beta. Delete them once the beta group is contacted (or within 6 months).
- Never share individual answers with food places; share only totals ("62 % prefer…").

This matches the privacy commitments in the app's own policy and Law N° 058/2021.

---

## Decisions (2026-10-03, updated 2026-10-04)

- **No raffle or incentive** for v1.
- **English only** for v1. A bilingual (English + Kinyarwanda) version is a **v2 improvement**; see `README.md`.
- **Still to decide:** create the form from a dedicated Unipicks Google account rather than a personal one, so responses stay with the project.
- **Simple form (2026-10-04):** 7 questions on one page, about 1 minute, so students do not struggle.
