import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { studentPrice } from '../lib/dealPricing.js'
import { liveChannel } from '../lib/realtime.js'
import { createOrder } from '../lib/orders.js'
import GroupOrders from './GroupOrders.jsx'
import StoryViewer from '../components/StoryViewer.jsx'
import { Store, Search, X, Users, ChevronRight, LayoutGrid, Pizza, Utensils, Sandwich, CupSoda, IceCreamCone, Sparkles } from 'lucide-react'
import DealTile, { isNewDeal } from '../components/DealTile.jsx'
import DealActions from '../components/DealActions.jsx'
import { haptic } from '../lib/haptics.js'
import { isDealOpenNow } from '../../supabase/functions/_shared/deal-availability.ts'
import { formatMoney } from '../lib/format.js'

function makeCode() {
  return String(Math.floor(1000 + Math.random() * 9000))
}

const finalPriceOf = studentPrice

function extractBudget(text) {
  const kMatch = text.match(/(\d+(\.\d+)?)\s*k\b/i)
  if (kMatch) return Math.round(parseFloat(kMatch[1]) * 1000)
  const numMatch = text.match(/\d{2,}/)
  if (numMatch) return Number(numMatch[0])
  return null
}

// Category circles: an icon until a business posts a photo in that category.
const CATEGORY_ICONS = { all: LayoutGrid, Pizza, Tacos: Utensils, Burgers: Sandwich, Drinks: CupSoda, Desserts: IceCreamCone, Specials: Sparkles }
const CHEAP = 3000 // RWF, the "Under 3,000 RWF" row

function matchesCategory(deal, category) {
  if (category === 'all') return true
  const c = category.toLowerCase()
  return deal.title.toLowerCase().includes(c) || (deal.description || '').toLowerCase().includes(c)
}

