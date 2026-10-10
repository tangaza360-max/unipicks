import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Minus, Plus } from 'lucide-react'
import { createOrder } from '../lib/orders.js'
import { priceOrder } from '../lib/orderPricing.js'
import { formatMoney } from '../lib/format.js'

// Order straight from the deal page (3 taps: deal → Place order → Pay).
// Stays at the bottom of the screen while the student reads the deal.
export default function OrderBox({ deal, openNow }) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  // "Order again" opens the deal with the same quantity (?qty=2): a whole
  // number from 1 to 99, and never more than the deal allows (bundles: 1).
  const [quantity, setQuantity] = useState(() => {
    const asked = Number(searchParams.get('qty'))
    const wanted = Number.isInteger(asked) && asked >= 1 && asked <= 99 ? asked : 1
    return Math.min(wanted, priceOrder(deal, 1).maxQuantity ?? 99)
  })
  const [placing, setPlacing] = useState(false)
  const [error, setError] = useState('')

  const pricing = priceOrder(deal, quantity)
  const maxQuantity = pricing.maxQuantity ?? Infinity
  const problem = pricing.error || ''

  async function place() {
    if (placing) return
    setPlacing(true)
    setError('')
    try {
      const order = await createOrder({ dealId: deal.id, quantity })
      navigate(`/payment?order_id=${order.id}`)
    } catch (placeError) {
      setError(placeError.message || 'Could not place your order. Please try again.')
      setPlacing(false)
    }
  }

  const stepper =
    'flex h-11 w-11 items-center justify-center rounded-full border border-border text-foreground disabled:opacity-40'

  return (
    <div className="sticky bottom-0 z-10 -mx-5 space-y-2 border-t border-border bg-card/95 px-5 py-3 backdrop-blur md:-mx-7 md:px-7">
      {problem ? (
        <p className="text-center text-sm text-muted-foreground">{problem}</p>
      ) : (
        <div className="flex items-center gap-3">
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Quantity">
            <button type="button" aria-label="One less" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={placing || quantity <= 1} className={stepper}>
              <Minus size={16} aria-hidden="true" />
            </button>
            <span aria-live="polite" aria-label={`Quantity ${quantity}`} className="w-6 text-center font-display text-lg">{quantity}</span>
            <button type="button" aria-label="One more" onClick={() => setQuantity((q) => Math.min(maxQuantity, q + 1))} disabled={placing || quantity >= maxQuantity} className={stepper}>
              <Plus size={16} aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            onClick={place}
            disabled={placing || !openNow || pricing.total == null}
            className="flex min-h-12 flex-1 items-center justify-between gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="whitespace-nowrap">{placing ? 'Placing…' : openNow ? 'Place order' : 'Not available now'}</span>
            <span aria-live="polite" className="whitespace-nowrap">{pricing.total != null ? formatMoney(pricing.total) : ''}</span>
          </button>
        </div>
      )}
      {pricing.itemsReceived != null && !problem && (
        <p className="text-center text-xs text-muted-foreground">You'll receive {pricing.itemsReceived} items.</p>
      )}
      <p className="text-center text-xs text-muted-foreground">
        The business accepts first, then you pay with Mobile Money.{' '}
        <Link to="/terms" className="underline underline-offset-2">Terms</Link>
      </p>
      {error && <p role="alert" className="status-bad rounded-md px-2 py-1 text-center text-sm">{error}</p>}
    </div>
  )
}
