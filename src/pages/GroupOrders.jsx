import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, QrCode } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

function makeJoinCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no confusing 0/O/1/I/L
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  return code
}

function finalPriceOf(deal) {
  if (!deal || deal.price == null) return null
  if (deal.discount_percent == null) return deal.price
  return Math.round(deal.price * (1 - deal.discount_percent / 100))
}

export default function GroupOrders({ deals }) {
  const [tab, setTab] = useState('start') // 'start' | 'join'
  const [myOrders, setMyOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  useEffect(() => {
    loadMyOrders()
  }, [])

  async function loadMyOrders() {
    setLoadingOrders(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) return

    const { data: orders } = await supabase
      .from('group_orders')
      .select('*, deals(title, business_name, price, discount_percent)')
      .eq('created_by', userData.user.id)
      .neq('status', 'cancelled')   // ← HIDE CANCELLED ORDERS
      .order('created_at', { ascending: false })

    if (!orders) {
      setMyOrders([])
      setLoadingOrders(false)
      return
    }

    const withMembers = await Promise.all(
      orders.map(async (order) => {
        const { data: members } = await supabase
          .from('group_order_members')
          .select('*')
          .eq('group_order_id', order.id)
          .order('joined_at', { ascending: true })
        return { ...order, members: members ?? [] }
      }),
    )

    setMyOrders(withMembers)
    setLoadingOrders(false)
  }

  return (
    <div className="border border-border rounded-lg p-5 space-y-5 bg-card shadow-sm">
      <h2 className="flex items-center gap-2 font-display text-xl font-semibold"><Users size={19} className="text-accent" /> Group orders</h2>

      <div className="flex gap-2 text-sm">
        <button
          onClick={() => setTab('start')}
          className={`px-3 py-1.5 rounded-lg border ${
            tab === 'start' ? 'border-accent text-accent' : 'border-border text-muted-foreground'
          }`}
        >
          Start one
        </button>
        <button
          onClick={() => setTab('join')}
          className={`px-3 py-1.5 rounded-lg border ${
            tab === 'join' ? 'border-accent text-accent' : 'border-border text-muted-foreground'
          }`}
        >
          Join with a code
        </button>
      </div>

      {tab === 'start' ? <StartOrder deals={deals} onCreated={loadMyOrders} /> : <JoinOrder />}

      <div className="pt-2 border-t border-border space-y-3">
        <h3 className="text-sm font-semibold text-muted-foreground">Orders you're hosting</h3>
        {loadingOrders ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : myOrders.length === 0 ? (
          <p className="text-muted-foreground text-sm">None yet.</p>
        ) : (
          myOrders.map((order) => (
            <HostedOrderCard key={order.id} order={order} onChanged={loadMyOrders} />
          ))
        )}
      </div>
    </div>
  )
}

function StartOrder({ deals, onCreated }) {
  const [dealId, setDealId] = useState(deals[0]?.id ?? '')
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState(null)

  async function handleStart() {
    if (!dealId) return
    setCreating(true)

    const { data: userData } = await supabase.auth.getUser()
    const code = makeJoinCode()

    const { data, error } = await supabase
      .from('group_orders')
      .insert({
        deal_id: dealId,
        created_by: userData.user.id,
        host_name: userData.user.user_metadata?.full_name ?? userData.user.email,
        join_code: code,
      })
      .select()
      .single()

    setCreating(false)

    if (!error) {
      setCreated(data)
      onCreated()
    }
  }

  if (created) {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${created.join_code}`
    return (
      <div className="bg-muted rounded-lg border border-border p-5 text-center space-y-3">
        <p className="text-muted-foreground text-sm">Share this with your friends</p>
        <div className="mx-auto flex w-fit rounded-lg border border-border bg-card p-2 shadow-sm"><img src={qrUrl} alt="QR code" className="rounded-lg" /></div>
        <p className="font-display text-3xl font-bold text-accent tracking-widest">
          {created.join_code}
        </p>
        <button onClick={() => setCreated(null)} className="text-xs text-muted-foreground hover:text-foreground">
          Start another
        </button>
      </div>
    )
  }

  if (deals.length === 0) {
    return <p className="text-muted-foreground text-sm">No deals available to order right now.</p>
  }

  return (
    <div className="space-y-3">
      <select className="field-input" value={dealId} onChange={(e) => setDealId(e.target.value)}>
        {deals.map((d) => (
          <option key={d.id} value={d.id}>
            {d.business_name} — {d.title}
          </option>
        ))}
      </select>
      <button
        onClick={handleStart}
        disabled={creating}
        className="w-full bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
      >
        {creating ? 'Starting…' : 'Start group order'}
      </button>
    </div>
  )
}

function JoinOrder() {
  const [code, setCode] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)
  const [checking, setChecking] = useState(false)

  async function handleCheckCode(e) {
    e.preventDefault()
    setError('')
    setChecking(true)

    const { data, error: fetchError } = await supabase
      .from('group_orders')
      .select('*, deals(title, business_name, price, discount_percent)')
      .eq('join_code', code.trim().toUpperCase())
      .eq('status', 'open')
      .maybeSingle()

    setChecking(false)

    if (fetchError || !data) {
      setError('No open group order found with that code.')
      return
    }
    setFound(data)
  }

  async function handleJoin(e) {
    e.preventDefault()
    setError('')

    const { data: userData } = await supabase.auth.getUser()

    const { error: joinError } = await supabase.from('group_order_members').insert({
      group_order_id: found.id,
      student_id: userData.user.id,
      student_name: userData.user.user_metadata?.full_name ?? userData.user.email,
      quantity,
    })

    if (joinError) {
      setError(joinError.message)
      return
    }
    setJoined(true)
  }

  if (joined) {
    return <p className="text-accent text-sm">You're in! {found.host_name} will see your order.</p>
  }

  if (found) {
    const unitPrice = finalPriceOf(found.deals)
    return (
      <form onSubmit={handleJoin} className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Joining {found.host_name}'s order for{' '}
          <span className="font-semibold">{found.deals?.title}</span> at{' '}
          {found.deals?.business_name}
          {unitPrice != null && <span> · {unitPrice} RWF each</span>}
        </p>

        <div className="flex items-center gap-4">
          <label className="field-label mb-0">How many?</label>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              className="w-9 h-9 rounded-lg border border-border text-lg"
            >
              −
            </button>
            <span className="font-display text-xl w-6 text-center">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => q + 1)}
              className="w-9 h-9 rounded-lg border border-border text-lg"
            >
              +
            </button>
          </div>
        </div>

        {unitPrice != null && (
          <p className="text-muted-foreground text-xs">Your total: {unitPrice * quantity} RWF</p>
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="w-full bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg py-2.5 transition"
        >
          Join order
        </button>
      </form>
    )
  }

  return (
    <form onSubmit={handleCheckCode} className="space-y-3">
      <input
        className="field-input"
        placeholder="6-letter code"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={6}
      />
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={checking || code.trim().length === 0}
        className="w-full bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
      >
        {checking ? 'Checking…' : 'Find order'}
      </button>
    </form>
  )
}

function HostedOrderCard({ order, onChanged }) {
  const navigate = useNavigate()
  const unitPrice = finalPriceOf(order.deals)
  const total = unitPrice != null ? order.members.reduce((sum, m) => sum + m.quantity * unitPrice, 0) : null

  async function handleCancel() {
    await supabase.from('group_orders').update({ status: 'cancelled' }).eq('id', order.id)
    onChanged()
  }

  async function handleClose() {
    await supabase.from('group_orders').update({ status: 'closed' }).eq('id', order.id)
    onChanged()
  }

  return (
    <div className="bg-muted rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">
          {order.deals?.title} · {order.deals?.business_name}
        </p>
        <span className="text-xs text-muted-foreground font-mono">{order.join_code}</span>
      </div>

      {order.status === 'closed' && (
        <p className="text-xs text-muted-foreground italic">Closed — no longer accepting joiners.</p>
      )}

      {order.members.length === 0 ? (
        <p className="text-muted-foreground text-xs">No one has joined yet.</p>
      ) : (
        <div className="text-xs text-muted-foreground space-y-1">
          {order.members.map((m) => (
            <div key={m.id} className="flex justify-between">
              <span>
                {m.student_name} × {m.quantity}
              </span>
              {unitPrice != null && <span>{m.quantity * unitPrice} RWF</span>}
            </div>
          ))}
          {total != null && (
            <div className="flex justify-between pt-1 mt-1 border-t border-border font-semibold text-foreground">
              <span>Total</span>
              <span>{total} RWF</span>
            </div>
          )}
        </div>
      )}

      {order.status === 'open' && (
        <div className="flex gap-2 mt-1">
          <button
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1"
          >
            Mark as ordered / close
          </button>
          <button
            onClick={handleCancel}
            className="text-xs text-red-400/70 hover:text-red-400 border border-red-400/30 rounded-lg px-3 py-1"
          >
            Cancel order
          </button>
        </div>
      )}

      {total != null && total > 0 && (
        <button
          type="button"
          onClick={() => navigate(`/payment?amount=${total}&order_id=${order.id}&deal_id=${order.deal_id}&description=${encodeURIComponent(order.deals?.title || 'Group order')}`)}
          className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition"
        >
          Pay Now · {total.toLocaleString()} RWF
        </button>
      )}
    </div>
  )
}