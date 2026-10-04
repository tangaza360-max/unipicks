import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { liveChannel } from '../lib/realtime.js'
import MerchantPhone from '../components/MerchantPhone.jsx'
import { initiatePayment } from '../lib/payment.js'

const phonePattern = /^(078|079|072|073)\d{7}$/

const ORDER_COLUMNS =
  'id, deal_id, quantity, unit_price, total_price, status, confirmation_deadline, payment_deadline, merchant_phone, decline_reason, decline_reason_note, deals(title, business_name)'

const DECLINE_REASON_LABELS = {
  unavailable: 'The item is unavailable.',
  too_busy: 'The business is too busy right now.',
  closed: 'The business is closed.',
  price_changed: 'The price has changed.',
  other: 'Another reason.',
}

// Fallback when Realtime is unavailable: re-read the order this often while
// it can still change.
const POLL_MS = 10_000
const FINAL_STATUSES = ['paid', 'redeemed', 'completed', 'declined', 'confirmation_expired', 'payment_expired', 'cancelled', 'refunded']

function useCountdown(deadline) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!deadline) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [deadline])
  if (!deadline) return null
  const ms = new Date(deadline).getTime() - now
  if (ms <= 0) return { expired: true, label: '0:00' }
  const total = Math.ceil(ms / 1000)
  return { expired: false, label: `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}` }
}

function StatusPanel({ tone = 'neutral', title, children }) {
  const tones = {
    neutral: 'bg-muted/40 border-border',
    good: 'bg-primary/10 border-primary/30',
    bad: 'bg-destructive/10 border-destructive/30',
  }
  return (
    <div role="status" aria-live="polite" className={`rounded-lg border p-4 space-y-2 ${tones[tone]}`}>
      <p className={`font-semibold ${tone === 'good' ? 'text-primary' : ''}`}>{title}</p>
      <div className="text-muted-foreground text-sm space-y-2">{children}</div>
    </div>
  )
}

