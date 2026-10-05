import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

const DISPUTE_REASONS = [
  { value: 'item_not_received', label: 'Item not received' },
  { value: 'quality_issue', label: 'Quality issue' },
  { value: 'merchant_unresponsive', label: 'Business not responding' },
  { value: 'wrong_item', label: 'Wrong item received' },
  { value: 'other', label: 'Other' },
]

export default function RaiseDisputeModal({ order, onClose, onSuccess }) {
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!reason) {
      setError('Please select a reason.')
      return
    }
    if (reason === 'other' && !note.trim()) {
      setError('Please describe your issue when selecting Other.')
      return
    }

    setSubmitting(true)
    const { error: rpcError } = await supabase.rpc('raise_order_dispute', {
      p_order_id: order.id,
      p_reason: reason,
      p_note: note.trim() || null,
    })
    setSubmitting(false)

    if (rpcError) {
      setError(rpcError.message || 'Could not raise the dispute.')
      return
    }

    onSuccess()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl">
        <h2 className="font-display text-lg font-semibold">Raise a dispute</h2>
        <p className="text-muted-foreground text-sm mt-1">
          {order.deals?.title || 'Order'}
          {order.deals?.business_name ? ` · ${order.deals.business_name}` : ''}
        </p>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="field-label">Reason</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="field-input"
            >
              <option value="">Select a reason…</option>
              {DISPUTE_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="field-label">
              Details {reason === 'other' ? '(required)' : '(optional)'}
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="field-input min-h-[90px] resize-y"
              placeholder="Describe what happened…"
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {note.length}/500 characters
            </p>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2.5 transition disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-primary text-primary-foreground font-semibold rounded-lg px-4 py-2.5 transition disabled:opacity-50"
            >
              {submitting ? 'Submitting…' : 'Submit dispute'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
