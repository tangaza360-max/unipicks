import { Link } from 'react-router-dom'

const sections = [
  ['Information we collect', 'We collect account details such as your name, email address, phone number, university, student ID, and business information when you register. We also collect orders, reviews, notifications, and technical information needed to keep Unipicks secure and reliable.'],
  ['How we use information', 'We use information to provide student discounts, authenticate users, process orders, support merchants, moderate content, send service notifications, and improve the platform. We do not sell personal information.'],
  ['Sharing and visibility', 'Students and merchants see only the information needed for their workflows. Public deal pages may include business names, deal details, images, and aggregated ratings. We may share information with service providers such as Supabase when needed to operate the service.'],
  ['Data retention and security', 'We retain account and transaction records while your account is active or as needed for legitimate business, legal, and security purposes. We use access controls and row-level security, but no online service can guarantee absolute security.'],
  ['Your choices', 'You may update profile information from your account, request access to or deletion of personal information where applicable, and opt out of non-essential communications. Transactional messages may still be required to provide the service.'],
  ['Children and contact', 'Unipicks is intended for students and businesses, not children under 13. For privacy questions or requests, contact us through the support email listed in the platform settings.'],
]

export default function Privacy() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <Link to="/register" className="text-sm text-primary hover:underline">← Back to Unipicks</Link>
          <h1 className="font-display text-3xl font-semibold">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: September 4, 2026</p>
        </header>
        <p className="text-muted-foreground leading-7">This Privacy Policy explains how Unipicks collects, uses, and protects information when you use our student discount platform.</p>
        {sections.map(([title, body]) => (
          <section key={title} className="space-y-2 border-t border-border pt-6">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground leading-7">{body}</p>
          </section>
        ))}
        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
        </footer>
      </article>
    </main>
  )
}
