import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { realDiscountPercent, studentPrice } from '../lib/dealPricing.js'
import RatingPrompt from './RatingPrompt.jsx'
import StatusBadge from './StatusBadge.jsx'
import RaiseDisputeModal from './RaiseDisputeModal.jsx'
import MerchantPhone from './MerchantPhone.jsx'
import OrderSteps from './OrderSteps.jsx'
import { liveChannel } from '../lib/realtime.js'
import { nowText, reachedStep } from '../lib/orderSteps.js'
import { Package } from 'lucide-react'
import { formatMoney, formatDate, formatTime } from '../lib/format.js'

const DECLINE_REASON_LABELS = {
  unavailable: 'Item unavailable',
  too_busy: 'Business too busy',
  closed: 'Business closed',
  price_changed: 'Price changed',
  other: 'Other',
}

const INACTIVE_ORDER_STATUSES = ['cancelled', 'confirmation_expired', 'payment_expired', 'refunded']
const DISPUTE_STATUS_LABELS = {
  open: 'Under review',
  under_review: 'Under review',
  resolved: 'Resolved',
  rejected: 'Rejected',
}
// Needs the student: pay (confirmed) or go and collect (paid).
const ACTIONABLE_ORDER_STATUSES = ['confirmed', 'paid']

export default function OrdersTab() {
  const [hostedOrders, setHostedOrders] = useState([])
  const [joinedOrders, setJoinedOrders] = useState([])
  const [normalOrders, setNormalOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAllOrders, setShowAllOrders] = useState(true)
  const [redemptions, setRedemptions] = useState([])
  const [disputeTarget, setDisputeTarget] = useState(null)

  useEffect(() => {
    loadOrders()
  }, [showAllOrders])

  // Live: when the business accepts or taps Food ready, the steps move
  // without a reload (orders is in the realtime publication; students only
  // receive their own rows).
  useEffect(() => {
    let channel
    let cancelled = false
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return
      channel = liveChannel('student-orders')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `student_id=eq.${data.user.id}` }, () => loadOrders({ quiet: true }))
        .subscribe()
    })
    return () => {
      cancelled = true
      channel?.unsubscribe()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAllOrders])

  // quiet: refresh in place, without the "Loading orders…" flash.
  async function loadOrders({ quiet = false } = {}) {
    if (!quiet) setLoading(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setLoading(false)
      return
    }

    const userId = userData.user.id

    let query = supabase
      .from('group_orders')
      .select('*, deals(title, business_name, price, discount_percent)')
      .eq('created_by', userId)
      .order('created_at', { ascending: false })

    if (!showAllOrders) {
      query = query.neq('status', 'cancelled')
    }

    const { data: hosted, error: hostedError } = await query

    if (hostedError) {
      setError(hostedError.message)
      setLoading(false)
      return
    }

    const { data: joined, error: joinedError } = await supabase
      .from('group_order_members')
      .select('*, group_orders(*, deals(title, business_name, price, discount_percent))')
      .eq('student_id', userId)
      .order('joined_at', { ascending: false })

    if (joinedError) {
      setError(joinedError.message)
      setLoading(false)
      return
    }

    const { data: redeemed, error: redemptionsError } = await supabase
      .from('redemptions')
      .select('id, deal_id, student_id, status, redeemed_at, deals(title, business_name, merchant_id)')
      .eq('student_id', userId)
      .eq('status', 'redeemed')
      .order('redeemed_at', { ascending: false })

    if (redemptionsError) {
      setError(redemptionsError.message)
      setLoading(false)
      return
    }

    // Collected orders already rated don't ask again.
    const { data: myRatings } = await supabase
      .from('ratings')
      .select('redemption_id')
      .eq('student_id', userId)
    const rated = new Set((myRatings || []).map((r) => r.redemption_id))

    const { data: normal, error: normalError } = await supabase
      .from('orders')
      .select('id, deal_id, merchant_id, quantity, unit_price, total_price, status, ready_at, decline_reason, decline_reason_note, dispute_status, dispute_reason, dispute_raised_at, dispute_resolution_note, created_at, payment_deadline, merchant_phone, deals(title, business_name), redemptions(code)')
      .eq('student_id', userId)
      .order('created_at', { ascending: false })

    if (normalError) {
      setError(normalError.message)
      setLoading(false)
      return
    }

    // Filter based on toggle.
    // ON  = complete record (every order).
    // OFF = actionable orders only (things needing the student's attention).
    let filteredHosted = hosted || []
    // A membership whose group can't be read (deleted, or hidden by access
    // rules) comes back with group_orders = null; skip it instead of crashing.
    let filteredJoined = (joined || []).filter((membership) => membership.group_orders)
    let filteredNormal = normal || []
    // "Rate your food" shows in both views: it is something to do.
    const filteredRedemptions = (redeemed || []).filter((r) => !rated.has(r.id))

    if (!showAllOrders) {
      filteredNormal = filteredNormal.filter((order) => {
        if (!ACTIONABLE_ORDER_STATUSES.includes(order.status)) return false
        if (order.status === 'paid') return true
        if (order.status === 'confirmed') {
          return (
            order.payment_deadline &&
            new Date(order.payment_deadline) > new Date()
          )
        }
        return true
      })
      filteredHosted = filteredHosted.filter((order) => order.status === 'open')
      filteredJoined = filteredJoined.filter(
        (membership) => membership.group_orders?.status === 'open'
      )
    }

    setHostedOrders(filteredHosted)
    setJoinedOrders(filteredJoined)
    setNormalOrders(filteredNormal)
    setRedemptions(filteredRedemptions)
    setLoading(false)
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading orders…</p>
  }

  if (error) {
    return <p className="text-sm text-red-400">Could not load orders: {error}</p>
  }

  const totalOrders = hostedOrders.length + joinedOrders.length + redemptions.length + normalOrders.length

  if (totalOrders === 0) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <div className="flex items-center justify-between gap-3">
          <span id="orders-show-all-label" className="text-sm text-muted-foreground">Show all orders</span>
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              aria-labelledby="orders-show-all-label"
              checked={showAllOrders}
              onChange={(e) => setShowAllOrders(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-accent transition-colors">
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full transition-transform ${
                showAllOrders ? 'translate-x-4' : ''
              }`}></div>
            </div>
          </label>
        </div>

        <div className="text-center py-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Package size={28} className="text-muted-foreground" /></div>
          <h3 className="font-display text-lg font-semibold">
            {showAllOrders ? 'No orders yet' : 'Nothing needs your attention'}
          </h3>
          <p className="text-muted-foreground text-sm">
            {showAllOrders
              ? "You haven't placed any orders yet. Start one from the Home tab!"
              : 'Toggle "Show all orders" to see your complete history.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between gap-3">
        <span id="orders-show-all-label" className="text-sm text-muted-foreground">Show all orders</span>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            aria-labelledby="orders-show-all-label"
            checked={showAllOrders}
            onChange={(e) => setShowAllOrders(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-accent transition-colors">
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full transition-transform ${
              showAllOrders ? 'translate-x-4' : ''
            }`}></div>
          </div>
        </label>
      </div>

      {normalOrders.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Your orders ({normalOrders.length})
          </h3>
          <div className="space-y-3">
            {normalOrders.map((order, index) => (
              <div
                key={order.id}
                className="animate-slideUp"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <NormalOrderCard order={order} onRaiseDispute={setDisputeTarget} />
              </div>
            ))}
          </div>
        </div>
      )}

      {hostedOrders.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Orders you hosted ({hostedOrders.length})
          </h3>
          <div className="space-y-3">
            {hostedOrders.map((order, index) => (
              <div
                key={order.id}
                className="animate-slideUp"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <OrderCard order={order} type="hosted" />
              </div>
            ))}
          </div>
        </div>
      )}

      {joinedOrders.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Orders you joined ({joinedOrders.length})
          </h3>
          <div className="space-y-3">
            {joinedOrders.map((membership, index) => (
              <div
                key={membership.id}
                className="animate-slideUp"
                style={{ animationDelay: `${index * 60}ms` }}
              >
                <OrderCard order={membership.group_orders} type="joined" quantity={membership.quantity} />
              </div>
            ))}
          </div>
        </div>
      )}

      {redemptions.length > 0 && (
        <div>
          <h3 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
            Rate your food
          </h3>
          <div className="space-y-3">
            {redemptions.map((redemption) => (
              <div key={redemption.id} className="border border-border rounded-2xl p-4 bg-card shadow-sm transition hover:shadow-md">
                <p className="font-medium text-sm">{redemption.deals?.title || 'Ordered deal'}</p>
                <p className="text-muted-foreground text-xs">{redemption.deals?.business_name}</p>
                <RatingPrompt redemption={redemption} onSaved={loadOrders} />
              </div>
            ))}
          </div>
        </div>
      )}

      {disputeTarget && (
        <RaiseDisputeModal
          order={disputeTarget}
          onClose={() => setDisputeTarget(null)}
          onSuccess={() => {
            setDisputeTarget(null)
            loadOrders()
          }}
        />
      )}
    </div>
  )
}

