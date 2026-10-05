import { useState } from 'react'
import { BarChart3, Camera, ClipboardList, MessageCircle, MoreHorizontal, Settings, ShoppingBag, X } from 'lucide-react'

// Business navigation on phones (founder decision 2026-10-04, style guide §7):
// a bottom bar with icon + word, Orders first (orders must be answered within
// 5 minutes), and "More" for Stories and Messages. Hidden from md up, where
// the tabs stay. Every item is at least 44 px.
const MAIN = [
  { id: 'orders', label: 'Orders', Icon: ShoppingBag },
  { id: 'deals', label: 'Deals', Icon: ClipboardList },
  { id: 'stats', label: 'Stats', Icon: BarChart3 },
  { id: 'profile', label: 'Profile', Icon: Settings },
]
const MORE = [
  { id: 'stories', label: 'Stories', Icon: Camera },
  { id: 'messages', label: 'Messages', Icon: MessageCircle },
]

function Badge({ count }) {
  if (!count) return null
  return (
    <span
      aria-hidden="true"
      className="absolute -right-2 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold leading-none text-white"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

export default function BusinessBottomNav({ activeTab, onNavigate, pendingOrders = 0, unreadMessages = 0 }) {
  const [moreOpen, setMoreOpen] = useState(false)
  const moreActive = MORE.some((item) => item.id === activeTab)
  const badges = { orders: pendingOrders, messages: unreadMessages }

  function go(id) {
    setMoreOpen(false)
    onNavigate(id)
  }

  return (
    <>
      {moreOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-label="More"
            className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-border bg-card p-4 pb-24"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="font-display text-lg font-semibold">More</p>
              <button
                type="button"
                aria-label="Close"
                onClick={() => setMoreOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>
            {MORE.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-base ${
                  activeTab === id ? 'bg-accent/15 text-accent' : 'text-foreground hover:bg-muted'
                }`}
              >
                <span className="relative">
                  <Icon size={20} aria-hidden="true" />
                  <Badge count={badges[id]} />
                </span>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <nav
        aria-label="Business navigation"
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-background/95 backdrop-blur-xl md:hidden"
        style={{ paddingBottom: 'var(--safe-area-bottom)' }}
      >
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
          {MAIN.map(({ id, label, Icon }) => {
            const active = activeTab === id
            const count = badges[id] || 0
            return (
              <button
                key={id}
                type="button"
                onClick={() => go(id)}
                aria-current={active ? 'page' : undefined}
                aria-label={count ? `${label}, ${count} waiting` : label}
                className={`flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
                  active ? 'text-accent' : 'text-muted-foreground'
                }`}
              >
                <span className="relative">
                  <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
                  <Badge count={count} />
                </span>
                {label}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen((open) => !open)}
            aria-expanded={moreOpen}
            aria-label={unreadMessages ? `More, ${unreadMessages} unread messages` : 'More'}
            className={`flex min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
              moreActive || moreOpen ? 'text-accent' : 'text-muted-foreground'
            }`}
          >
            <span className="relative">
              <MoreHorizontal size={22} aria-hidden="true" />
              <Badge count={unreadMessages} />
            </span>
            More
          </button>
        </div>
      </nav>
    </>
  )
}