export default function DealsFeed({ advisorOpen = false } = {}) {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [budget, setBudget] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [ratingStats, setRatingStats] = useState({})
  const [social, setSocial] = useState({}) // deal id → { like_count, liked_by_me, saved_by_me }
  const [socialBusy, setSocialBusy] = useState(() => new Set())
  const [socialNotice, setSocialNotice] = useState('')
  const [stories, setStories] = useState([])
  const [merchantData, setMerchantData] = useState({})
  const [storyViewerOpen, setStoryViewerOpen] = useState(false)
  const [selectedStoryMerchant, setSelectedStoryMerchant] = useState(null)
  const navigate = useNavigate()

  const categories = ['all', 'Pizza', 'Tacos', 'Burgers', 'Drinks', 'Desserts', 'Specials']

  useEffect(() => {
    const query = searchQuery.trim()

    if (query.length < 2) return

    const timer = setTimeout(async () => {
      const { error } = await supabase.rpc('record_deal_search', {
        p_search_query: query,
      })

      if (error) {
        console.warn('Could not record deal search:', error.message)
      }
    }, 700)

    return () => clearTimeout(timer)
  }, [searchQuery])


  // --- Load stories and fetch merchant data ---
  async function loadStories() {
    try {
      // 1. Fetch active stories
      const { data, error } = await supabase
        .from('merchant_stories')
        .select('*')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading stories:', error)
        setStories([])
        return
      }

      setStories(data || [])

      if (data && data.length > 0) {
        // 2. Get unique merchant IDs
        const merchantIds = [...new Set(data.map(s => s.merchant_id))]

        // 3. Try to fetch merchant profiles
        let merchantMap = {}
        try {
          const { data: profiles, error: profileError } = await supabase
            .from('merchant_profiles')
            .select('id, business_name, logo_url')
            .in('id', merchantIds)

          if (!profileError && profiles) {
            profiles.forEach(p => {
              merchantMap[p.id] = {
                business_name: p.business_name || 'Business',
                logo_url: p.logo_url || null,
              }
            })
          } else {
            console.warn('No merchant profiles found, falling back to deals table')
          }
        } catch (err) {
          console.warn('Error fetching merchant profiles:', err)
        }

        // 4. Fallback: if any merchant missing, try to get business_name from deals
        const missingIds = merchantIds.filter(id => !merchantMap[id])
        if (missingIds.length > 0) {
          const { data: dealsData, error: dealsError } = await supabase
            .from('deals')
            .select('merchant_id, business_name')
            .in('merchant_id', missingIds)
            .order('created_at', { ascending: true }) // get the oldest deal? any will do

          if (!dealsError && dealsData) {
            // Deduplicate by merchant_id (take first)
            const seen = new Set()
            dealsData.forEach(d => {
              if (!seen.has(d.merchant_id)) {
                seen.add(d.merchant_id)
                merchantMap[d.merchant_id] = {
                  business_name: d.business_name || 'Business',
                  logo_url: null,
                }
              }
            })
          }
        }

        // 5. For any still missing, use placeholder
        merchantIds.forEach(id => {
          if (!merchantMap[id]) {
            merchantMap[id] = { business_name: 'Business', logo_url: null }
          }
        })

        console.log('Merchant data loaded:', merchantMap)
        setMerchantData(merchantMap)
      }
    } catch (err) {
      console.error('Unexpected error in loadStories:', err)
      setStories([])
    }
  }

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
        setLoading(false)
        return
      }

      // Show the deals now; the stars follow in one request (not one per deal).
      setDeals(data || [])
      setLoading(false)

      const ids = (data || []).map((deal) => deal.id).slice(0, 200)
      if (ids.length === 0) return
      // Stars and likes/saves: two requests for the whole feed, side by side.
      const [stars, socialRes] = await Promise.all([
        supabase.rpc('get_deals_rating_stats', { p_deal_ids: ids }),
        supabase.rpc('get_deals_social', { p_deal_ids: ids }),
      ])
      if (cancelled) return
      if (stars.error) console.warn('Could not load star ratings:', stars.error.message)
      else setRatingStats(Object.fromEntries((stars.data || []).map((row) => [row.deal_id, row])))
      if (socialRes.error) console.warn('Could not load likes:', socialRes.error.message)
      else setSocial(Object.fromEntries((socialRes.data || []).map((row) => [row.deal_id, row])))
    }

    loadDeals()
    loadStories()

    const dealsChannel = liveChannel('student-feed-deals')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'deals',
          filter: 'active=eq.true',
        },
        () => {
          loadDeals()
        }
      )
      .subscribe()

    const storiesChannel = liveChannel('student-feed-stories')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'merchant_stories',
        },
        () => {
          loadStories()
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      dealsChannel.unsubscribe()
      storiesChannel.unsubscribe()
    }
  }, [])

  // ❤️ and 🔖: change the screen at once, then save; put it back if refused.
  async function toggleSocial(deal, kind) {
    if (socialBusy.has(deal.id)) return
    const before = social[deal.id] || { like_count: 0, liked_by_me: false, saved_by_me: false }
    const on = kind === 'like' ? !before.liked_by_me : !before.saved_by_me
    const after =
      kind === 'like'
        ? { ...before, liked_by_me: on, like_count: Math.max(0, Number(before.like_count || 0) + (on ? 1 : -1)) }
        : { ...before, saved_by_me: on }
    setSocial((current) => ({ ...current, [deal.id]: after }))
    setSocialBusy((current) => new Set(current).add(deal.id))
    setSocialNotice('')
    if (on) haptic(12)

    const { data: { user } } = await supabase.auth.getUser()
    let result
    if (kind === 'like') {
      result = on
        ? await supabase.from('deal_likes').insert({ student_id: user?.id, deal_id: deal.id })
        : await supabase.from('deal_likes').delete().eq('student_id', user?.id).eq('deal_id', deal.id)
    } else {
      result = on
        ? await supabase.from('student_saved_items').insert({ student_id: user?.id, item_type: 'deal', item_id: deal.id })
        : await supabase.from('student_saved_items').delete().eq('student_id', user?.id).eq('item_type', 'deal').eq('item_id', deal.id)
    }

    setSocialBusy((current) => {
      const next = new Set(current)
      next.delete(deal.id)
      return next
    })
    // Already liked / saved on another phone: the screen is right as it is.
    if (result.error && result.error.code !== '23505') {
      console.warn(`Could not ${kind} the deal:`, result.error.message)
      setSocial((current) => ({ ...current, [deal.id]: before }))
      setSocialNotice(kind === 'like' ? "Your like wasn't saved. Please try again." : "That wasn't saved. Please try again.")
    } else if (kind === 'save') {
      setSocialNotice(on ? `Saved: ${deal.title}` : `Removed from saved: ${deal.title}`)
    }
  }

  function tile(deal, className = '') {
    return (
      <DealTile
        key={deal.id}
        deal={deal}
        ratingStats={ratingStats[deal.id]}
        social={social[deal.id]}
        className={className}
        overlay={
          <DealActions
            deal={deal}
            social={social[deal.id]}
            busy={socialBusy.has(deal.id)}
            onLike={(d) => toggleSocial(d, 'like')}
            onSave={(d) => toggleSocial(d, 'save')}
          />
        }
      />
    )
  }

  // Count a view once per deal per visit (the same deal can be in several rows).
  const viewed = useRef(new Set())
  useEffect(() => {
    for (const deal of deals) {
      if (viewed.current.has(deal.id)) continue
      viewed.current.add(deal.id)
      supabase.rpc('record_deal_view', { p_deal_id: deal.id }).then(({ error: viewError }) => {
        if (viewError) console.warn('Could not record deal view:', viewError.message)
      })
    }
  }, [deals])

  // --- Group stories by merchant with merchant data ---
  const groupedStories = useMemo(() => {
    const map = {}
    for (const story of stories) {
      const merchantId = story.merchant_id
      const data = merchantData[merchantId] || { business_name: 'Business', logo_url: null }
      if (!map[merchantId]) {
        map[merchantId] = {
          merchant_id: merchantId,
          business_name: data.business_name,
          logo_url: data.logo_url,
          stories: [],
        }
      }
      map[merchantId].stories.push(story)
    }
    return Object.values(map)
  }, [stories, merchantData])

  // --- Order handler (for deal cards only) ---
  async function handleOrderFromStory(deal) {
    alert('This story does not have a linked deal.')
  }

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
      filtered = filtered.filter((d) => matchesCategory(d, selectedCategory))
    }

    // Smart Discovery v3:
  // Balance freshness, expiry urgency, affordability, and quality.
  const now = Date.now()

  const prices = filtered
    .map((deal) => finalPriceOf(deal))
    .filter((price) => price != null && price > 0)

  const averagePrice =
    prices.length > 0
      ? prices.reduce((sum, price) => sum + price, 0) / prices.length
      : null

  const getTimeScore = (deal) => {
  const from = deal.available_from
  const until = deal.available_until

  if (!from || !until) return 1

  const [fromHour, fromMinute] = from.split(':').map(Number)
  const [untilHour, untilMinute] = until.split(':').map(Number)

  const nowDate = new Date()
  const currentMinutes =
    nowDate.getHours() * 60 + nowDate.getMinutes()

  const fromMinutes = fromHour * 60 + fromMinute
  const untilMinutes = untilHour * 60 + untilMinute

  if (fromMinutes <= untilMinutes) {
    if (currentMinutes >= fromMinutes && currentMinutes <= untilMinutes) {
      return 1
    }

    if (currentMinutes < fromMinutes) {
      return 0.75
    }

    return 0.2
  }

  // Overnight window, for example 20:00 -> 02:00.
  if (currentMinutes >= fromMinutes || currentMinutes <= untilMinutes) {
    return 1
  }

  return 0.2
}