export default function PaymentCheckout() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order_id')

  const [order, setOrder] = useState(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const loadOrder = useCallback(async () => {
    if (!orderId) return null
    const { data, error: orderError } = await supabase
      .from('orders')
      .select(ORDER_COLUMNS)
      .eq('id', orderId)
      .maybeSingle()
    if (orderError) {
      console.error('Could not load order:', orderError)
      return null
    }
    return data
  }, [orderId])

  // Initial load.
  useEffect(() => {
    let cancelled = false
    async function init() {
      if (!orderId) {
        setError('This payment page is missing the order reference.')
        setLoading(false)
        return
      }
      const data = await loadOrder()
      if (cancelled) return
      if (!data) setError('Order not found.')
      setOrder(data)
      setLoading(false)
    }
    init()
    return () => {
      cancelled = true
    }
  }, [orderId, loadOrder])

  // Live updates: the merchant accepting/declining, the cron expiring the
  // order, and the payment result (process-payment, webhook or reconciler)
  // all change orders.status. Realtime first, polling as a fallback.
  const status = order?.status
  useEffect(() => {
    if (!orderId || !status || FINAL_STATUSES.includes(status)) return undefined
    let cancelled = false

    const refresh = async () => {
      const data = await loadOrder()
      if (!cancelled && data) setOrder(data)
    }

    const channel = liveChannel(`checkout-order:${orderId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
        refresh,
      )
      .subscribe()
    const poll = setInterval(refresh, POLL_MS)

    return () => {
      cancelled = true
      clearInterval(poll)
      supabase.removeChannel(channel)
    }
  }, [orderId, status, loadOrder])

  const confirmCountdown = useCountdown(status === 'pending_confirmation' ? order?.confirmation_deadline : null)
  const payCountdown = useCountdown(status === 'confirmed' ? order?.payment_deadline : null)

  async function handleSubmit(event) {
    event.preventDefault()
    setNotice('')

    const normalizedPhone = phoneNumber.replace(/\s+/g, '')
    if (!phonePattern.test(normalizedPhone)) {
      setError('Enter a valid Rwanda phone number.')
      return
    }
    if (!order || order.status !== 'confirmed') {
      setError('This order is not ready for payment.')
      return
    }
    if (!order.payment_deadline || new Date(order.payment_deadline) <= new Date()) {
      setError('The 5-minute payment window has expired.')
      return
    }

    setPaying(true)
    setError('')

    try {
      const result = await initiatePayment({ orderId: order.id, phone: normalizedPhone })

      if (result?.status === 'paid') {
        setOrder((current) => (current ? { ...current, status: 'paid' } : current))
      } else if (result?.status === 'processing') {
        setOrder((current) => (current ? { ...current, status: 'payment_processing' } : current))
      } else if (result?.status === 'failed') {
        setNotice(result.message || 'The payment did not go through. You can try again.')
      }

      // The server is the source of truth (it may have moved on already).
      const fresh = await loadOrder()
      if (fresh) setOrder(fresh)
    } catch (paymentError) {
      console.error('Payment error:', paymentError)
      setError(paymentError.message || 'Unable to start payment.')
    } finally {
      setPaying(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-4 py-10 text-foreground">
        <div className="mx-auto max-w-md">
          <p className="text-muted-foreground">Loading your order...</p>
        </div>
      </main>
    )
  }

  const business = order?.deals?.business_name || 'the business'

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md space-y-6">
        <Link to="/dashboard/deals" className="text-sm text-primary hover:underline">
          ← Back to dashboard
        </Link>

        <div>
          <h1 className="font-display text-2xl font-semibold">Your order</h1>
          {order?.deals?.title && (
            <p className="text-muted-foreground text-sm mt-1">
              {order.deals.title} · {business}
            </p>
          )}
        </div>

        <div className="bg-card border border-border rounded-lg p-6 space-y-5 shadow-sm">
          {order && (
            <div className="space-y-3 border-b border-border pb-4">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Quantity</span>
                <span className="font-medium">{order.quantity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unit price</span>
                <span>{Number(order.unit_price).toLocaleString()} RWF</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="font-display text-xl font-semibold">
                  {Number(order.total_price).toLocaleString()} RWF
                </span>
              </div>
            </div>
          )}

          {!order && error && (
            <p className="text-destructive text-sm" role="alert">{error}</p>
          )}

          {status === 'pending_confirmation' && (
            <StatusPanel title={`Waiting for ${business} to accept`}>
              <p>
                {business} has {confirmCountdown && !confirmCountdown.expired ? confirmCountdown.label : 'a few moments'} to
                accept your order. This page updates by itself, and you'll also get a message.
              </p>
              <p>You won't be charged unless they accept and you pay.</p>
            </StatusPanel>
          )}

          {status === 'confirmation_expired' && (
            <StatusPanel tone="bad" title="The business didn't respond in time">
              <p>Your order was cancelled. Nothing was charged.</p>
              <Link to="/dashboard/deals" className="text-primary hover:underline">Browse other deals</Link>
            </StatusPanel>
          )}

          {status === 'declined' && (
            <StatusPanel tone="bad" title={`${business} declined your order`}>
              <p>{DECLINE_REASON_LABELS[order.decline_reason] || 'No reason was given.'}</p>
              {order.decline_reason_note && <p>“{order.decline_reason_note}”</p>}
              <p>Nothing was charged.</p>
              <Link to="/dashboard/deals" className="text-primary hover:underline">Browse other deals</Link>
            </StatusPanel>
          )}

          {status === 'payment_processing' && (
            <StatusPanel title="Waiting for your Mobile Money payment">
              <p>Check your phone and approve the payment prompt (enter your PIN).</p>
              <p>
                This page updates by itself when the payment is confirmed, and your pickup code
                will be sent to your Messages.
              </p>
            </StatusPanel>
          )}

          {(status === 'paid' || status === 'redeemed' || status === 'completed') && (
            <StatusPanel tone="good" title="Payment successful">
              <p>Your order has been paid.</p>
              <p>Your pickup code has been sent to your Messages.</p>
              {order?.merchant_phone && (
                <p className="text-foreground">
                  <MerchantPhone phone={order.merchant_phone} />
                </p>
              )}
            </StatusPanel>
          )}

          {status === 'payment_expired' && (
            <StatusPanel tone="bad" title="Payment window expired">
              <p>This order wasn't paid within 5 minutes after the business accepted it.</p>
              <Link to={`/deal/${order.deal_id}`} className="text-primary hover:underline">Order again</Link>
            </StatusPanel>
          )}

          {status === 'confirmed' && (
            <form onSubmit={handleSubmit} className="space-y-5">
              <StatusPanel tone="good" title={`${business} accepted your order`}>
                <p>
                  Pay within{' '}
                  <span className="font-semibold text-foreground">
                    {payCountdown && !payCountdown.expired ? payCountdown.label : '0:00'}
                  </span>{' '}
                  to keep it.
                </p>
              </StatusPanel>

              {notice && (
                <p className="text-destructive text-sm" role="alert">{notice}</p>
              )}

              <div>
                <label htmlFor="phone-number" className="field-label">Rwandan phone number</label>
                <input
                  id="phone-number"
                  className="field-input"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="0788123456"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  disabled={paying}
                />
                <p className="text-muted-foreground text-xs mt-1">
                  Use the phone number that should receive the Mobile Money payment request.
                </p>
              </div>

              {error && (
                <p className="text-destructive text-sm" role="alert">{error}</p>
              )}

              <button
                type="submit"
                disabled={paying || payCountdown?.expired}
                className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
              >
                {paying ? 'Starting payment...' : 'Pay Now'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
