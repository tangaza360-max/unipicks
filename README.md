# Unipicks

Verified student discounts from local businesses, starting at Kepler College.

## What's built so far

- Registration screen (`/register`) with a Student / Merchant toggle:
  - **Student:** full name, phone, email, password, university picker,
    student ID number, terms checkbox, and email-domain verification
    against `@keplercollege.ac.rw`.
  - **Merchant:** full name, phone, email, password, business name, RDB
    number, address, and the same terms checkbox.
- Both flows create a Supabase auth user tagged with `role: 'student'` or
  `role: 'merchant'` in the user's metadata, so you can branch on it later.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a free project at [supabase.com](https://supabase.com). In your
   project's Settings → API, copy the **Project URL** and **anon public key**.

3. Copy the env file and fill in those two values:

   ```bash
   cp .env.example .env
   ```

4. Run the app:

   ```bash
   npm run dev
   ```

   Open the URL it prints (usually `http://localhost:5173/register`).

## How email verification works

`src/lib/universities.js` maps each university to its verified student email
domain. Kepler College is set to `keplercollege.ac.rw` — sign-ups are
rejected client-side if the email doesn't match. Universities with
`domain: null` show in the dropdown but aren't open for sign-up yet; add
their real domain there to launch them.

Right now this checks the domain matches — it doesn't yet confirm the
student actually owns that inbox. Supabase's built-in email confirmation
(a toggle in your Supabase project's Auth settings, no code change needed)
adds that when you're ready for a real launch.

## Next steps

- Build the login screen
- Build the discounts feed (business, deal, discount %, expiry)
- Turn on Supabase email confirmation before real launch
