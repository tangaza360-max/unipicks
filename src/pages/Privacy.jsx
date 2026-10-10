import { Link } from 'react-router-dom'
import { SUPPORT_EMAIL } from '../lib/support.js'
import BackLink from '../components/BackLink.jsx'

const sections = [
  ['Information we collect', 'We collect account details such as your name, email address, phone number, university, student ID, and business information when you register. We also collect your orders and payments, reviews, messages, friends, stories, notifications, and technical information needed to keep Unipicks secure and reliable.'],
  ['How we use information', 'We use information to provide student discounts, authenticate users, process orders and payments, support businesses, moderate content, send service notifications, and improve the platform. We do not sell personal information.'],
  ['Payments', 'When you pay, the MoMo number you enter and the amount are sent to UmunotaPay, our payment provider, which asks your mobile money provider (MTN MoMo or Airtel Money) to collect the payment. We keep the number on the order, the amount, the payment reference and its status. We never see your MoMo PIN.'],
  ['Camera, photos and stories', 'The camera only opens when you tap it. Filters, text and place names are added on your phone. A photo or GIF leaves your phone only if you post it to your story, save it or share it. Your story is visible only to your friends, for 24 hours; you can see who viewed it. Ended stories (photo and record) are deleted 48 hours after they end, unless someone reported them: then they are kept until an admin has looked at the report. A place on a story is only a name you choose from a list; we never use your location.'],
  ['Messages and friends', 'Messages you send are stored so the other person can read them. Your friends can see your profile and your stories. Business stories are public for 24 hours.'],
  ['Sharing and visibility', 'Students and businesses see only the information needed for their workflows. Public deal pages may include business names, deal details, images, and aggregated ratings. Our service providers are: Supabase (database, accounts and photos; servers in Frankfurt, EU), UmunotaPay (payments), Sentry (error reports, EU), and, for businesses who use the AI deal helper, Google Gemini (receives the deal description, price and discount you type). When the app crashes, technical error details (the error message, the page address without any codes in it, and the browser and device type) are sent to Sentry so we can fix problems; no names, emails or phone numbers are included. If you turn on phone alerts, we store the alert address your browser gives us for this phone, and short alert texts (for example the deal name) pass through your phone\'s alert service (Google, Apple or Mozilla). Alerts never include pickup codes or phone numbers. Turn them off or log out to stop them on that phone.'],
  ['Password check', 'When you choose a password, the app checks that it has not appeared in a public data leak, using the Pwned Passwords service. Only the first 5 characters of a scrambled code (SHA-1) of your password are sent, never the password itself.'],
  ['Data retention and security', 'We retain account and transaction records while your account is active or as needed for legitimate business, legal, and security purposes. Stories are deleted as described above. We use access controls, row-level security and security headers, but no online service can guarantee absolute security.'],
  ['Your choices', 'You may update profile information from your account, request access to personal information (you can download a copy of your data at any time in Profile → Settings → Download my data), delete your account at any time (see Delete your account below), turn phone alerts off, and opt out of non-essential communications. Transactional messages may still be required to provide the service.'],
  ['Children and contact', `Unipicks is intended for students and businesses, not children under 13. For privacy questions or requests, email ${SUPPORT_EMAIL}.`],
]

export default function Privacy() {
  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <BackLink to="/register" />
          <h1 className="font-display text-3xl font-semibold">Privacy Policy</h1>
          <p className="text-muted-foreground">Last updated: October 8, 2026</p>
        </header>
        <p className="text-muted-foreground leading-7">This Privacy Policy explains how Unipicks collects, uses, and protects information when you use our student discount platform.</p>
        {sections.map(([title, body]) => (
          <section key={title} className="space-y-2 border-t border-border pt-6">
            <h2 className="font-display text-xl font-semibold">{title}</h2>
            <p className="text-muted-foreground leading-7">{body}</p>
          </section>
        ))}
        <footer className="border-t border-border pt-6 text-sm text-muted-foreground">
          <Link to="/terms" className="text-primary underline underline-offset-2 hover:decoration-2">Terms of Service</Link>
          {' · '}
          <Link to="/delete-account" className="text-primary underline underline-offset-2 hover:decoration-2">Delete your account</Link>
        </footer>
      </article>
    </main>
  )
}
