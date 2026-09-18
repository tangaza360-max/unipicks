import {
  Camera,
  Home,
  Search,
  ShoppingBag,
  User,
} from 'lucide-react'
import IconButton from './IconButton.jsx'

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
    id: 'group-orders',
    label: 'Group Orders',
    Icon: ShoppingBag,
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

        <div className="flex items-center justify-center">
          <IconButton
            ariaLabel="Open camera"
            onClick={onCamera}
            hapticPattern={10}
            className={[
              'h-14 w-14 min-h-14 min-w-14',
              'bg-accent text-accent-foreground',
              'shadow-lg shadow-accent/20',
              'hover:bg-accent/90 hover:text-accent-foreground',
              'active:bg-accent/80 active:text-accent-foreground',
              'active:scale-90',
            ].join(' ')}
          >
            <Camera size={25} strokeWidth={2.25} aria-hidden="true" />
          </IconButton>
        </div>

        <NavItem
          item={navigationItems[2]}
          active={activeTab === navigationItems[2].id}
          onClick={() => handleNavigate(navigationItems[2].id)}
        />

        <NavItem
          item={navigationItems[3]}
          active={activeTab === navigationItems[3].id}
          onClick={() => handleNavigate(navigationItems[3].id)}
        />
      </div>
    </nav>
  )
}

function NavItem({ item, active, onClick }) {
  const { Icon, label } = item

  return (
    <div className="flex items-center justify-center">
      <IconButton
        ariaLabel={label}
        active={active}
        onClick={onClick}
        className={[
          'h-11 w-11 min-h-11 min-w-11',
          active ? 'text-accent' : 'text-muted-foreground',
        ].join(' ')}
      >
        <Icon
          size={22}
          strokeWidth={active ? 2.5 : 2}
          fill={active ? 'currentColor' : 'none'}
          aria-hidden="true"
        />
      </IconButton>
    </div>
  )
}
