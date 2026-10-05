import {
  Camera,
  Home,
  Search,
  User,
  Users,
} from 'lucide-react'
import IconButton from './IconButton.jsx'
import { haptic } from '../lib/haptics.js'

const navigationItems = [
  {
    id: 'home',
    label: 'Home',
    Icon: Home,
  },
  {
    id: 'search',
    label: 'Search',
    Icon: Search,
  },
  {
    id: 'social',
    label: 'Social',
    Icon: Users,
  },
  {
    id: 'profile',
    label: 'Profile',
    Icon: User,
  },
]

export default function StudentBottomNav({
  activeTab = 'home',
  onNavigate,
  onCamera,
  badges = {},
  className = '',
}) {
  function handleNavigate(tab) {
    onNavigate?.(tab)
  }

  return (
    <nav
      aria-label="Student navigation"
      className={[
        'fixed inset-x-0 bottom-0 z-40',
        'border-t border-border/40',
        'bg-background/90 backdrop-blur-xl',
        className,
      ].join(' ')}
      style={{
        paddingBottom: 'var(--safe-area-bottom)',
      }}
    >
      {/* Order decided in social audit D1: Home · Search · Social · Profile · Camera.
          The camera is photo capture + share to other apps ("Snap & share", D4). */}
      <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center px-2">
        <NavItem
          item={navigationItems[0]}
          active={activeTab === navigationItems[0].id}
          onClick={() => handleNavigate(navigationItems[0].id)}
        />

        <NavItem
          item={navigationItems[1]}
          active={activeTab === navigationItems[1].id}
          onClick={() => handleNavigate(navigationItems[1].id)}
        />

        <NavItem
          item={navigationItems[2]}
          active={activeTab === navigationItems[2].id}
          onClick={() => handleNavigate(navigationItems[2].id)}
          badgeCount={badges.social}
          badgeLabel={(n) => `${n} new`}
        />

        <NavItem
          item={navigationItems[3]}
          active={activeTab === navigationItems[3].id}
          onClick={() => handleNavigate(navigationItems[3].id)}
          badgeCount={badges.profile}
          badgeLabel={(n) => `${n} update${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} your attention`}
        />

        <div className="flex items-center justify-center">
          <IconButton
            ariaLabel="Snap & share"
            onClick={onCamera}
            hapticPattern={10}
            className={[
              'h-12 w-12 min-h-12 min-w-12',
              'bg-accent text-accent-foreground',
              'shadow-lg shadow-accent/20',
              'hover:bg-accent/90 hover:text-accent-foreground',
              'active:bg-accent/80 active:text-accent-foreground',
              'active:scale-90',
            ].join(' ')}
          >
            <Camera size={22} strokeWidth={2.25} aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </nav>
  )
}

// Icon + word (style guide §7, audit G9): new students should not have to guess.
function NavItem({ item, active, onClick, badgeCount = 0, badgeLabel }) {
  const { Icon, label } = item
  const showBadge = badgeCount > 0

  return (
    <button
      type="button"
      onClick={() => {
        haptic(10)
        onClick?.()
      }}
      aria-label={showBadge && badgeLabel ? `${label}, ${badgeLabel(badgeCount)}` : label}
      aria-current={active ? 'page' : undefined}
      className={[
        'flex h-full min-h-11 flex-col items-center justify-center gap-0.5 text-xs font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-lg',
        active ? 'text-accent' : 'text-muted-foreground hover:text-foreground',
      ].join(' ')}
    >
      <span className="relative">
        <Icon size={22} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
        {showBadge && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute -right-2.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold leading-none text-white"
          >
            {badgeCount > 99 ? '99+' : badgeCount}
          </span>
        )}
      </span>
      {label}
    </button>
  )
}
