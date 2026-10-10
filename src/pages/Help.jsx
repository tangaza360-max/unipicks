import { Link, useLocation } from 'react-router-dom'
import { ChevronDown, Mail, MessageCircle } from 'lucide-react'
import BackLink from '../components/BackLink.jsx'
import { SUPPORT_EMAIL, SUPPORT_WHATSAPP } from '../lib/support.js'
import { formatWhatsapp, whatsappLink } from '../lib/whatsapp.js'

// Back goes where the person came from: their profile, or the log-in page
// (Help also opens for people who can't log in).
const BACK_TO = ['/dashboard/profile', '/login']

const LINK = 'text-accent underline underline-offset-2 hover:decoration-2'

// Same facts as agents/support-agent.md §3 — change both together.
const ANSWERS = [
  {
    q: 'I paid, but my order says "Payment expired"',
    a: <>If your money arrived a little late, your order still becomes <strong>Paid</strong>. Check My orders again in a few minutes. If it still doesn't say Paid, contact us with your order number.</>,
  },
  {
    q: "The business didn't accept my order",
    a: <>A business has 5 minutes to accept. If it doesn't, the order ends and you pay nothing. You can order again.</>,
  },
  {
    q: "I didn't get the MoMo prompt",
    a: <>Check the phone number on the payment page, then tap Pay Now again while the timer is running. If the time runs out, nothing is paid.</>,
  },
  {
    q: "My pickup code doesn't work",
    a: <>Ask the business to type the 4 numbers again in Check code. If it still doesn't work, contact us with your order number.</>,
  },
  {
    q: 'I got the wrong item, bad food, or no food',
    a: <>Raise a dispute: <strong>Profile → My orders → your order → Raise a dispute</strong>. We review every dispute and reply within 24 hours.</>,
  },
  {
    q: 'Can I cancel a paid order?',
    a: <>Not in the app. If the business can't serve you, raise a dispute and we'll look into it.</>,
  },
  {
    q: "I didn't get the confirmation email",
    a: <>Check your spam folder. Student accounts need an email ending in @keplercollege.ac.rw.</>,
  },
  {
    q: 'I forgot my password',
    a: <>Use <Link to="/forgot-password" className={LINK}>Forgot password</Link>. We'll email you a link.</>,
  },
  {
    q: 'My university or student ID is wrong',
    a: <>You can't change these yourself. Contact us and we'll fix it.</>,
  },
  {
    q: 'Business: why can\'t I post deals yet?',
    a: <>Every new business is checked by Unipicks before it can post deals. Changing your business name or RDB number needs a new check. We reply within 24 hours.</>,
  },
  {
    q: 'How do I delete my account?',
    a: <>Profile → Delete account. <Link to="/delete-account" className={LINK}>Read what is deleted and what is kept</Link>.</>,
  },
]

export default function Help() {
  const { state } = useLocation()
  const backTo = BACK_TO.includes(state?.from) ? state.from : '/login'
  const whatsapp = whatsappLink(SUPPORT_WHATSAPP)

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <BackLink to={backTo} />
          <h1 className="font-display text-3xl font-semibold">Help</h1>
          <p className="text-muted-foreground">A question, or a problem with an order? We're here.</p>
        </header>

        <section aria-labelledby="help-contact" className="space-y-4 rounded-2xl border border-border bg-card p-5">
          <h2 id="help-contact" className="font-display text-xl font-semibold">Contact us</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Unipicks help')}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
            >
              <Mail size={18} aria-hidden="true" />
              Email {SUPPORT_EMAIL}
            </a>
            {whatsapp && (
              <a
                href={whatsapp}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold"
              >
                <MessageCircle size={18} aria-hidden="true" />
                WhatsApp {formatWhatsapp(SUPPORT_WHATSAPP)}
              </a>
            )}
          </div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            <li>We answer within <strong className="text-foreground">24 hours</strong>. Paid but no food? We answer <strong className="text-foreground">the same day</strong>.</li>
            <li>Tell us your order number: My orders → View receipt → "No. …".</li>
            <li>Never send your MoMo PIN, password or pickup code — not even to us.</li>
          </ul>
        </section>

        <section aria-labelledby="help-answers" className="space-y-3">
          <h2 id="help-answers" className="font-display text-xl font-semibold">Quick answers</h2>
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {ANSWERS.map(({ q, a }) => (
              <details key={q} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium hover:bg-muted/50 [&::-webkit-details-marker]:hidden">
                  {q}
                  <ChevronDown size={18} aria-hidden="true" className="shrink-0 text-muted-foreground transition group-open:rotate-180" />
                </summary>
                <p className="px-4 pb-4 text-sm leading-6 text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/terms" className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:decoration-2">Terms of Service</Link>
          {' · '}
          <Link to="/privacy" className="inline-flex min-h-11 items-center text-primary underline underline-offset-2 hover:decoration-2">Privacy Policy</Link>
        </footer>
      </article>
    </main>
  )
}
