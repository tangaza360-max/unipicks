import { Link } from 'react-router-dom'
import { SUPPORT_EMAIL } from '../lib/support.js'
import BackLink from '../components/BackLink.jsx'

const sections = [
  ['Using Unipicks', 'You must provide accurate account information, keep your credentials secure, and use the platform lawfully. Accounts are personal and may not be shared or used to impersonate another person or business.'],
  ['Students', 'Students are responsible for presenting valid order codes, following deal conditions, and checking prices and availability with businesses. An order does not guarantee availability if a deal has expired or a business has reached its stated limits.'],
  ['Businesses', 'Businesses must provide accurate deal descriptions, prices, expiry dates, images, and business information. Businesses are responsible for honoring active deals and handling orders fairly. Unipicks may review, pause, or remove deals that violate these terms.'],
  ['Orders and payment', 'When you order, the business has 5 minutes to accept. After it accepts, you have 5 minutes to pay with mobile money through UmunotaPay. If the business declines or the time runs out, you are not charged. After you pay, you get a pickup code; the business tells you when your food is ready, and you show the code at the counter.'],
  ['Refunds', 'If you paid and the business cannot give you your order, raise a dispute from your order. If we agree, we refund the full amount to the MoMo number you paid with.'],
  ['Group orders', 'In a group order, the host pays the whole order and receives the pickup code. Members settle their share with the host themselves; Unipicks does not record those payments.'],
  ['Stories and community rules', 'Only post photos you have the right to share. Do not post nudity, violence, hate, harassment, or photos of other people without their permission. Anyone who sees a story can report it; we may remove content and suspend accounts that break these rules.'],
  ['Reviews and content', 'Only students who have completed an eligible order may submit a rating. Reviews must be honest, relevant, and respectful. We may remove unlawful, abusive, deceptive, or otherwise inappropriate content.'],
  ['Administrators and enforcement', 'Administrators may approve businesses, manage platform settings, moderate content, and suspend accounts when needed to protect users or the service. Administrative actions may be recorded in an audit log.'],
  ['Disclaimer and liability', 'Unipicks provides a platform connecting students and businesses. Businesses are responsible for their goods, services, prices, and compliance obligations. To the extent permitted by law, Unipicks is not responsible for business conduct, unavailable deals, or indirect losses.'],
  ['Changes and contact', `We may update these terms as the service evolves. Continued use after an update means you accept the revised terms. Questions: email ${SUPPORT_EMAIL}.`],
]

export default function Terms() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <BackLink to="/register" />
          <h1 className="font-display text-3xl font-semibold">Terms of Service</h1>
          <p className="text-muted-foreground">Last updated: October 8, 2026</p>
        </header>
        <p className="text-muted-foreground leading-7">These Terms of Service govern your use of Unipicks, a platform for discovering and ordering student discounts from local businesses.</p>
        {sections.map(([title, body]) => (
          <section key={title} className="space-y-2 border-t border-border pt-6">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground leading-7">{body}</p>
          </section>
        ))}
        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
        </footer>
      </article>
    </main>
  )
}