const getDiscoveryScore = (deal) => {
    const createdAt = deal.created_at
      ? new Date(deal.created_at).getTime()
      : now

    const expiresAt = deal.expires_at
      ? new Date(deal.expires_at).getTime()
      : null

    const ageHours = Math.max(
      0,
      (now - createdAt) / (1000 * 60 * 60)
    )

    const hoursUntilExpiry = expiresAt
      ? Math.max(0, (expiresAt - now) / (1000 * 60 * 60))
      : null

    const freshnessScore = Math.max(0, 48 - ageHours) / 48

    const expiryScore =
      hoursUntilExpiry !== null
        ? Math.max(0, 48 - hoursUntilExpiry) / 48
        : 0



 const finalPrice = finalPriceOf(deal)

    const affordabilityScore =
      averagePrice && finalPrice != null
        ? Math.min(1, averagePrice / finalPrice)
        : 0

    const stats = ratingStats[deal.id]
    const reviewCount = Number(stats?.review_count || 0)
    const averageRating = Number(stats?.average_rating || 0)

    const qualityScore =
      reviewCount > 0
        ? (averageRating / 5) * Math.min(1, reviewCount / 10)
        : 0.5

    const weekdayNames = [
      'sunday',
      'monday',
      'tuesday',
      'wednesday',
      'thursday',
      'friday',
      'saturday',
    ]

    const todayIndex = new Date().getDay()
    const availableDays = Array.isArray(deal.available_days)
      ? deal.available_days
      : []

    const dayScore =
      availableDays.length === 0 || availableDays.length === 7
        ? 1
        : Math.max(
            0.1,
            1 -
              Math.min(
                ...availableDays.map((day) => {
                  const dayIndex = weekdayNames.indexOf(day)
                  if (dayIndex === -1) return 6

                  return (dayIndex - todayIndex + 7) % 7
                })
              ) *
                0.15
          )

  const timeScore = getTimeScore(deal)

  return (
    dayScore * 0.25 +
    timeScore * 0.25 +
    expiryScore * 0.2 +
    affordabilityScore * 0.15 +
    freshnessScore * 0.1 +
    qualityScore * 0.05
  )
  }

  return [...filtered].sort(
      (a, b) => getDiscoveryScore(b) - getDiscoveryScore(a)
    )
  }, [deals, budget, searchQuery, selectedCategory])

  const filtering = budget != null || searchQuery.trim() !== '' || selectedCategory !== 'all'

  // Rows that scroll sideways (shown when nothing is filtered). A row that
  // would only repeat the full list, or is empty, is left out.
  const rows = useMemo(() => {
    if (filtering) return []
    const now = Date.now()
    const priced = (d) => finalPriceOf(d) != null
    const candidates = [
      ['Available now', visibleDeals.filter((d) => isDealOpenNow(d))],
      [`Under ${formatMoney(CHEAP)}`, visibleDeals.filter((d) => priced(d) && finalPriceOf(d) <= CHEAP).sort((a, b) => finalPriceOf(a) - finalPriceOf(b))],
      ['Group buys', visibleDeals.filter((d) => d.offer_type === 'group_buy')],
      ['New this week', visibleDeals.filter((d) => isNewDeal(d, now))],
    ]
    const saved = visibleDeals.filter((d) => social[d.id]?.saved_by_me)
    return [
      // Your saved deals come first and always show (like Instagram's Saved).
      ...(saved.length > 0 ? [['Saved', saved]] : []),
      ...candidates.filter(([, list]) => list.length > 0 && list.length < visibleDeals.length),
    ]
  }, [filtering, visibleDeals, social])

  // First photo a business posted in each category, for its circle.
  const categoryPhotos = useMemo(() => {
    const photos = {}
    for (const cat of categories) {
      photos[cat] = deals.find((d) => d.image_url && matchesCategory(d, cat))?.image_url || null
    }
    return photos
  }, [deals])

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading deals…</p>
  }

  if (error) {
    return <p className="text-sm text-destructive">Couldn't load deals: {error}</p>
  }

  if (advisorOpen) {
    return <Advisor deals={deals} onBudget={setBudget} />
  }

  return (
    <div className="space-y-4 relative">
      {/* --- STORIES ROW --- */}
      {groupedStories.length > 0 && (
        <div className="pb-2 border-b border-border/50">
          <div className="flex gap-4 overflow-x-auto py-2">
            {groupedStories.map((merchant) => {
              const initial = merchant.business_name.charAt(0).toUpperCase()
              const logoUrl = merchant.logo_url

              return (
                <button
                  key={merchant.merchant_id}
                  onClick={() => {
                    setSelectedStoryMerchant(merchant)
                    setStoryViewerOpen(true)
                  }}
                  className="flex flex-col items-center gap-1 min-w-[70px]"
                >
                  <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-accent to-primary p-[2px]">
                    <div className="w-full h-full rounded-full bg-card overflow-hidden flex items-center justify-center">
                      {logoUrl ? (
                        <img
                          src={logoUrl}
                          alt={merchant.business_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-xl font-bold text-foreground">
                          {initial || <Store size={20} />}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate max-w-[70px]">
                    {merchant.business_name}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Group Orders lives under Home (social decision D1). */}
      <button
        type="button"
        onClick={() => navigate('/dashboard/orders')}
        className="w-full min-h-11 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left hover:border-accent/50 transition md:hidden"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
          <Users size={18} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">My group orders</span>
          <span className="block text-xs text-muted-foreground">Order together with friends and pay once</span>
        </span>
        <ChevronRight size={18} className="text-muted-foreground" aria-hidden="true" />
      </button>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h2 className="sr-only">Find a deal</h2>
          {budget != null && (
            <button
              onClick={() => setBudget(null)}
              className="text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1"
            >
              Showing under {formatMoney(budget)} · clear
            </button>
          )}
        </div>

        <div className="relative">
          <input
            type="search"
            aria-label="Search deals or restaurants"
            placeholder="Search deals or restaurants..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-input border border-input rounded-lg pl-10 pr-4 py-2.5 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={16} />
            </button>
          )}
        </div>

        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
          {categories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat] || Utensils
            const selected = selectedCategory === cat
            const photo = cat === 'all' ? null : categoryPhotos[cat]
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                aria-pressed={selected}
                className="flex w-16 shrink-0 flex-col items-center gap-1"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-16 w-16 items-center justify-center overflow-hidden rounded-full transition ${
                    selected ? 'ring-2 ring-accent ring-offset-2 ring-offset-background' : ''
                  } ${photo ? 'bg-muted' : selected ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
                >
                  {photo ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Icon size={24} />}
                </span>
                <span className={`max-w-16 truncate text-xs ${selected ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>
                  {cat === 'all' ? 'All' : cat}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Read out after a save, or when a like/save fails. */}
      <p role="status" aria-live="polite" className={socialNotice ? 'text-sm text-muted-foreground' : 'sr-only'}>
        {socialNotice}
      </p>

      {deals.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No deals yet — check back once local businesses start posting.
        </p>
      ) : visibleDeals.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing fits that budget right now — try raising it.</p>
      ) : (
        <div className="space-y-6">
          {rows.map(([title, list], index) => (
            // aria-labelledby takes a list of ids split by spaces: keep ids space-free.
            <section key={title} aria-labelledby={`deal-row-${index}`}>
              <h2 id={`deal-row-${index}`} className="mb-2 font-display text-lg font-semibold">{title}</h2>
              <div className="-mx-4 flex snap-x scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:scroll-px-0 md:px-0">
                {list.map((deal) => (
                  tile(deal, 'w-[72%] max-w-[280px] shrink-0 snap-start')
                ))}
              </div>
            </section>
          ))}

          <section aria-labelledby="row-all">
            <h2 id="row-all" className="mb-2 font-display text-lg font-semibold">
              {filtering ? `Results (${visibleDeals.length})` : 'All deals'}
            </h2>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleDeals.map((deal) => (
                tile(deal)
              ))}
            </div>
          </section>
        </div>
      )}

       {/* --- Story Viewer Modal --- */}
      {storyViewerOpen && selectedStoryMerchant && (
        <StoryViewer
          stories={selectedStoryMerchant.stories}
          onClose={() => setStoryViewerOpen(false)}
          initialIndex={0}
          onOrder={handleOrderFromStory}
        />
      )}
    </div>
  )
}

// --- Advisor component (unchanged) ---
function Advisor({ deals, onBudget }) {
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
        .map((d) => `${d.title} (${formatMoney(d.finalPrice)})`)
        .join(', ')
      let reply = `With ${formatMoney(found)} you can get: ${names}. Check the Home tab — I've filtered the feed to match.`
      if (closeCall.length > 0) {
        reply += ` A couple of things are just a bit over — team up with a friend to split one and it fits easily.`
      }
      return reply
    }

    if (closeCall.length > 0) {
      const names = closeCall
        .slice(0, 2)
        .map((d) => `${d.title} (${formatMoney(d.finalPrice)})`)
        .join(', ')
      return `Nothing fits ${formatMoney(found)} alone right now, but ${names} would work if you split it with a friend.`
    }

    return `Nothing fits ${formatMoney(found)} right now — check back as more deals get posted.`
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
    <div className="flex flex-col h-[calc(100vh-11rem)] md:h-[calc(100vh-8rem)] bg-card border border-border rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <p className="font-display font-semibold text-sm flex items-center gap-2"><SparkleIcon /> Deal Advisor</p>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`text-sm rounded-lg px-3 py-2 max-w-[85%] ${
              m.from === 'bot'
                ? 'bg-muted text-foreground'
                : 'bg-primary text-primary-foreground ml-auto'
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
          className="flex-1 bg-input border border-input rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="bg-primary text-primary-foreground font-semibold rounded-lg px-3 text-sm"
        >
          Send
        </button>
      </form>
    </div>
  )
}

function SparkleIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2l1.8 5.4L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.6L12 2z" />
    </svg>
  )
}
