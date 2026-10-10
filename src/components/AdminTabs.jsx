import { useEffect, useRef } from 'react'
import { ClipboardCheck, GraduationCap, BarChart3, Users, Settings, FileClock, FileText, AlertCircle, Flag, HandCoins } from 'lucide-react'

const TABS = [
  { id: 'approvals', label: 'Approvals', icon: ClipboardCheck },
  { id: 'student-view', label: 'Students', icon: GraduationCap },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'activity-logs', label: 'Activity logs', icon: FileClock },
  { id: 'reviews', label: 'Reviews', icon: FileText },
  { id: 'disputes', label: 'Disputes', icon: AlertCircle },
  { id: 'refunds', label: 'Refunds', icon: HandCoins },
  { id: 'reports', label: 'Reports', icon: Flag },
]

function CountBadge({ count, label, plural = `${label}s` }) {
  if (count <= 0) return null
  return (
    <span
      className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white"
      aria-label={`${count} ${count === 1 ? label : plural}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

// The admin sections. On a phone they are one row you swipe sideways (before:
// 9 buttons wrapped into 4 rows, half the screen); on a computer they wrap.
// The open section is scrolled into view when it changes, and again if the
// buttons change size just after (the font loads, a count bubble appears).
export default function AdminTabs({ active, onSelect, openDisputeCount = 0, openReportCount = 0, refundToDoCount = 0 }) {
  const rowRef = useRef(null)

  useEffect(() => {
    const row = rowRef.current
    if (!row) return undefined
    function align() {
      const button = row.querySelector('[aria-current="page"]')
      if (!button) return
      // Only the row scrolls (scrollIntoView could also move the page).
      const left = button.offsetLeft - row.offsetLeft
      if (left < row.scrollLeft || left + button.offsetWidth > row.scrollLeft + row.clientWidth) {
        row.scrollLeft = left - (row.clientWidth - button.offsetWidth) / 2
      }
    }
    align()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observer = new ResizeObserver(align)
    for (const button of row.children) observer.observe(button)
    // Stop following after 3 seconds (slow phone internet): after that, a swipe by
    // the admin is never undone.
    const stop = setTimeout(() => observer.disconnect(), 3000)
    return () => {
      clearTimeout(stop)
      observer.disconnect()
    }
  }, [active])

  return (
    <nav aria-label="Admin sections" className="mb-4 border-b border-border pb-3">
      <div ref={rowRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
        {TABS.map((tab) => {
          const Icon = tab.icon
          const current = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onSelect(tab.id)}
              aria-current={current ? 'page' : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition ${
                current ? 'bg-primary text-primary-foreground' : 'border border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon size={16} aria-hidden="true" />
              <span>{tab.label}</span>
              {tab.id === 'disputes' && <CountBadge count={openDisputeCount} label="open dispute" />}
              {tab.id === 'reports' && <CountBadge count={openReportCount} label="open report" />}
              {tab.id === 'refunds' && <CountBadge count={refundToDoCount} label="refund to do" plural="refunds to do" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
