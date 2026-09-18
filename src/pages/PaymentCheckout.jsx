import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { initiatePayment } from '../lib/payment.js'

const phonePattern = /^(078|079|072|073)\d{7}$/

export default function PaymentCheckout() {
  const [searchParams] = useSearchParams()
  const orderId = searchParams.get('order_id')

  const [order, setOrder] = useState(null)
  const [phoneNumber, setPhoneNumber] = useState('')
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadOrder() {
      if (!orderId) {
        setError('This payment page is missing the order reference.')
        setLoading(false)
        return
      }

      const { data, error: orderError } = await supabase
        .from('orders')
        .select(
          'id, deal_id, quantity, unit_price, total_price, status, payment_deadline',
        )
        .eq('id', orderId)
        .maybeSingle()

      if (cancelled) return

      if (orderError) {
        console.error('Could not load order:', orderError)
        setError('Could not load your order.')
        setLoading(false)
        return
      }

      if (!data) {
        setError('Order not found.')
        setLoading(false)
        return
      }

      setOrder(data)
      setLoading(false)
    }

    loadOrder()

    return () => {
      cancelled = true
    }
  }, [orderId])

  async function handleSubmit(event) {
    event.preventDefault()

    const normalizedPhone = phoneNumber.replace(/\s+/g, '')

    if (!phonePattern.test(normalizedPhone)) {
      setError('Enter a valid Rwanda phone number.')
      return
    }

    if (!order) {
      setError('Order information is not available.')
      return
    }

    if (order.status !== 'confirmed') {
      setError(`This order cannot be paid because it is ${order.status}.`)
      return
    }

    if (
      !order.payment_deadline ||
      new Date(order.payment_deadline) <= new Date()
    ) {
      setError('The 5-minute payment window has expired.')
      return
    }

    setPaying(true)
    setError('')

    try {
      const result = await initiatePayment({
        orderId: order.id,
        phone: normalizedPhone,
      })

      setPayment(result)

      if (result?.status === 'paid') {
        setOrder((current) =>
          current ? { ...current, status: 'paid' } : current,
        )
      }
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

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md space-y-6">
        <Link
          to="/dashboard"
          className="text-sm text-primary hover:underline"
        >
          ← Back to dashboard
        </Link>

        <div>
          <h1 className="font-display text-2xl font-semibold">
            Pay with Mobile Money
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Complete payment for your confirmed Unipicks order.
          </p>
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

              {order.payment_deadline && (
                <p className="text-muted-foreground text-xs">
                  Payment deadline:{' '}
                  {new Date(order.payment_deadline).toLocaleTimeString()}
                </p>
              )}
            </div>
          )}

          {order?.status === 'paid' || payment?.status === 'paid' ? (
            <div className="rounded-lg bg-primary/10 border border-primary/30 p-4 space-y-2">
              <p className="font-semibold text-primary">
                Payment successful
              </p>
              <p className="text-muted-foreground text-sm">
                Your order has been paid successfully.
              </p>
              <p className="text-muted-foreground text-sm">
                Your pickup code will appear after the redemption step is
                connected.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label
                  htmlFor="phone-number"
                  className="field-label"
                >
                  Rwandan phone number
                </label>

                <input
                  id="phone-number"
                  className="field-input"
                  inputMode="tel"
                  placeholder="0788123456"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value)}
                  disabled={paying}
                />

                <p className="text-muted-foreground text-xs mt-1">
                  Use the phone number that should receive the Mobile Money
                  payment request.
                </p>
              </div>

              {error && (
                <p className="text-destructive text-sm" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={paying || !order || order.status !== 'confirmed'}
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
