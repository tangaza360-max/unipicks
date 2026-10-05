import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { formatMoney } from '../lib/format.js'

const DISPUTE_STATUS_LABELS = {
  open: 'Open',
  under_review: 'Under review',
  resolved: 'Resolved',
  rejected: 'Rejected',
}

const DISPUTE_REASON_LABELS = {
  item_not_received: 'Item not received',
  quality_issue: 'Quality issue',
  merchant_unresponsive: 'Business not responding',
  wrong_item: 'Wrong item',
  other: 'Other',
}

export default function AdminDisputes() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('active')
  const [target, setTarget] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadOrders()
  }, [filter])

  async function loadOrders() {
    setLoading(true)
    setError('')

    let q = supabase
      .from('orders')
      .select(`
        id, deal_id, student_id, merchant_id, quantity, unit_price, total_price,
        status, dispute_status, dispute_reason, dispute_raised_at,
        dispute_resolution_note, created_at,
        deals (title, business_name)
      `)
      .not('dispute_status', 'is', null)
      .order('dispute_raised_at', { ascending: false })

    if (filter === 'active') {
      q = q.in('dispute_status', ['open', 'under_review'])
    } else if (filter === 'resolved') {
      q = q.eq('dispute_status', 'resolved')
    } else if (filter === 'rejected') {
      q = q.eq('dispute_status', 'rejected')
    }

    const { data, error: fetchError } = await q
    if (fetchError) {
      setError(fetchError.message)
    } else {
      setOrders(data || [])
    }
    setLoading(false)
  }

  async function handleResolve(newStatus) {
    if (!target) return
    setSubmitting(true)
    setError('')

    const { error: rpcError } = await supabase.rpc('resolve_order_dispute', {
      p_order_id: target.id,
      p_status: newStatus,
      p_resolution_note: note.trim() || null,
    })

    setSubmitting(false)

    if (rpcError) {
      setError(rpcError.message)
      return
    }
    setTarget(null)
    setNote('')
    loadOrders()
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading disputes…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-display text-lg font-semibold">Disputes</h2>
        <div className="flex gap-2">
          {[
            { id: 'active', label: 'Active' },
            { id: 'resolved', label: 'Resolved' },
            { id: 'rejected', label: 'Rejected' },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                filter === f.id
                  ? 'bg-accent text-background-foreground'
                  : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No disputes in this view.
        </p>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-xl border border-border bg-card p-4 space-y-2"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-sm">
                    {order.deals?.title || 'Deal'} · {order.deals?.business_name || 'Business'}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.dispute_raised_at
                      ? new Date(order.dispute_raised_at).toLocaleString()
                      : ''}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {order.quantity} × {formatMoney(order.unit_price)} = {formatMoney(order.total_price)}
                  </p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100/20 text-amber-400 font-medium">
                  {DISPUTE_STATUS_LABELS[order.dispute_status] || order.dispute_status}
                </span>
              </div>

              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground">Reason</p>
                <p className="text-sm">
                  {DISPUTE_REASON_LABELS[order.dispute_reason] || order.dispute_reason || '—'}
                </p>
                {order.dispute_resolution_note && (
                  <p className="text-xs text-muted-foreground mt-1">
                    &ldquo;{order.dispute_resolution_note}&rdquo;
                  </p>
                )}
              </div>

              {(order.dispute_status === 'open' || order.dispute_status === 'under_review') && (
                <button
                  type="button"
                  onClick={() => setTarget(order)}
                  className="w-full border border-border text-muted-foreground hover:text-foreground rounded-lg py-2 text-xs transition"
                >
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4">
            <div>
              <h3 className="font-display text-lg font-semibold">Resolve dispute</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {target.deals?.title || 'Order'} · {target.deals?.business_name || ''}
              </p>
            </div>

            <div>
              <label className="field-label">Resolution note (optional)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="field-input min-h-[90px] resize-y"
                placeholder="Explain the outcome to both parties…"
                maxLength={500}
              />
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setTarget(null); setNote(''); }}
                disabled={submitting}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResolve('under_review')}
                disabled={submitting}
                className="text-sm border border-border text-foreground rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                Mark under review
              </button>
              <button
                type="button"
                onClick={() => handleResolve('rejected')}
                disabled={submitting}
                className="text-sm border border-red-400/40 text-red-400 hover:bg-red-400/10 rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={() => handleResolve('resolved')}
                disabled={submitting}
                className="bg-primary text-primary-foreground font-semibold rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                {submitting ? 'Saving…' : 'Resolve'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
