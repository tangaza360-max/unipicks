import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StatusBadge from '../components/StatusBadge.jsx'
import { liveChannel } from '../lib/realtime.js'
import { formatMoney } from '../lib/format.js'
import Button from '../components/Button.jsx'

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

const declineReasons = [
  {
    value: 'unavailable',
    label: 'Unavailable',
    description: 'The item is currently unavailable.',
  },
  {
    value: 'too_busy',
    label: 'Too busy',
    description: 'The business is too busy to fulfill the order.',
  },
  {
    value: 'closed',
    label: 'Closed',
    description: 'The business is currently closed.',
  },
  {
    value: 'price_changed',
    label: 'Price changed',
    description: 'The price of the deal has changed.',
  },
  {
    value: 'other',
    label: 'Other',
    description: 'Give the student a short explanation.',
  },
]

export default function MerchantOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [loadError, setLoadError] = useState('')
  const [readyBusy, setReadyBusy] = useState(null) // order id being marked ready

  const [declineOrder, setDeclineOrder] = useState(null)
  const [declineReason, setDeclineReason] = useState('')
  const [declineReasonNote, setDeclineReasonNote] = useState('')
  const [declining, setDeclining] = useState(false)

  useEffect(() => {
    let cancelled = false
    let channel

    async function loadOrders() {
      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData.user) {
        setLoadError('Please sign in again.')
        setLoading(false)
        return
      }

      const { data, error: ordersError } = await supabase
        .from('orders')
        .select(`
          id,
          deal_id,
          student_id,
          student_phone,
          quantity,
          unit_price,
          total_price,
          status,
          confirmation_deadline,
          created_at,
          ready_at,
          dispute_status,
          dispute_reason,
          dispute_resolution_note,
          deals (
            title,
            business_name
          )
        `)
        .eq('merchant_id', userData.user.id)
        .order('created_at', { ascending: false })

      if (ordersError) {
        setLoadError(ordersError.message)
        setLoading(false)
        return
      }

      if (!cancelled) {
        setOrders(data ?? [])
        setLoading(false)
      }
    }

    async function setup() {
      await loadOrders()

      const { data: userData } = await supabase.auth.getUser()

      if (!userData.user) return

      channel = liveChannel('merchant-orders')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `merchant_id=eq.${userData.user.id}`,
          },
          () => {
            loadOrders()
          }
        )
        .subscribe()
    }

    setup()

    return () => {
      cancelled = true

      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [])

  async function updateOrderStatus(
    orderId,
    action,
    reason = null,
    reasonNote = null
  ) {
    setError('')

    const { data, error } =
      await supabase.functions.invoke('update-order-status', {
        body: {
          order_id: orderId,
          action,
          decline_reason: reason,
          decline_reason_note: reasonNote,
        },
      })

    if (error) {
      console.error('Update order error:', error)

      if (error.context) {
        try {
          const body = await error.context.json()

          console.error('Update order response:', body)

          setError(body?.error || error.message)
        } catch {
          setError(error.message)
        }
      } else {
        setError(error.message)
      }

      return false
    }

    if (data?.error) {
      setError(data.error)
      return false
    }

    // The reply has no deal name: keep what the card already shows.
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? { ...order, ...data.order } : order
      )
    )

    return true
  }

  async function markReady(orderId) {
    if (readyBusy) return
    setReadyBusy(orderId)
    await updateOrderStatus(orderId, 'ready')
    setReadyBusy(null)
  }

  function openDeclineDialog(order) {
    setError('')
    setDeclineOrder(order)
    setDeclineReason('')
    setDeclineReasonNote('')
  }

  function closeDeclineDialog() {
    if (declining) return

    setDeclineOrder(null)
    setDeclineReason('')
    setDeclineReasonNote('')
    setError('')
  }

  async function confirmDecline() {
    if (!declineOrder || !declineReason || declining) {
      return
    }

    const cleanedNote = declineReasonNote.trim()

    if (declineReason === 'other' && !cleanedNote) {
      setError('Please provide a short explanation.')
      return
    }

    if (declineReason === 'other' && cleanedNote.length > 300) {
      setError('The explanation must be 300 characters or less.')
      return
    }

    setDeclining(true)
    setError('')

    const success = await updateOrderStatus(
      declineOrder.id,
      'decline',
      declineReason,
      declineReason === 'other' ? cleanedNote : null
    )

    setDeclining(false)

    if (success) {
      setDeclineOrder(null)
      setDeclineReason('')
      setDeclineReasonNote('')
    }
  }

  if (loading) {
    return (
      <div className="p-4 text-muted-foreground">
        Loading orders...
      </div>
    )
  }

  // Only a failed load replaces the page; a failed button shows above the list.
  if (loadError) {
    return (
      <div className="p-4 text-red-400">
        {loadError}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-foreground">
          Orders
        </h2>

        <p className="text-sm text-muted-foreground">
          Orders from students for your deals.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-red-400/30 p-3 text-sm status-bad">
          {error}
        </div>
      )}

      {orders.length === 0 ? (
        <div className="rounded-xl border border-border p-6 text-center text-muted-foreground">
          No orders yet.
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <div
              key={order.id}
              className="rounded-2xl border border-border bg-card p-4 space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-medium text-foreground">
                    {order.deals?.title ?? 'Deal'}
                  </h3>

                  <p className="text-sm text-muted-foreground">
                    Quantity: {order.quantity}
                  </p>
                </div>

                <StatusBadge status={order.status} audience="business" ready={Boolean(order.ready_at)} />
              </div>

              <div className="text-sm text-muted-foreground">
                Total:{' '}
                {formatMoney(order.total_price)}
              </div>

              {order.dispute_status && (
                <div className="rounded-lg border border-amber-400/30 bg-amber-100/10 px-3 py-2">
                  <p className="text-xs font-medium text-amber-400">
                    Dispute: {DISPUTE_STATUS_LABELS[order.dispute_status] || order.dispute_status}
                  </p>
                  {order.dispute_reason && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reason: {DISPUTE_REASON_LABELS[order.dispute_reason] || order.dispute_reason}
                    </p>
                  )}
                  {order.dispute_resolution_note && (
                    <p className="text-xs text-muted-foreground mt-1">
                      &ldquo;{order.dispute_resolution_note}&rdquo;
                    </p>
                  )}
                </div>
              )}

              {order.status === 'paid' && !order.ready_at && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Paid. When the food is ready, tap Food ready so the student comes to pick it up.
                  </p>
                  <Button className="w-full" onClick={() => markReady(order.id)} disabled={readyBusy === order.id}>
                    {readyBusy === order.id ? 'Sending…' : 'Food ready'}
                  </Button>
                </div>
              )}

              {order.status === 'paid' && order.ready_at && (
                <p className="text-sm text-muted-foreground">
                  Ready since {new Date(order.ready_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}. The student was told to come. Ask for their pickup code.
                </p>
              )}

              {order.status === 'pending_confirmation' && (
                <div className="space-y-3">
                  <p className="text-sm text-amber-600">
                    Waiting for your confirmation.
                  </p>

                  {order.student_phone && (
                    <Button variant="secondary" href={`tel:${order.student_phone}`} className="w-full">
                      Call student
                    </Button>
                  )}

                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => updateOrderStatus(order.id, 'accept')}>
                      Accept
                    </Button>

                    <Button variant="danger" className="flex-1" onClick={() => openDeclineDialog(order)}>
                      Decline
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {declineOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-xl">
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-foreground">
                Decline order
              </h3>

              <p className="text-sm text-muted-foreground">
                Please tell the student why you cannot fulfill this
                order.
              </p>

              <p className="text-sm font-medium text-foreground">
                {declineOrder.deals?.title ?? 'Deal'}
              </p>
            </div>

            <div className="mt-5 space-y-3">
              {declineReasons.map((reason) => (
                <label
                  key={reason.value}
                  className={`block cursor-pointer rounded-xl border p-3 transition ${
                    declineReason === reason.value
                      ? 'border-foreground bg-muted'
                      : 'border-border hover:bg-muted/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="radio"
                      name="decline-reason"
                      value={reason.value}
                      checked={declineReason === reason.value}
                      onChange={(event) => {
                        setDeclineReason(event.target.value)
                        setError('')
                      }}
                      className="mt-1"
                    />

                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {reason.label}
                      </p>

                      <p className="text-xs text-muted-foreground mt-0.5">
                        {reason.description}
                      </p>
                    </div>
                  </div>
                </label>
              ))}
            </div>

            {declineReason === 'other' && (
              <div className="mt-4 space-y-2">
                <label
                  htmlFor="decline-reason-note"
                  className="text-sm font-medium text-foreground"
                >
                  Explanation
                </label>

                <textarea
                  id="decline-reason-note"
                  value={declineReasonNote}
                  onChange={(event) => {
                    setDeclineReasonNote(event.target.value)
                    setError('')
                  }}
                  maxLength={300}
                  rows={4}
                  placeholder="Explain briefly why you cannot fulfill the order..."
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring"
                />

                <div className="text-right text-xs text-muted-foreground">
                  {declineReasonNote.length}/300
                </div>
              </div>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={closeDeclineDialog}
                disabled={declining}
                className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={confirmDecline}
                disabled={!declineReason || declining}
                className="flex-1 rounded-lg bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
              >
                {declining ? 'Declining...' : 'Confirm decline'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}