import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import GroupOrders from './GroupOrders.jsx'
import RatingPrompt from '../components/RatingPrompt.jsx'

function makeCode() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

function finalPriceOf(deal) {
  if (deal.price == null) return null
  if (deal.discount_percent == null) return deal.price
  return Math.round(deal.price * (1 - deal.discount_percent / 100))
}

function extractBudget(text) {
  const kMatch = text.match(/(\d+(\.\d+)?)\s*k\b/i)
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000)
  const numMatch = text.match(/\d{2,}/)
  if (numMatch) return Number(numMatch[0])
  return null
}

export default function DealsFeed() {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [budget, setBudget] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [ratingStats, setRatingStats] = useState({})

  const categories = ['all', 'Pizza', 'Tacos', 'Burgers', 'Drinks', 'Desserts', 'Specials']

  useEffect(() => {
    let cancelled = false

    async function loadDeals() {
      const { data, error: fetchError } = await supabase
        .from('deals')
        .select('*')
        .eq('active', true)
        .order('created_at', { ascending: false })

      if (cancelled) return

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setDeals(data || [])
        const stats = await Promise.all((data || []).map(async (deal) => {
          const { data: stat } = await supabase.rpc('get_deal_rating_stats', { target_deal_id: deal.id })
          return [deal.id, stat?.[0] || stat || { average_rating: 0, review_count: 0 }]
        }))
        setRatingStats(Object.fromEntries(stats))
      }
      setLoading(false)
    }

    loadDeals()
    return () => {
      cancelled = true
    }
  }, [])

  const visibleDeals = useMemo(() => {
    let filtered = deals

    if (budget != null) {
      filtered = filtered.filter((d) => {
        const p = finalPriceOf(d)
        return p == null || p <= budget
      })
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim()
      filtered = filtered.filter((d) =>
        d.title.toLowerCase().includes(query) ||
        d.business_name.toLowerCase().includes(query) ||
        (d.description && d.description.toLowerCase().includes(query))
      )
    }

    if (selectedCategory !== 'all') {
      filtered = filtered.filter((d) =>
        d.title.toLowerCase().includes(selectedCategory.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(selectedCategory.toLowerCase()))
      )
    }

    return filtered
  }, [deals, budget, searchQuery, selectedCategory])

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading deals…</p>
  }

  if (error) {
    return <p className="text-sm text-red-400">Couldn't load deals: {error}</p>
  }

  return (
    <div className="space-y-4 relative">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="font-display text-lg font-semibold">Your deals feed</h2>
          {budget != null && (
            <button
              onClick={() => setBudget(null)}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1"
            >
              Showing under {budget} RWF · clear
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="text"
            placeholder="Search deals or restaurants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full field-input pl-10"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-lg text-sm whitespace-nowrap transition ${
                selectedCategory === cat
                  ? 'bg-accent text-background-foreground font-medium'
                  : 'bg-muted text-muted-foreground hover:text-foreground border border-border'
              }`}
            >
              {cat === 'all' ? 'All' : cat}
            </button>
          ))}
        </div>
      </div>

      {deals.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No deals yet — check back once local businesses start posting.
        </p>
      ) : visibleDeals.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing fits that budget right now — try raising it.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {visibleDeals.map((deal, index) => (
            <div
              key={deal.id}
              className="animate-slideUp"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <DealCard deal={deal} ratingStats={ratingStats[deal.id]} />
            </div>
          ))}
        </div>
      )}

      <GroupOrders deals={deals} />

      <Advisor deals={deals} onBudget={setBudget} />
    </div>
  )
}

function DealCard({ deal, ratingStats }) {
  const navigate = useNavigate()
  const [ordering, setOrdering] = useState(false)
  const [code, setCode] = useState(null)
  const [redemption, setRedemption] = useState(null)
  const [error, setError] = useState('')

  const expiresLabel = deal.expires_at
    ? new Date(deal.expires_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null

  const finalPrice = finalPriceOf(deal)
  const hasDiscount = deal.discount_percent != null && deal.price != null

  async function handleOrder() {
    setOrdering(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    const newCode = makeCode()

    const { data: redemptionData, error: insertError } = await supabase.from('redemptions').insert({
      deal_id: deal.id,
      student_id: userData.user.id,
      student_name: userData.user.user_metadata?.full_name ?? userData.user.email,
      code: newCode,
    }).select('id, deal_id, student_id, status').single()

    setOrdering(false)

    if (insertError) {
      setError(insertError.message)
      return
    }
    setCode(newCode)
    setRedemption({ ...redemptionData, deals: { merchant_id: deal.merchant_id } })
  }

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-md">
      <div className="relative h-40 w-full">
        {deal.image_url ? (
          <img src={deal.image_url} alt={deal.title} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-accent/30 via-muted to-card flex items-center justify-center">
            <ForkKnifeIcon />
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
        {deal.discount_percent != null && (
          <div className="absolute top-3 right-3 bg-accent text-background-foreground font-display font-semibold text-sm rounded-lg px-3 py-1.5 shadow-lg">
            {deal.discount_percent}% off
          </div>
        )}
      </div>

      <div className="p-4 space-y-1">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">{deal.business_name}</p>
        <h3 className="font-display font-semibold text-lg">{deal.title}</h3>
        {deal.description && <p className="text-muted-foreground text-sm">{deal.description}</p>}
        {ratingStats?.review_count > 0 && (
          <p className="text-amber-500 text-sm">★ {ratingStats.average_rating} <span className="text-muted-foreground">({ratingStats.review_count} reviews)</span></p>
        )}
        <div className="flex items-center gap-2 text-xs pt-1">
          {finalPrice != null && (
            <span className="flex items-center gap-2">
              {hasDiscount && (
                <span className="line-through text-muted-foreground">{deal.price} RWF</span>
              )}
              <span className="text-primary font-bold text-sm">{finalPrice} RWF</span>
            </span>
          )}
          {expiresLabel && <span className="text-muted-foreground">Valid until {expiresLabel}</span>}
        </div>

        {code ? (
          <div className="mt-3 bg-accent/10 border border-accent/40 rounded-lg p-4 text-center">
            <p className="text-muted-foreground text-xs mb-1">Show this code to {deal.business_name}</p>
            <p className="font-display text-3xl font-bold text-accent tracking-widest">{code}</p>
            <button
              type="button"
              onClick={() => navigate(`/payment?amount=${finalPrice || deal.price || 0}&deal_id=${deal.id}&description=${encodeURIComponent(deal.title)}`)}
              className="mt-3 w-full bg-primary text-primary-foreground font-semibold rounded-lg py-2.5 transition"
            >
              Pay Now
            </button>
            {redemption && redemption.status === 'redeemed' && <RatingPrompt redemption={redemption} />}
          </div>
        ) : (
          <button
            onClick={handleOrder}
            disabled={ordering}
            className="mt-3 w-full bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
          >
            {ordering ? 'Getting your code…' : 'Order now'}
          </button>
        )}

        {error && <p className="text-sm text-red-400 mt-2">{error}</p>}
      </div>
    </div>
  )
}

function Advisor({ deals, onBudget }) {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState([
    {
      from: 'bot',
      text: "Hi! Tell me your budget — like \"I have 2000 rwf\" — and I'll show you what fits.",
    },
  ])

  function respondTo(text) {
    const found = extractBudget(text)

    if (found == null) {
      return "I didn't catch a number — try something like \"2000\" or \"I have 1.5k\"."
    }

    onBudget(found)

    const withPrice = deals
      .map((d) => ({ ...d, finalPrice: finalPriceOf(d) }))
      .filter((d) => d.finalPrice != null)
    const affordable = withPrice.filter((d) => d.finalPrice <= found)
    const closeCall = withPrice.filter((d) => d.finalPrice > found && d.finalPrice <= found * 1.5)

    if (affordable.length > 0) {
      const names = affordable
        .slice(0, 3)
        .map((d) => `${d.title} (${d.finalPrice} RWF)`)
        .join(', ')
      let reply = `With ${found} RWF you can get: ${names}. I've filtered the feed below to match.`
      if (closeCall.length > 0) {
        reply += ` A couple of things are just a bit over — team up with a friend to split one and it fits easily.`
      }
      return reply
    }

    if (closeCall.length > 0) {
      const names = closeCall
        .slice(0, 2)
        .map((d) => `${d.title} (${d.finalPrice} RWF)`)
        .join(', ')
      return `Nothing fits ${found} RWF alone right now, but ${names} would work if you split it with a friend.`
    }

    return `Nothing fits ${found} RWF right now — check back as more deals get posted.`
  }

  function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return

    const botReply = respondTo(text)
    setMessages((m) => [...m, { from: 'user', text }, { from: 'bot', text: botReply }])
    setInput('')
  }

  return (
    <>
      {open && (
        <div className="fixed bottom-24 right-4 w-80 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-2xl flex flex-col overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <p className="font-display font-semibold text-sm">Deal Advisor</p>
            <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground text-lg leading-none">
              ×
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-80">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
                  m.from === 'bot'
                    ? 'bg-muted text-muted-foreground'
                    : 'bg-accent text-background-foreground ml-auto'
                }`}
              >
                {m.text}
              </div>
            ))}
          </div>
          <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="I have 2000 rwf..."
              className="field-input py-2 text-sm flex-1"
            />
            <button
              type="submit"
              className="bg-accent text-background-foreground font-semibold rounded-lg px-3 text-sm"
            >
              Send
            </button>
          </form>
        </div>
      )}

      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-6 right-4 w-14 h-14 rounded-full bg-accent text-background-foreground shadow-2xl flex items-center justify-center z-50 hover:bg-accent-dim transition"
        aria-label="Deal advisor"
      >
        <SparkleIcon />
      </button>
    </>
  )
}

function SparkleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.6L12 2z" />
    </svg>
  )
}

function ForkKnifeIcon() {
  return (
    <svg
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      className="text-muted-foreground"
    >
      <path d="M6 2v7a2 2 0 0 0 2 2v11" />
      <path d="M6 2v7M10 2v7" />
      <path d="M18 2c-2 0-3 2-3 5v3c0 1 .5 1.5 1.5 1.5V22" />
    </svg>
  )
}