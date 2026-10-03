# User Research

## Student feedback form (v1)

A 12-question, 2-minute Google Form for Kepler College students: validate demand, find friction, rank features, and recruit beta testers and testimonials.

| File | Purpose |
|---|---|
| [`google-form.md`](./google-form.md) | Full spec: exact wording, options, question types, rationale, deploy steps, distribution plan, analysis guide |
| [`google-form-paste.txt`](./google-form-paste.txt) | Paste-ready text, question by question |
| [`create-form.gs`](./create-form.gs) | One-click Google Apps Script that builds the whole form, including the email validation and the one-rank-per-column ranking grid |
| [`email-invite.md`](./email-invite.md) | Ready-to-send email (and 3-day reminder) for the Kepler general student email list |
| [`google-forms-api.json`](./google-forms-api.json) | `forms.batchUpdate` body for the Google Forms API |

**v1 scope (founder decisions, 2026-10-03)**
- English only.
- No raffle or incentive.

## v2 improvements (backlog)

- **Bilingual form (English + Kinyarwanda).** Add Kinyarwanda helper text under each question, or publish a parallel Kinyarwanda form and compare response rates. A native speaker must write and check the translation; don't machine-translate. Keep option values identical across languages so results merge cleanly in Sheets.
- **Short follow-up form for beta testers** after 2 weeks of use: an NPS question, the most-used feature, and what almost made them stop.
- **Incentive experiment** (only if v1 gets fewer than 100 responses): a small, clearly optional thank-you, e.g. a free deal from a partner merchant.
