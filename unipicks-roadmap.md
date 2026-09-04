# Unipicks — Roadmap to Sandbox Testing

## How four roles share one platform

This is the most important idea to understand first, because it decides everything else.

**One app, one database, four "hats."** You don't build four separate apps. You build one system with one shared database (Supabase). Every person who signs up gets a `role` — `student`, `merchant`, `delivery`, or `admin` — stored on their account. When someone logs in, the app looks at their role and shows them a different screen:

- A **student** logging in sees: a feed of deals, a "redeem" button, order history.
- A **merchant** logging in sees: their deals, redemption stats, order requests.
- A **delivery** person logging in sees: available delivery jobs, a map, earnings.
- **You (admin)** logging in sees: a dashboard — pending merchant approvals, all users, flagged issues, platform stats.

Same login screen, same codebase, same database — the role just decides what doors open. This is exactly how apps like Uber Eats work under the hood (rider app, driver app, restaurant dashboard — all reading the same backend).

**Why one database matters:** when a student redeems a "20% off" deal at Mr. Chips, that single action needs to update three things at once — the student's redemption history, Mr. Chips' sales count, and (if it's a delivery order) create a job for a delivery person. If these lived in separate systems, they'd fall out of sync constantly. One database keeps them honest.

**Security between roles (this is what "Row Level Security" means):** Supabase lets us write rules like *"a merchant can only see their own deals and redemptions, never another merchant's"* or *"a student can only see their own order history."* You don't write these rules by hand — I write them, but you should know they exist, because it's the thing stopping a random student from seeing Mr. Chips' sales numbers.

---

## The four roles, what each one does

| Role | Core actions |
|---|---|
| **Student** | Verify school email → browse deals near campus → redeem a deal (show a code/QR at checkout, or order for delivery) → see redemption history |
| **Merchant** | Sign up + get approved by you → create/edit deals (e.g. "Tacos Tuesday, 20% off") → scan/approve student redemptions → see how many redemptions, revenue impact |
| **Delivery** | Sign up + get approved by you → go "online" → accept a delivery job → mark picked up → mark delivered → see earnings |
| **Admin (you)** | Approve new merchants and delivery people → see all activity → resolve disputes (e.g. a merchant says a student never showed up) → manage which universities are open |

Delivery is the most optional piece — plenty of campus discount apps never do delivery at all (students just walk in and show their code). I'd suggest **treating delivery as Phase 2**, after redemption-in-person works, so you're not building three roles' worth of complexity before anything is testable. I'll fold that into the phases below.

---

## The phased plan

### Phase 1 — Finish the core web app (student + merchant, in-person redemption only)
**Goal:** A student can sign up, verify their Kepler email, see Mr. Chips' Tacos Tuesday deal, and redeem it by showing a code. Mr. Chips can see that it happened.

- [x] Student registration screen
- [x] Merchant registration screen
- [ ] Login screen (both roles)
- [ ] Student home: deal feed (business name, deal, discount %, expiry)
- [ ] Deal detail + "Redeem" screen (generates a one-time code or QR)
- [ ] Merchant dashboard: create/edit a deal, see a list of redemptions
- [ ] Basic admin screen: approve/reject new merchant sign-ups

This phase has **no delivery role yet** — keep it simple, get it working, get Mr. Chips using it for real.

### Phase 2 — Add delivery
**Goal:** Students can order for delivery, not just walk-in redemption.

- [ ] Delivery sign-up + admin approval
- [ ] Order flow for students (choose items/deal → request delivery)
- [ ] Delivery dashboard: see available jobs, accept, update status
- [ ] Notifications so a delivery person knows a job came in

### Phase 3 — Turn the web app into installable apps
**Goal:** Same code, wrapped so it can go on the App Store and Play Store.

We do this with a tool called **Capacitor** — it takes your existing web app and wraps it so iOS and Android treat it like a native app, without rewriting anything. This is the realistic path for a solo, non-coding founder; a full native rewrite is a much bigger undertaking for no real benefit at your stage.

- [ ] Add Capacitor to the project
- [ ] Generate iOS project (needs a Mac + Xcode — free, but Xcode is Mac-only)
- [ ] Generate Android project (needs Android Studio — free, works on any OS)
- [ ] App icon + splash screen
- [ ] Basic push notification setup (for delivery job alerts, deal drops)

### Phase 4 — Store accounts & submission prep
**Goal:** Get accounts set up and everything the stores require, before writing any store-specific code.

- [ ] Apple Developer Program account — **$99/year**
- [ ] Google Play Developer account — **$25 one-time**
- [ ] Privacy Policy page (required by both stores — I can draft this)
- [ ] App Store screenshots + short description
- [ ] Play Store screenshots + short description
- [ ] Content rating questionnaire (both stores ask this)

### Phase 5 — Sandbox / beta testing
This is the actual answer to "when is it ready for sandbox":

- **iOS sandbox = TestFlight.** Once your iOS build is in App Store Connect, you invite real testers (you, Mr. Chips, a handful of Kepler students) by email. No public listing needed yet.
- **Android sandbox = Play Console internal/closed testing track.** Same idea — you upload the build, invite testers by email or a private link.

Both let you test with real people, on real phones, before the public release button exists. This is where you'll actually find out if verification, redemption, and delivery hold together in practice.

### Phase 6 — Public launch
Once sandbox testing looks solid: submit for App Store review, submit for Play Store review, and go live.

---

## What I need from you to keep moving

For **Phase 1** right now, the next concrete piece is the **login screen** and the **student deal feed**. I can build both today.

One thing to flag honestly: Phases 3–6 (native app wrapping, store accounts, submission) involve real costs ($99/yr + $25) and, for iOS specifically, needing access to a Mac. Worth knowing that early rather than discovering it later.