function OrderCard({ order, type, quantity }) {
  const navigate = useNavigate()
  const deal = order.deals
  const date = formatDate(order.created_at)
  const time = formatTime(order.created_at)

  const finalPrice = deal ? studentPrice(deal) : null
  const discountPercent = deal ? realDiscountPercent(deal) : null
  const payableAmount = type === 'joined'
    ? (finalPrice != null && quantity ? finalPrice * quantity : null)
    : null

  return (
    <div className="border border-border rounded-2xl p-5 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm">
            {deal?.title || 'Unknown deal'} · {deal?.business_name || 'Unknown business'}
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {date} at {time}
          </p>
          {finalPrice != null && (
            <p className="text-muted-foreground text-xs mt-1">
              {type === 'hosted' ? 'Total: ' : 'Your total: '}
              {formatMoney(finalPrice)}
              {discountPercent && ` (${discountPercent}% off)`}
            </p>
          )}
          {type === 'joined' && quantity != null && quantity > 0 && (
            <p className="text-muted-foreground text-xs">Quantity: {quantity}</p>
          )}
          {type === 'hosted' && (
            <p className="text-muted-foreground text-xs">
              Code: <span className="font-mono">{order.join_code}</span>
            </p>
          )}
        </div>
        <StatusBadge status={order.status} />
      </div>

      {payableAmount != null && (
        <button
          type="button"
          onClick={() => navigate(`/payment?amount=${payableAmount}&order_id=${order.id}&deal_id=${order.deal_id}&description=${encodeURIComponent(deal?.title || 'Group order')}`)}
          className="mt-3 w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition"
        >
          Pay Now · {formatMoney(payableAmount)}
        </button>
      )}

      {type === 'hosted' && order.members && order.members.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-muted-foreground text-xs mb-1">Members ({order.members.length})</p>
          <div className="flex flex-wrap gap-1">
            {order.members.map((m) => (
              <span key={m.id} className="text-xs bg-card-alt px-2 py-0.5 rounded-2xl text-muted-foreground">
                {m.student_name} × {m.quantity}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NormalOrderCard({ order, onRaiseDispute }) {
  const navigate = useNavigate()
  const deal = order.deals
  const redemption = Array.isArray(order.redemptions) ? order.redemptions[0] : order.redemptions
  const date = formatDate(order.created_at)
  const time = formatTime(order.created_at)

  const status = order.status
  const isPaymentWindowOpen = order.payment_deadline
    ? new Date(order.payment_deadline) > new Date()
    : false
  const canPay = status === 'confirmed' && isPaymentWindowOpen
  const showPaymentExpired = status === 'confirmed' && !isPaymentWindowOpen
  const showPickupCode = (status === 'paid' || status === 'redeemed' || status === 'completed') && redemption?.code
  const showDecline = status === 'declined'
  const reached = reachedStep(order)
  const isReady = reached === 3
  const showExpired = INACTIVE_ORDER_STATUSES.includes(status)
  const canRaiseDispute =
    !order.dispute_status &&
    ['confirmed', 'paid', 'redeemed', 'completed', 'declined'].includes(status)
  const showDisputeStatus = Boolean(order.dispute_status)

  return (
    <div className="border border-border rounded-2xl p-5 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm">
            {deal?.title || 'Unknown deal'} · {deal?.business_name || 'Unknown business'}
          </p>
          <p className="text-muted-foreground text-xs mt-0.5">
            {date} at {time}
          </p>
          <p className="text-muted-foreground text-xs mt-1">
            {order.quantity} × {formatMoney(order.unit_price)} = {formatMoney(order.total_price)}
          </p>
        </div>
        <StatusBadge status={status} ready={Boolean(order.ready_at)} />
      </div>

      {reached !== null && (
        <OrderSteps reached={reached} text={nowText(order, deal?.business_name || 'the business')} highlight={isReady} />
      )}

      {showPaymentExpired && (
        <p className="mt-3 text-xs text-red-400 bg-red-100/10 rounded-lg px-3 py-2">
          Payment window expired. This order was not paid in time.
        </p>
      )}

      {canPay && (
        <button
          type="button"
          onClick={() => navigate(`/payment?order_id=${order.id}`)}
          className="mt-3 w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition"
        >
          Pay Now · {formatMoney(order.total_price)}
        </button>
      )}

      {showPickupCode && (
        <div className="mt-3 rounded-lg border border-green-400/30 bg-green-100/10 px-3 py-2">
          <p className="text-xs text-muted-foreground">Pickup code</p>
          <p className={`font-mono font-semibold tracking-wider ${isReady ? 'text-2xl' : 'text-base'}`}>{redemption.code}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {isReady ? 'Show this code at the counter.' : 'You will show this code when your food is ready.'}
          </p>
          {order.merchant_phone && (
            <p className="text-xs mt-2">
              <MerchantPhone phone={order.merchant_phone} />
            </p>
          )}
        </div>
      )}

      {['paid', 'redeemed', 'completed'].includes(status) && (
        <Link
          to={`/receipt/${order.id}`}
          className="mt-3 inline-block text-xs font-medium text-accent underline underline-offset-2 hover:decoration-2"
        >
          View receipt
        </Link>
      )}

      {showDecline && (
        <div className="mt-3 rounded-lg border border-red-400/30 bg-red-100/10 px-3 py-2">
          <p className="text-xs font-medium text-red-400">
            Declined: {DECLINE_REASON_LABELS[order.decline_reason] || order.decline_reason || 'No reason provided'}
          </p>
          {order.decline_reason_note && (
            <p className="text-xs text-muted-foreground mt-1">"{order.decline_reason_note}"</p>
          )}
        </div>
      )}

      {showExpired && (
        <p className="mt-3 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
          This order is no longer active.
        </p>
      )}

      {showDisputeStatus && (
        <div className="mt-3 rounded-lg border border-amber-400/30 bg-amber-100/10 px-3 py-2">
          <p className="text-xs font-medium text-amber-400">
            Dispute: {DISPUTE_STATUS_LABELS[order.dispute_status] || order.dispute_status}
          </p>
          {order.dispute_resolution_note && (
            <p className="text-xs text-muted-foreground mt-1">
              &ldquo;{order.dispute_resolution_note}&rdquo;
            </p>
          )}
        </div>
      )}

      {canRaiseDispute && (
        <button
          type="button"
          onClick={() => onRaiseDispute(order)}
          className="mt-3 w-full border border-border text-muted-foreground hover:text-foreground rounded-lg py-2 text-xs transition"
        >
          Raise a dispute
        </button>
      )}
    </div>
  )
}
