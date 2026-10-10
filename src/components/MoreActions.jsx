import { useEffect, useId, useRef, useState } from 'react'
import { MoreHorizontal } from 'lucide-react'

// A "⋯" button that shows less-used actions (like Delete) only when asked,
// so they are not one tap away on every card. Disclosure pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/): the button says if
// it is open; Escape, a tap outside or the button again close it.
// items: [{ label, onClick, danger }]
export default function MoreActions({ label, items }) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef(null)
  const buttonRef = useRef(null)
  const panelId = useId()

  useEffect(() => {
    if (!open) return undefined
    function onPointer(event) {
      if (!wrapRef.current?.contains(event.target)) setOpen(false)
    }
    function onKey(event) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={wrapRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <MoreHorizontal size={20} aria-hidden="true" />
      </button>
      <div
        id={panelId}
        hidden={!open}
        className="absolute bottom-full right-0 z-20 mb-2 min-w-44 rounded-xl border border-border bg-card p-1 shadow-lg"
      >
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => {
              setOpen(false)
              item.onClick()
            }}
            className={`flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm font-semibold transition hover:bg-muted ${
              item.danger ? 'text-[color:var(--status-bad-fg)]' : 'text-foreground'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
