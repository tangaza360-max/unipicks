import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { createOrder } from '../lib/orders.js'
import { formatMoney } from '../lib/format.js'

const roundMoney = (value) => Math.round(value * 100) / 100

// Mirrors priceOrder() in supabase/functions/create-order/index.ts, which is
// the source of truth for what the student is charged. Keep the two in sync.
function priceOrder(deal, quantity) {
  const offerType = deal.offer_type || 'percentage'
  const price = deal.price == null ? null : Number(deal.price)

  if (deal.expires_at && new Date(deal.expires_at) <= new Date()) {
    return { error: 'This deal has expired.' }
  }

  if (offerType === 'tiered') {
    return { error: 'Tiered deals are not yet supported at checkout.' }
  }

  if (offerType === 'free_shipping') {
    return { error: 'This deal cannot be ordered yet.' }
  }

  if (offerType === 'fixed_price') {
    const bundlePrice = Number(deal.final_price ?? deal.discount_value)
    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
      return { error: 'This deal does not have a valid price.' }
    }
    if (quantity > 1) {
      return { error: 'Bundle deals can only be ordered one at a time.', maxQuantity: 1 }
    }
    return {
      unitPrice: roundMoney(bundlePrice),
      total: roundMoney(bundlePrice),
      unitLabel: 'Bundle price',
      maxQuantity: 1,
    }
  }

  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { error: 'This deal does not have a valid price.' }
  }

  if (offerType === 'percentage' || offerType === 'group_buy') {
    const unitPrice = roundMoney(price * (1 - Number(deal.discount_percent ?? 0) / 100))
    return { unitPrice, total: roundMoney(unitPrice * quantity), unitLabel: 'Price each' }
  }

  if (offerType === 'fixed_amount') {
    const discountValue = Number(deal.discount_value)
    if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue >= price) {
      return { error: 'This deal has an invalid discount.' }
    }
    const unitPrice = roundMoney(price - discountValue)
    return { unitPrice, total: roundMoney(unitPrice * quantity), unitLabel: 'Price each' }
  }

  if (offerType === 'bogo') {
    const buyQuantity = Number(deal.buy_quantity ?? 1)
    const getQuantity = Number(deal.get_quantity ?? 1)
    if (!Number.isInteger(buyQuantity) || buyQuantity < 1) {
      return { error: 'This deal has an invalid offer.' }
    }
    const unitPrice = roundMoney(price * buyQuantity)
    return {
      unitPrice,
      total: roundMoney(unitPrice * quantity),
      unitLabel: `Price per deal (pay ${buyQuantity}, get ${getQuantity} free)`,
      itemsReceived: (buyQuantity + getQuantity) * quantity,
    }
  }

  return { error: 'This deal cannot be ordered yet.' }
}

export default function OrderConfirmation() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [deal, setDeal] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [loading, setLoading] = useState(true)
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function loadDeal() {
      setLoading(true)
      setError('')

      const { data, error: dealError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .eq('active', true)
        .maybeSingle()

      if (cancelled) return

      if (dealError) {
        setError(dealError.message)
        setLoading(false)
        return
      }

      if (!data) {
        setError('This deal is no longer available.')
        setLoading(false)
        return
      }

      setDeal(data)
      setLoading(false)
    }

    loadDeal()

    return () => {
      cancelled = true
    }
  }, [id])

  async function handlePlaceOrder() {
    setPlacing(true)
    setError('')

    try {
      const order = await createOrder({
        dealId: id,
        quantity,
      })

      navigate(`/payment?order_id=${order.id}`, { replace: true })
    } catch (err) {
      console.error('Order error:', err)
      setError(err.message || 'Could not place your order. Please try again.')
      setPlacing(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted-foreground">Loading order details…</p>
      </div>
    )
  }

  if (error && !deal) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={() => navigate(`/deal/${id}`)}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Back to deal
          </button>
        </div>
      </div>
    )
  }

  const pricing = priceOrder(deal, quantity)
  const unitPrice = pricing.unitPrice ?? null
  const total = pricing.total ?? null
  const maxQuantity = pricing.maxQuantity ?? Infinity

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-5 md:py-8 space-y-5">
        <button
          onClick={() => navigate(`/deal/${id}`)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft size={18} />
          Back
        </button>

        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Review your order
          </p>
          <h1 className="mt-1 font-display text-2xl font-semibold">
            Confirm &amp; Order
          </h1>
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="relative h-48 w-full">
            {deal.image_url ? (
              <img
                src={deal.image_url}
                alt={deal.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <Store size={42} className="text-muted-foreground" />
              </div>
            )}
          </div>

          <div className="space-y-5 p-5">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {deal.business_name}
              </p>
              <h2 className="mt-1 font-display text-xl font-semibold">
                {deal.title}
              </h2>
            </div>

            {deal.description && (
              <p className="text-sm leading-6 text-muted-foreground">
                {deal.description}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-border pt-4">
              <span className="text-sm font-medium">Quantity</span>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  disabled={placing}
                  className="w-9 h-9 rounded-lg border border-border text-lg disabled:opacity-50"
                >
                  −
                </button>

                <span className="font-display text-xl w-6 text-center">
                  {quantity}
                </span>

                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))}
                  disabled={placing || quantity >= maxQuantity}
                  className="w-9 h-9 rounded-lg border border-border text-lg disabled:opacity-50"
                >
                  +
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{pricing.unitLabel || 'Price each'}</span>
                <span>{unitPrice != null ? `${formatMoney(unitPrice)}` : '—'}</span>
              </div>

              {pricing.itemsReceived != null && (
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-muted-foreground">You'll receive</span>
                  <span>{pricing.itemsReceived} items</span>
                </div>
              )}

              <div className="mt-2 flex justify-between text-base font-semibold">
                <span>Total</span>
                <span className="text-primary">
                  {total != null ? `${formatMoney(total)}` : '—'}
                </span>
              </div>
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold">Before you place the order</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Review the deal details, quantity, price, and expiry before
                placing your order. The business must accept the order before
                payment can continue.
              </p>
              <button
                type="button"
                onClick={() => navigate('/terms')}
                className="mt-2 text-sm text-primary hover:underline"
              >
                View Unipicks Terms of Service
              </button>
            </div>

            {(pricing.error || error) && (
              <p className="text-sm text-red-400">
                {pricing.error || error}
              </p>
            )}

            <button
              type="button"
              onClick={handlePlaceOrder}
              disabled={placing || Boolean(pricing.error)}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
            >
              {placing ? 'Placing order…' : 'Place Order'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
