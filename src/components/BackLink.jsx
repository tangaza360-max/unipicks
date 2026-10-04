import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

// The one "Back" link at the top of a screen (style guide §7): grey, arrow +
// "Back", at least 44 px tall so it is easy to tap. Pass `to` for a link or
// `onClick` for an in-screen step back.
const CLASSES =
  'inline-flex min-h-11 items-center gap-1.5 -ml-1 px-1 text-sm font-medium text-muted-foreground hover:text-foreground transition print:hidden'

export default function BackLink({ to, onClick, label = 'Back' }) {
  const content = (
    <>
      <ArrowLeft size={18} aria-hidden="true" />
      <span>{label}</span>
    </>
  )
  if (to) {
    return (
      <Link to={to} className={CLASSES}>
        {content}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={CLASSES}>
      {content}
    </button>
  )
}
