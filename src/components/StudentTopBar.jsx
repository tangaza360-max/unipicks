import { MessageCircle } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import IconButton from './IconButton.jsx'
import Logo from './Logo.jsx'

export default function StudentTopBar({
  onMessages,
  unreadCount = 0,
  className = '',
}) {
  const { pathname } = useLocation()

  function goHome(event) {
    if (pathname !== '/dashboard' && pathname !== '/dashboard/deals') return
    event.preventDefault()
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    for (const el of [document.scrollingElement, document.querySelector('main')]) {
      el?.scrollTo?.({ top: 0, behavior: smooth ? 'smooth' : 'auto' })
    }
  }

  return (
    <header
      className={[
        'sticky top-0 z-40',
        'border-b border-border/40',
        'bg-background/[0.85] backdrop-blur-xl',
        className,
      ].join(' ')}
      style={{
        paddingTop: 'var(--safe-area-top)',
      }}
    >
      {/* Three parts: U logo (Home) on the left, the name in the middle,
          Messages on the right — the middle stays centred whatever the sides. */}
      <div className="grid h-14 grid-cols-[1fr_auto_1fr] items-center px-3 sm:px-4">
        {/* Tap the U to go Home; on Home, back to the top (like Instagram). */}
        <Link
          to="/dashboard/deals"
          onClick={goHome}
          aria-label="Go to Home"
          className="-ml-1 flex h-11 w-11 items-center justify-center justify-self-start rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* The brand green: logos are exempt from text contrast (WCAG 1.4.3). */}
          <Logo size={28} className="text-[hsl(var(--color-primary))]" />
        </Link>

        <span className="font-body text-[22px] font-semibold leading-none tracking-tight text-foreground">
          Unipicks
        </span>

        <div className="flex items-center gap-1 justify-self-end">
          <div className="relative">
            <IconButton
              ariaLabel={
                unreadCount > 0
                  ? `Messages, ${unreadCount} unread`
                  : 'Messages'
              }
              onClick={onMessages}
            >
              <MessageCircle size={21} strokeWidth={2} aria-hidden="true" />
            </IconButton>

            {unreadCount > 0 && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
              >
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}
