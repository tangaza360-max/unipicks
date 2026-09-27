import { MessageCircle } from 'lucide-react'
import IconButton from './IconButton.jsx'
import Logo from './Logo.jsx'

export default function StudentTopBar({
  onMessages,
  unreadCount = 0,
  className = '',
}) {
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
                className="pointer-events-none absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background"
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
