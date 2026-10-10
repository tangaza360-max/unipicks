import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import Logo from '../components/Logo.jsx'
import { formatMoney, formatDateTime } from '../lib/format.js'
import BackLink from '../components/BackLink.jsx'

// Payment confirmation for a paid order. Unipicks is a marketplace agent:
// the food place is the seller, and Unipicks collects the payment on its
// behalf (founder decision 2026-10-04). The page shows the seller's
// identity (Rwanda Law N° 011/2026: e-commerce intermediaries identify the
// seller) and says it is not a tax (EBM) invoice. The pickup code is left
// out on purpose: receipts get shared, and the code collects the food.
// Row-level security already limits orders and payments to their owner.

// Unipicks' own registration, shown once the company is registered with RDB.
const UNIPICKS_REGISTRATION = import.meta.env.VITE_UNIPICKS_REGISTRATION || ''

const RECEIPT_STATUSES = { paid: 'Paid', redeemed: 'Collected', completed: 'Collected' }
const PAYMENT_METHODS = { momo: 'Mobile Money', mtn_momo: 'MTN MoMo', airtel: 'Airtel Money', airtel_money: 'Airtel Money' }

function money(value, currency = 'RWF') {
  return formatMoney(value || 0, currency)
}

function dateTime(iso) {
  return formatDateTime(iso)
}

function Row({ label, children }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium break-all">{children}</span>
    </div>
  )
}

export default function Receipt() {
  const { orderId } = useParams()
  const [state, setState] = useState({ loading: true, error: '', order: null, payment: null, seller: null })

  useEffect(() => {
    let active = true

    async function load() {
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .select('id, merchant_id, group_order_id, quantity, unit_price, total_price, status, created_at, deals(title, business_name)')
        .eq('id', orderId)
        .maybeSingle()

      if (!active) return
      if (orderError || !order) {
        setState({ loading: false, error: 'We could not find this order.', order: null, payment: null, seller: null })
        return
      }
      if (!RECEIPT_STATUSES[order.status]) {
        setState({ loading: false, error: 'There is no receipt for this order yet. A receipt is available after payment.', order, payment: null, seller: null })
        return
      }

      const paymentFilter = order.group_order_id
        ? `normal_order_id.eq.${order.id},group_order_id.eq.${order.group_order_id}`
        : `normal_order_id.eq.${order.id}`

      const [{ data: payments }, { data: seller }] = await Promise.all([
        supabase
          .from('transactions')
          .select('amount, currency, payment_method, status, umunota_reference, created_at, updated_at')
          .or(paymentFilter)
          .eq('status', 'paid')
          .order('updated_at', { ascending: false })
          .limit(1),
        supabase
          .from('merchant_profiles')
          .select('business_name, rdb_number, address')
          .eq('id', order.merchant_id)
          .maybeSingle(),
      ])

      if (!active) return
      setState({ loading: false, error: '', order, payment: payments?.[0] ?? null, seller: seller ?? null })
    }

    load().catch(() => {
      if (active) setState({ loading: false, error: 'We could not load this receipt. Please try again.', order: null, payment: null, seller: null })
    })
    return () => {
      active = false
    }
  }, [orderId])

  const { loading, error, order, payment, seller } = state

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted-foreground">Loading receipt…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div role="alert" className="max-w-sm text-center space-y-4">
          <h1 className="font-display text-2xl font-semibold">No receipt</h1>
          <p className="text-muted-foreground text-sm">{error}</p>
          <Link to="/dashboard/profile?view=orders" className="inline-block text-sm text-accent underline underline-offset-2 hover:decoration-2">Back to my orders</Link>
        </div>
      </div>
    )
  }

  const businessName = seller?.business_name || order.deals?.business_name || 'the business'
  const currency = payment?.currency || 'RWF'

  return (
    <div className="min-h-screen px-4 py-8 print:py-0">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center justify-between print:hidden">
          <BackLink to="/dashboard/profile?view=orders" />
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-11 text-sm bg-primary text-primary-foreground font-semibold rounded-lg px-4 py-2"
          >
            Print / Save as PDF
          </button>
        </div>

        <article className="bg-card border border-border rounded-2xl p-6 space-y-5 print:border-0 print:p-0">
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2">
              <Logo size={28} className="text-accent" />
              <span className="font-display text-lg font-semibold">Unipicks</span>
            </div>
            <div className="text-right">
              <h1 className="font-display text-lg font-semibold">Receipt</h1>
              <p className="text-xs text-muted-foreground">No. {order.id.slice(0, 8).toUpperCase()}</p>
            </div>
          </header>

          <section aria-label="Seller">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Seller</p>
            <p className="font-semibold">{businessName}</p>
            {seller?.rdb_number && <p className="text-sm text-muted-foreground">RDB No. {seller.rdb_number}</p>}
            {seller?.address && <p className="text-sm text-muted-foreground">{seller.address}</p>}
          </section>

          <section className="border-t border-border pt-3" aria-label="Order">
            <Row label="Item">{order.deals?.title || 'Deal'}</Row>
            <Row label="Quantity">{order.quantity} × {money(order.unit_price, currency)}</Row>
            <Row label="Total paid"><span className="text-base">{money(payment?.amount ?? order.total_price, currency)}</span></Row>
          </section>

          <section className="border-t border-border pt-3" aria-label="Payment">
            <Row label="Status">{RECEIPT_STATUSES[order.status]}</Row>
            <Row label="Paid on">{dateTime(payment?.updated_at || payment?.created_at)} (Kigali)</Row>
            <Row label="Method">{PAYMENT_METHODS[payment?.payment_method] || 'Mobile Money'}</Row>
            <Row label="Payment reference">{payment?.umunota_reference || '—'}</Row>
            <Row label="Order date">{dateTime(order.created_at)}</Row>
          </section>

          {!payment && (
            <p role="status" className="text-xs text-muted-foreground">
              The payment record is not available yet. Your order is paid; the reference will appear here soon.
            </p>
          )}

          <footer className="border-t border-border pt-3 space-y-1 text-xs text-muted-foreground">
            <p>
              Unipicks is a marketplace agent. The payment was collected on behalf of {businessName}.
            </p>
            {UNIPICKS_REGISTRATION && <p>{UNIPICKS_REGISTRATION}</p>}
            <p>
              This is a payment confirmation from Unipicks, not a tax (EBM) invoice. For an EBM invoice, ask {businessName}.
            </p>
          </footer>
        </article>
      </div>
    </div>
  )
}
