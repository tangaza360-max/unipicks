import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Check, Copy, ShoppingCart, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

function finalPriceOf(deal) {
  if (!deal || deal.price == null) return null
  if (deal.discount_percent == null) return deal.price
  return Math.round(deal.price * (1 - deal.discount_percent / 100))
}

export default function GroupOrders() {
  const [searchParams] = useSearchParams()
  const initialJoinCode = searchParams.get('join_code') || ''
  const navigate = useNavigate()
  const [joinFormOpen, setJoinFormOpen] = useState(Boolean(initialJoinCode))
  const [hostedOrders, setHostedOrders] = useState([])
  const [joinedOrders, setJoinedOrders] = useState([])
  const [loadingOrders, setLoadingOrders] = useState(true)

  useEffect(() => {
    loadMyOrders()
  }, [])

  async function loadMyOrders() {
    setLoadingOrders(true)
    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setHostedOrders([])
      setJoinedOrders([])
      setLoadingOrders(false)
      return
    }

    const userId = userData.user.id
    const [hostingResult, joinedResult] = await Promise.all([
      supabase
        .from('group_orders')
        .select('*, deals(id, title, business_name, price, discount_percent, image_url, min_participants)')
        .eq('created_by', userId)
        .neq('status', 'cancelled')
        .order('created_at', { ascending: false }),
      supabase
        .from('group_order_members')
        .select('id, group_order_id, student_id, student_name, quantity, payment_status, joined_at, group_orders!inner(id, deal_id, created_by, host_name, join_code, status, created_at, deals(id, title, business_name, price, discount_percent, image_url, min_participants))')
        .eq('student_id', userId)
        .order('joined_at', { ascending: false }),
    ])

    if (hostingResult.error) console.error('[GroupOrders] load hosted groups error:', hostingResult.error)
    if (joinedResult.error) console.error('[GroupOrders] load joined groups error:', joinedResult.error)

    const hosts = (hostingResult.data || []).filter((order) => order.status !== 'cancelled')
    const joinedMemberships = (joinedResult.data || []).filter((membership) =>
      membership.group_orders &&
      membership.group_orders.created_by !== userId &&
      membership.group_orders.status !== 'cancelled'
    )
    const joinedById = new Map()
    for (const membership of joinedMemberships) {
      const order = membership.group_orders
      if (!joinedById.has(order.id)) joinedById.set(order.id, order)
    }
    const groupIds = [...new Set([
      ...hosts.map((order) => order.id),
      ...[...joinedById.keys()],
    ])]
    let membersByGroup = {}

    if (groupIds.length > 0) {
      const { data: members, error: membersError } = await supabase
        .from('group_order_members')
        .select('*')
        .in('group_order_id', groupIds)
        .order('joined_at', { ascending: true })

      if (membersError) {
        console.error('[GroupOrders] load group members error:', membersError)
      } else {
        membersByGroup = (members || []).reduce((groups, member) => {
          if (!groups[member.group_order_id]) groups[member.group_order_id] = []
          groups[member.group_order_id].push(member)
          return groups
        }, {})
      }
    }

    setHostedOrders(hosts.map((order) => ({
      ...order,
      members: membersByGroup[order.id] || [],
    })))
    setJoinedOrders([...joinedById.values()].map((order) => ({
      ...order,
      members: membersByGroup[order.id] || [],
    })))
    setLoadingOrders(false)
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-5 px-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-xl font-semibold">
          <ShoppingCart size={20} className="text-accent" /> My Groups
        </h2>
        <button
          type="button"
          onClick={() => setJoinFormOpen(true)}
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-accent hover:text-accent"
        >
          Join with a code
        </button>
      </header>

      {joinFormOpen && (
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Join a group order</h3>
            <button
              type="button"
              onClick={() => setJoinFormOpen(false)}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
          <JoinOrder initialCode={initialJoinCode} onJoined={loadMyOrders} />
        </div>
      )}

      {loadingOrders ? (
        <div className="grid gap-5 lg:grid-cols-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-48 animate-pulse rounded-lg border border-border bg-muted/60" />
          ))}
        </div>
      ) : hostedOrders.length === 0 && joinedOrders.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border px-5 py-10 text-center">
          <ShoppingCart size={28} className="text-muted-foreground" />
          <h3 className="mt-3 font-display text-lg font-semibold">You haven't joined any groups yet</h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Browse deals to start or join a group order and save with friends.
          </p>
          <button
            type="button"
            onClick={() => navigate('/dashboard/deals')}
            className="mt-4 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-background-foreground transition hover:bg-accent-dim"
          >
            Browse deals
          </button>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold">Groups you're hosting</h3>
            {hostedOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">None right now.</p>
            ) : (
              hostedOrders.map((order) => (
                <HostedOrderCard key={order.id} order={order} onChanged={loadMyOrders} />
              ))
            )}
          </section>

          <section className="space-y-3">
            <h3 className="font-display text-base font-semibold">Groups you've joined</h3>
            {joinedOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">None right now.</p>
            ) : (
              joinedOrders.map((order) => (
                <JoinedOrderCard key={order.id} order={order} />
              ))
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function JoinOrder({ initialCode = '', onJoined }) {
  const [code, setCode] = useState(initialCode)
  const [quantity, setQuantity] = useState(1)
  const [found, setFound] = useState(null)
  const [error, setError] = useState('')
  const [joined, setJoined] = useState(false)
  const [checking, setChecking] = useState(false)

  async function handleCheckCode(e) {
    e.preventDefault()
    setError('')
    setChecking(true)

    const { data, error: fetchError } = await supabase.rpc(
      'find_open_group_order_by_code',
      { p_join_code: code.trim().toUpperCase() }
    )

    setChecking(false)

    const order = Array.isArray(data) ? data[0] : data

    if (fetchError || !order) {
      setError('No open group order found with that code.')
      return
    }

    setFound({
      ...order,
      deals: {
        title: order.title,
        business_name: order.business_name,
        price: order.price,
        discount_percent: order.discount_percent,
      },
    })
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
    onJoined?.()
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
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const unitPrice = finalPriceOf(order.deals)
  const total = unitPrice != null ? order.members.reduce((sum, m) => sum + Number(m.quantity || 0) * unitPrice, 0) : null

  async function handleCopyInvite() {
    try {
      await navigator.clipboard.writeText(order.join_code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch (copyError) {
      console.error('Failed to copy group invite code:', copyError)
      setSubmitError('Could not copy the invite code.')
    }
  }

  async function handleCancel() {
    await supabase.from('group_orders').update({ status: 'cancelled' }).eq('id', order.id)
    onChanged()
  }

  async function handleClose() {
    await supabase.from('group_orders').update({ status: 'closed' }).eq('id', order.id)
    onChanged()
  }

  async function handleSubmitGroupOrder() {
    setSubmitting(true)
    setSubmitError('')
    try {
      const { data, error } = await supabase.functions.invoke('create-group-order-payment', {
        body: { group_order_id: order.id },
      })
      if (error) throw new Error(error.message || 'Failed to submit group order')
      if (data?.order?.id) {
        navigate(`/payment?order_id=${data.order.id}`)
        return
      }
      if (data?.order_id) {
        navigate(`/payment?order_id=${data.order_id}`)
        return
      }
      throw new Error(data?.error || 'Group order submission failed')
    } catch (err) {
      console.error('Group order submission error:', err)
      setSubmitError(err.message || 'Unable to submit group order')
      setSubmitting(false)
    }
  }

  return (
    <GroupOrderCard
      order={order}
      hostLabel="You're hosting"
      actions={(
        <>
          {order.status === 'open' ? (
            <>
              <button
                type="button"
                onClick={handleCopyInvite}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-accent hover:text-accent"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy invite code'}
              </button>
              <button
                type="button"
                onClick={handleSubmitGroupOrder}
                disabled={submitting || total == null || total <= 0}
                className="flex items-center justify-center rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background-foreground transition hover:bg-accent-dim disabled:opacity-50"
              >
                {submitting ? 'Preparing…' : 'View & Pay'}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setExpanded((current) => !current)}
              className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-accent hover:text-accent"
            >
              {expanded ? 'Hide details' : 'View'}
            </button>
          )}
        </>
      )}
      expanded={expanded}
      error={submitError}
    >
      {order.status === 'open' && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5"
          >
            Mark as ordered / close
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="text-xs text-red-400/70 hover:text-red-400 border border-red-400/30 rounded-lg px-3 py-1.5"
          >
            Cancel order
          </button>
        </div>
      )}
    </GroupOrderCard>
  )
}

function JoinedOrderCard({ order }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <GroupOrderCard
      order={order}
      hostLabel={`${order.host_name || 'A student'}'s group`}
      expanded={expanded}
      actions={(
        <button
          type="button"
          onClick={() => setExpanded((current) => !current)}
          className="rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:border-accent hover:text-accent"
        >
          {expanded ? 'Hide details' : 'View'}
        </button>
      )}
    />
  )
}

function GroupOrderCard({ order, hostLabel, actions, expanded, error, children }) {
  const deal = order.deals
  const members = order.members || []
  const memberCount = members.length
  const totalQuantity = members.reduce((sum, member) => sum + Number(member.quantity || 0), 0)
  const unitPrice = finalPriceOf(deal)
  const total = unitPrice == null
    ? null
    : members.reduce((sum, member) => sum + Number(member.quantity || 0) * unitPrice, 0)
  const minimum = Number(deal?.min_participants)
  const progress = minimum > 0 && memberCount > 0
    ? Math.min(100, (memberCount / minimum) * 100)
    : 0

  return (
    <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
      <div className="flex gap-3 p-3">
        {deal?.image_url ? (
          <img
            src={deal.image_url}
            alt=""
            className="h-20 w-20 shrink-0 rounded-lg object-cover"
          />
        ) : (
          <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-accent/15 text-accent">
            <ShoppingCart size={24} />
          </div>
        )}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {deal?.title || 'Group order'} · {deal?.business_name || 'Business'}
              </p>
              <p className="text-xs text-muted-foreground">{hostLabel}</p>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
              order.status === 'open'
                ? 'bg-green-500/15 text-green-700'
                : 'bg-muted text-muted-foreground'
            }`}>
              {order.status === 'open' ? 'Open' : 'Closed'}
            </span>
          </div>
          {order.join_code && hostLabel === "You're hosting" && (
            <p className="font-mono text-[11px] text-muted-foreground">Code: {order.join_code}</p>
          )}
        </div>
      </div>

      <div className="space-y-2 px-3 pb-3">
        {memberCount > 0 && (
          <>
            <p className="text-xs text-muted-foreground">
              {minimum > 0
                ? `${memberCount} of ${minimum} joined`
                : `${memberCount} member${memberCount === 1 ? '' : 's'}`}
            </p>
            {minimum > 0 && (
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
              </div>
            )}
          </>
        )}

        {totalQuantity > 0 && (
          <p className="text-xs text-muted-foreground">
            {totalQuantity} item{totalQuantity === 1 ? '' : 's'}
            {total != null && ` · ${total.toLocaleString()} RWF`}
          </p>
        )}

        {expanded && members.length > 0 && (
          <div className="space-y-1 border-t border-border pt-2 text-xs text-muted-foreground">
            {members.map((member) => (
              <div key={member.id} className="flex justify-between gap-2">
                <span className="truncate">{member.student_name || 'Student'} × {member.quantity}</span>
                {unitPrice != null && <span>{(Number(member.quantity || 0) * unitPrice).toLocaleString()} RWF</span>}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-xs text-destructive">{error}</p>}
        {actions && <div className="grid grid-cols-2 gap-2 pt-1">{actions}</div>}
        {children && <div className="grid grid-cols-2 gap-2">{children}</div>}
      </div>
    </article>
  )
}