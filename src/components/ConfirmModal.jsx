// src/components/ConfirmModal.jsx
import { useEffect, useId, useRef } from 'react'

// "Are you sure?" window. Modal dialog pattern
// (https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): announced as a
// dialog with its title and message; focus starts on Cancel (the safe choice);
// Tab stays inside; Escape cancels; focus returns to what opened it.
export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'This action cannot be undone.',
  confirmText = 'Yes, delete',
  cancelText = 'Cancel',
  confirmVariant = 'danger',
}) {
  const titleId = useId()
  const messageId = useId()
  const boxRef = useRef(null)
  const cancelRef = useRef(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!isOpen) return undefined
    const opener = document.activeElement
    cancelRef.current?.focus()
    function onKey(event) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
      } else if (event.key === 'Tab') {
        const buttons = [...(boxRef.current?.querySelectorAll('button') || [])]
        if (buttons.length === 0) return
        const first = buttons[0]
        const last = buttons[buttons.length - 1]
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault()
          last.focus()
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault()
          first.focus()
        } else if (!boxRef.current?.contains(document.activeElement)) {
          event.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && document.contains(opener)) opener.focus?.()
    }
  }, [isOpen])

  if (!isOpen) return null

  const isDanger = confirmVariant === 'danger'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        className="bg-card border border-border rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200"
      >
        <h3 id={titleId} className="font-display text-lg font-semibold">{title}</h3>
        <p id={messageId} className="text-muted-foreground text-sm">{message}</p>
        <div className="flex gap-3 pt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            className="min-h-11 flex-1 border border-border text-muted-foreground hover:text-foreground rounded-lg py-2.5 text-sm font-medium transition"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`min-h-11 flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
              isDanger
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-accent hover:bg-accent-dim text-background-foreground'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  )
}
