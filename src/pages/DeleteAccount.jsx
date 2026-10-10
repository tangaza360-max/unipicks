import { Link, useSearchParams } from 'react-router-dom'
import { SUPPORT_EMAIL } from '../lib/support.js'
import BackLink from '../components/BackLink.jsx'

// Public page (no login): how to delete a Unipicks account and what happens
// to the data. Required by Apple App Store 5.1.1(v) and Google Play's account
// deletion policy, including a way to ask without signing in.
// Describes the tombstone in supabase/migrations/20261003220000 and 20261003240000.


const deleted = [
  'Your profile: name, photo, bio, student ID and university details',
  'Friends, friend and message requests, blocks you made, stories, reactions, follows, interests and saved deals',
  'Your notifications, deal views and search history',
  'Your login: email address, password and every signed-in device',
  'For businesses: the business profile, logo, stories and deal images (deals are switched off)',
]

const kept = [
  ['Orders and payments', 'Amount, date, status and pickup code, needed for accounting, refunds and disputes. Your name, phone number and mobile-money wallet details are removed.'],
  ['Chat messages', 'Kept for the other person (they may contain pickup codes or dispute evidence) and shown as “Deleted user”.'],
  ['Ratings', 'The star score stays on the deal; your review text is removed.'],
  ['Safety reports', 'Reports made by or about the account are kept for moderation.'],
  ['Group orders already submitted', 'Kept for the other members, shown as “Deleted user”.'],
]

export default function DeleteAccount() {
  const [params] = useSearchParams()
  const justDeleted = params.get('deleted') === '1'

  // Right after a deletion: confirmation only, none of the how-to content.
  if (justDeleted) {
    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <article className="mx-auto max-w-3xl space-y-6">
          <BackLink to="/register" />
          <h1 className="font-display text-3xl font-semibold">Your account has been deleted</h1>
          <p role="status" className="rounded-2xl border border-border bg-card p-4 text-sm">
            Your account has been deleted and you have been signed out on every device.
          </p>
          <p className="text-muted-foreground leading-7">
            You can sign up again at any time with the same email address.
          </p>
          <Link
            to="/register"
            className="inline-flex min-h-11 items-center rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground"
          >
            Create a new account
          </Link>
        </article>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <BackLink to="/register" />
          <h1 className="font-display text-3xl font-semibold">Delete your Unipicks account</h1>
          <p className="text-muted-foreground">Last updated: October 3, 2026</p>
        </header>

        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">How to delete your account</h2>
          <ol className="list-decimal pl-5 text-muted-foreground leading-7">
            <li>Sign in to Unipicks.</li>
            <li>Students: open <strong className="text-foreground">Profile → Settings → Account</strong>. Businesses: open <strong className="text-foreground">Profile</strong> (Business Profile).</li>
            <li>Tap <strong className="text-foreground">Delete account</strong>, read what happens, and confirm with your password.</li>
          </ol>
          <p className="text-muted-foreground leading-7">
            Deletion is immediate and permanent. You are signed out everywhere and the account can't be recovered.
          </p>
        </section>

        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Can't sign in?</h2>
          <p className="text-muted-foreground leading-7">
            Email <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%20Unipicks%20account`} className="text-primary underline underline-offset-2 hover:decoration-2">{SUPPORT_EMAIL}</a> from
            the email address on the account, with the subject “Delete my Unipicks account”. We'll confirm the request
            with you before deleting.
          </p>
        </section>

        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">When deletion isn't possible yet</h2>
          <ul className="list-disc pl-5 text-muted-foreground leading-7">
            <li>You have an active order (awaiting the business, awaiting payment, or paid but not yet collected).</li>
            <li>You have an open dispute.</li>
            <li>You are hosting a group order that is still open.</li>
          </ul>
          <p className="text-muted-foreground leading-7">Finish, collect or cancel these first, then try again.</p>
        </section>

        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">What is deleted</h2>
          <ul className="list-disc pl-5 text-muted-foreground leading-7">
            {deleted.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>

        <section className="space-y-3 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">What is kept, and why</h2>
          <p className="text-muted-foreground leading-7">
            Some records involve other people or are needed for accounting, so they stay without your name
            or contact details:
          </p>
          <dl className="space-y-3">
            {kept.map(([title, body]) => (
              <div key={title}>
                <dt className="font-medium">{title}</dt>
                <dd className="text-muted-foreground leading-7">{body}</dd>
              </div>
            ))}
          </dl>
          <p className="text-muted-foreground leading-7">
            Order and payment records are kept for a <strong className="text-foreground">minimum of 5 years</strong>.
          </p>
        </section>

        <section className="space-y-2 border-t border-border pt-6">
          <h2 className="font-display text-xl font-semibold">Signing up again</h2>
          <p className="text-muted-foreground leading-7">
            You can register again with the same email address. It creates a new, empty account; nothing from the
            deleted account is restored.
          </p>
        </section>

        <footer className="space-y-2 border-t border-border pt-6 text-sm text-muted-foreground">
          <p>Subject to change — see our <Link to="/privacy" className="text-primary underline underline-offset-2 hover:decoration-2">Privacy Policy</Link> for the current retention period.</p>
          <p><Link to="/terms" className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:decoration-2">Terms of Service</Link></p>
        </footer>
      </article>
    </main>
  )
}
