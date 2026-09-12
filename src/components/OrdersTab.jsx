import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import RatingPrompt from './RatingPrompt.jsx'
import StatusBadge from './StatusBadge.jsx'
import { Package } from 'lucide-react'

export default function OrdersTab() {
  const [hostedOrders, setHostedOrders] = useState([])
  const [joinedOrders, setJoinedOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCancelled, setShowCancelled] = useState(false)
  const [redemptions, setRedemptions] = useState([])

  useEffect(() => {
    loadOrders()
  }, [showCancelled])

  async function loadOrders() {
    setLoading(true)
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

    if (!showCancelled) {
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

    let filteredJoined = joined || []
    if (!showCancelled) {
      filteredJoined = filteredJoined.filter(
        (membership) => membership.group_orders?.status !== 'cancelled'
      )
    }

    setHostedOrders(hosted || [])
    setJoinedOrders(filteredJoined)
    setRedemptions(redeemed || [])
    setLoading(false)
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading orders…</p>
  }

  if (error) {
    return <p className="text-sm text-red-400">Could not load orders: {error}</p>
  }

  const totalOrders = hostedOrders.length + joinedOrders.length + redemptions.length

  if (totalOrders === 0) {
    return (
      <div className="space-y-4 animate-fadeIn">
        <div className="flex items-center gap-2">
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={showCancelled}
              onChange={(e) => setShowCancelled(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-accent transition-colors">
              <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full transition-transform ${
                showCancelled ? 'translate-x-4' : ''
              }`}></div>
            </div>
          </label>
          <span className="text-sm text-muted-foreground">Show cancelled orders</span>
        </div>

        <div className="text-center py-12">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted"><Package size={28} className="text-muted-foreground" /></div>
          <h3 className="font-display text-lg font-semibold">No orders yet</h3>
          <p className="text-muted-foreground text-sm">
            You haven't hosted or joined any group orders yet. Start one from the Home tab!
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center gap-2">
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={showCancelled}
            onChange={(e) => setShowCancelled(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:bg-accent transition-colors">
            <div className={`absolute top-0.5 left-0.5 w-4 h-4 bg-card rounded-full transition-transform ${
              showCancelled ? 'translate-x-4' : ''
            }`}></div>
          </div>
        </label>
        <span className="text-sm text-muted-foreground">Show cancelled orders</span>
      </div>

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
            Ordered deals
          </h3>
          <div className="space-y-3">
            {redemptions.map((redemption) => (
              <div key={redemption.id} className="border border-border rounded-lg p-4 bg-card shadow-sm transition hover:shadow-md">
                <p className="font-medium text-sm">{redemption.deals?.title || 'Ordered deal'}</p>
                <p className="text-muted-foreground text-xs">{redemption.deals?.business_name}</p>
                <RatingPrompt redemption={redemption} onSaved={loadOrders} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function OrderCard({ order, type, quantity }) {
  const navigate = useNavigate()
  const deal = order.deals
  const date = new Date(order.created_at).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  const time = new Date(order.created_at).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })

  const finalPrice = deal?.price != null
    ? (deal.discount_percent != null
        ? Math.round(deal.price * (1 - deal.discount_percent / 100))
        : deal.price)
    : null
  const payableAmount = type === 'joined'
    ? (finalPrice != null && quantity ? finalPrice * quantity : null)
    : null

  return (
    <div className="border border-border rounded-lg p-5 bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
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
              {finalPrice} RWF
              {deal?.discount_percent != null && ` (${deal.discount_percent}% off)`}
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
          Pay Now · {payableAmount.toLocaleString()} RWF
        </button>
      )}

      {type === 'hosted' && order.members && order.members.length > 0 && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-muted-foreground text-xs mb-1">Members ({order.members.length})</p>
          <div className="flex flex-wrap gap-1">
            {order.members.map((m) => (
              <span key={m.id} className="text-xs bg-card-alt px-2 py-0.5 rounded-lg text-muted-foreground">
                {m.student_name} × {m.quantity}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}