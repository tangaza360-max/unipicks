import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Timer } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { liveChannel } from '../lib/realtime.js'
import { orderNudges } from '../lib/orderNudges.js'
import { useCountdown } from '../lib/useCountdown.js'

const SHOWN = 2 // more than this: "and N more in My orders"
const ORDERS_PAGE = '/dashboard/profile?view=orders'

// Top of Home: "Mr. Chips accepted your order — pay within 4:12 [Pay now]" and
// "Your food is ready [See code]", for every student (Social not needed).
// Live: the business accepting or marking food ready shows it at once; an
// expired payment window hides it.
export default function OrderNudges() {
  const [orders, setOrders] = useState([])
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let active = true
    let channel = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      async function load() {
        const { data, error } = await supabase
          .from('orders')
          .select('id, status, payment_deadline, ready_at, deals(title, business_name)')
          .eq('student_id', user.id)
          .in('status', ['confirmed', 'paid'])
        if (!active) return
        if (error) {
          console.error('[order-nudges] fetch failed:', error)
          return
        }
        setOrders(data || [])
        setNow(Date.now())
      }

      await load()
      channel = liveChannel(`order-nudges:${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `student_id=eq.${user.id}` }, load)
        .subscribe()
    }

    init()
    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Re-check every few seconds while a payment window is open, so it goes
  // away when it expires (an expiry changes no row, so no live update comes).
  const hasPay = orders.some((o) => o.status === 'confirmed')
  useEffect(() => {
    if (!hasPay) return undefined
    const timer = setInterval(() => setNow(Date.now()), 5000)
    return () => clearInterval(timer)
  }, [hasPay])

  const nudges = orderNudges(orders, now)
  if (nudges.length === 0) return null

  // Said once by screen readers when the list changes (not every second).
  const spoken = nudges.map(({ kind, order }) => (kind === 'pay'
    ? `${order.deals?.business_name || 'The business'} accepted your order. Pay within 5 minutes.`
    : `Your ${order.deals?.title || 'food'} is ready.`)).join(' ')

  return (
    <section aria-label="Your orders need you" className="space-y-2">
      <p role="status" className="sr-only">{spoken}</p>
      {nudges.slice(0, SHOWN).map((nudge) => (
        nudge.kind === 'pay'
          ? <PayNudge key={nudge.order.id} order={nudge.order} />
          : <ReadyNudge key={nudge.order.id} order={nudge.order} />
      ))}
      {nudges.length > SHOWN && (
        <Link to={ORDERS_PAGE} className="inline-flex min-h-11 items-center text-sm font-medium text-accent underline underline-offset-2">
          and {nudges.length - SHOWN} more in My orders
        </Link>
      )}
    </section>
  )
}

function PayNudge({ order }) {
  const countdown = useCountdown(order.payment_deadline)
  return (
    <div className="status-wait flex items-center gap-3 rounded-2xl px-4 py-3">
      <Timer size={20} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">{order.deals?.business_name || 'The business'} accepted your order</p>
        <p className="text-sm">
          {order.deals?.title ? `${order.deals.title} · ` : ''}Pay within <span className="font-semibold tabular-nums">{countdown?.label}</span>
        </p>
      </div>
      <Link
        to={`/payment?order_id=${order.id}`}
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Pay now
      </Link>
    </div>
  )
}

function ReadyNudge({ order }) {
  return (
    <div className="status-good flex items-center gap-3 rounded-2xl px-4 py-3">
      <CheckCircle2 size={20} aria-hidden="true" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Your food is ready{order.deals?.business_name ? ` at ${order.deals.business_name}` : ''}</p>
        <p className="text-sm">{order.deals?.title ? `${order.deals.title} · ` : ''}Show your pickup code at the counter.</p>
      </div>
      <Link
        to={ORDERS_PAGE}
        className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        See code
      </Link>
    </div>
  )
}
