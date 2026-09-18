import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

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
        setError('Please sign in again.')
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
          deals (
            title,
            business_name
          )
        `)
        .eq('merchant_id', userData.user.id)
        .order('created_at', { ascending: false })

      if (ordersError) {
        setError(ordersError.message)
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

      channel = supabase
        .channel('merchant-orders')
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

    setOrders((current) =>
      current.map((order) =>
        order.id === orderId ? data.order : order
      )
    )

    return true
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

  if (error && !declineOrder) {
    return (
      <div className="p-4 text-red-500">
        {error}
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

      {error && declineOrder && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
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
              className="rounded-xl border border-border bg-card p-4 space-y-3"
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

                <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium">
                  {order.status}
                </span>
              </div>

              <div className="text-sm text-muted-foreground">
                Total:{' '}
                {Number(order.total_price).toLocaleString()} RWF
              </div>

              {order.status === 'pending_confirmation' && (
                <div className="space-y-3">
                  <p className="text-sm text-amber-600">
                    Waiting for your confirmation.
                  </p>

                  {order.student_phone && (
                    <a
                      href={`tel:${order.student_phone}`}
                      className="block w-full rounded-lg border border-border px-4 py-2 text-center text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Call Student
                    </a>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        updateOrderStatus(order.id, 'accept')
                      }
                      className="flex-1 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
                    >
                      Accept
                    </button>

                    <button
                      type="button"
                      onClick={() => openDeclineDialog(order)}
                      className="flex-1 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Decline
                    </button>
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