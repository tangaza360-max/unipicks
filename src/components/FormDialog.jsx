import { useEffect, useId, useRef } from 'react'

// A window with a small form (modal dialog pattern,
// https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): announced as a
// dialog with its title; focus starts on the first field (on the dialog itself
// while its content loads; pass `focusKey` so it moves to the first field once
// the fields appear); Tab stays inside; Escape closes (not while saving);
// focus returns to what opened it.
// ConfirmModal is the same for a plain "Are you sure?".
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusFirst(box) {
  const first = box?.querySelector('input:not([type=radio]), select, textarea, input') || box?.querySelector(FOCUSABLE)
  ;(first || box)?.focus()
}

export default function FormDialog({ title, description, onClose, busy = false, focusKey = null, children }) {
  const titleId = useId()
  const descriptionId = useId()
  const boxRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => {
    const opener = document.activeElement
    focusFirst(boxRef.current)
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (!busyRef.current) onCloseRef.current()
      } else if (event.key === 'Tab') {
        const items = [...(boxRef.current?.querySelectorAll(FOCUSABLE) || [])]
        if (items.length === 0) return
        const head = items[0]
        const tail = items[items.length - 1]
        if (!boxRef.current?.contains(document.activeElement)) {
          event.preventDefault()
          head.focus()
        } else if (event.shiftKey && document.activeElement === head) {
          event.preventDefault()
          tail.focus()
        } else if (!event.shiftKey && document.activeElement === tail) {
          event.preventDefault()
          head.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus?.()
    }
  }, [])

  // New fields appeared (e.g. the order finished loading): start on the first one.
  useEffect(() => {
    if (focusKey === null) return
    const box = boxRef.current
    if (!box?.contains(document.activeElement) || document.activeElement === box) focusFirst(box)
  }, [focusKey])

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl outline-none"
      >
        <div>
          <h3 id={titleId} className="font-display text-lg font-semibold">{title}</h3>
          {description && <div id={descriptionId} className="mt-1 text-sm text-muted-foreground">{description}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}
