import { Bell, MessageCircle } from 'lucide-react'
import IconButton from './IconButton.jsx'
import Logo from './Logo.jsx'

export default function StudentTopBar({
  onActivity,
  onMessages,
  unreadCount = 0,
  showUnreadDot = false,
  className = '',
}) {
  const hasUnread = unreadCount > 0 || showUnreadDot

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
      <div className="flex h-14 items-center justify-between px-3 sm:px-4">
        <div className="flex min-w-0 items-center">
          <Logo size={24} className="text-accent" />
        </div>

        <div className="flex items-center gap-1">
          <div className="relative">
            <IconButton
              ariaLabel={
                unreadCount > 0
                  ? `Activity, ${unreadCount} unread`
                  : 'Activity'
              }
              onClick={onActivity}
            >
              <Bell size={21} strokeWidth={2} aria-hidden="true" />
            </IconButton>

            {hasUnread && (
              <span
                aria-hidden="true"
                className={[
                  'pointer-events-none absolute right-2 top-2',
                  'rounded-full bg-accent ring-2 ring-background',
                  unreadCount > 0
                    ? 'flex h-4 min-w-4 items-center justify-center px-1 text-[9px] font-bold leading-none text-accent-foreground'
                    : 'h-2.5 w-2.5',
                ].join(' ')}
              >
                {unreadCount > 0
                  ? unreadCount > 99
                    ? '99+'
                    : unreadCount
                  : null}
              </span>
            )}
          </div>

          <IconButton
            ariaLabel="Messages"
            onClick={onMessages}
          >
            <MessageCircle size={21} strokeWidth={2} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </header>
  )
}
