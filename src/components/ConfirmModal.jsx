// src/components/ConfirmModal.jsx
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
  if (!isOpen) return null

  const isDanger = confirmVariant === 'danger'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-200">
        <h3 className="font-display text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground text-sm">{message}</p>
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className="flex-1 border border-border text-muted-foreground hover:text-foreground rounded-lg py-2.5 text-sm font-medium transition"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 rounded-lg py-2.5 text-sm font-medium transition ${
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
