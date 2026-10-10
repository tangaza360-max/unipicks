import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Store, Tag, UserPlus, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import StudentAvatar from '../components/StudentAvatar.jsx'
import { formatMoney } from '../lib/format.js'
import { isMissingPrice } from '../lib/dealPricing.js'

const tabs = [
  { id: 'people', label: 'People', noun: 'students' },
  { id: 'businesses', label: 'Businesses', noun: 'businesses' },
  { id: 'deals', label: 'Deals', noun: 'deals' },
]

function getInitials(name = '') {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?'
}

function offerLabel(offerType) {
  const labels = {
    percentage: 'Percentage deal',
    fixed_amount: 'Fixed amount off',
    bogo: 'Buy X, get Y',
    fixed_price: 'Bundle price',
    tiered: 'Tiered deal',
    free_shipping: 'Free delivery',
    group_buy: 'Group buy',
  }
  return labels[offerType] || 'Deal'
}

export default function StudentSearch() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [activeTab, setActiveTab] = useState('people')
  const [results, setResults] = useState([])
  const [friendStatuses, setFriendStatuses] = useState({})
  const [requestingIds, setRequestingIds] = useState({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300)
    return () => clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!debouncedQuery) {
      setResults([])
      setFriendStatuses({})
      setError('')
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)
    setError('')

    async function search() {
      try {
        if (activeTab === 'people') {
          const { data, error: searchError } = await supabase.rpc('search_students', {
            search_query: debouncedQuery,
          })
          if (searchError) throw searchError
          const people = data || []
          if (cancelled) return
          setResults(people)

          const statusEntries = await Promise.all(people.map(async (person) => {
            const { data: areFriends, error: statusError } = await supabase.rpc(
              'are_students_friends',
              { target_id: person.user_id },
            )
            if (statusError) throw statusError
            return [person.user_id, areFriends ? 'friends' : 'available']
          }))
          if (!cancelled) setFriendStatuses(Object.fromEntries(statusEntries))
        } else if (activeTab === 'businesses') {
          const { data, error: searchError } = await supabase.rpc('search_merchants', {
            search_query: debouncedQuery,
          })
          if (searchError) throw searchError
          if (!cancelled) setResults(data || [])
        } else {
          const safeQuery = debouncedQuery.replace(/[(),]/g, ' ').trim()
          const { data, error: searchError } = await supabase
            .from('deals')
            .select('id, title, business_name, price, final_price, image_url, offer_type, discount_value, discount_percent')
            .eq('active', true)
            .or(`title.ilike.%${safeQuery}%,business_name.ilike.%${safeQuery}%`)
            .limit(30)
          if (searchError) throw searchError
          // A deal without a price can't be ordered, so students don't see it.
          if (!cancelled) setResults((data || []).filter((deal) => !isMissingPrice(deal)))
        }
      } catch (searchError) {
        console.error('Search failed:', searchError)
        if (!cancelled) {
          setResults([])
          setFriendStatuses({})
          setError(`Unable to search ${tabs.find((tab) => tab.id === activeTab)?.noun || 'results'} right now.`)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    search()
    return () => {
      cancelled = true
    }
  }, [activeTab, debouncedQuery])

  async function handleAddFriend(userId) {
    setRequestingIds((current) => ({ ...current, [userId]: true }))
    setError('')
    const { error: requestError } = await supabase.rpc('send_friend_request', {
      target_id: userId,
    })
    if (requestError) {
      console.error('Failed to send friend request:', requestError)
      setError('Unable to send friend request. Please try again.')
    } else {
      setFriendStatuses((current) => ({ ...current, [userId]: 'sent' }))
    }
    setRequestingIds((current) => ({ ...current, [userId]: false }))
  }

  const tabNoun = tabs.find((tab) => tab.id === activeTab)?.noun || 'students'
  const formattedQuery = debouncedQuery.replace(/[&<>"']/g, '').slice(0, 80)

  return (
    <section className="mx-auto w-full max-w-3xl space-y-4 pb-4">
      <div className="relative">
        <Search
          size={18}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          aria-label="Search students, businesses, or deals"
          placeholder="Search students, businesses, or deals…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className="field-input w-full !pl-10"
        />
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">{error}</p>
      )}

      <div className="flex gap-2 border-b border-border pb-3" role="tablist" aria-label="Search categories">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 ${
              activeTab === tab.id
                ? 'bg-accent text-background-foreground shadow-sm'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="min-h-[240px] space-y-3" aria-live="polite">
        {!debouncedQuery ? (
          <div className="flex min-h-[240px] items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">Search for {tabNoun} by name</p>
          </div>
        ) : loading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <p className="text-sm text-muted-foreground">Searching…</p>
          </div>
        ) : results.length === 0 ? (
          <div className="flex min-h-[240px] items-center justify-center text-center">
            <p className="text-sm text-muted-foreground">
              No {tabNoun} found for '{formattedQuery}'
            </p>
          </div>
        ) : activeTab === 'people' ? (
          results.map((person) => {
            const status = friendStatuses[person.user_id]
            const isRequesting = Boolean(requestingIds[person.user_id])
            return (
              <article key={person.user_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
                <StudentAvatar userId={person.user_id} name={person.display_name || 'Student'} size="md" alt="" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{person.display_name || 'Student'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    @{(person.username || 'student').replace(/^@+/, '')}
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[person.university, person.campus].filter(Boolean).join(' · ') || 'Student'}
                  </p>
                  {person.short_bio && (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{person.short_bio}</p>
                  )}
                </div>
                <button
                  type="button"
                  disabled={status === 'friends' || status === 'sent' || isRequesting || status === undefined}
                  onClick={() => handleAddFriend(person.user_id)}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-background-foreground transition hover:bg-accent-dim disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {status === 'friends' ? <Users size={14} /> : <UserPlus size={14} />}
                  <span>{status === 'friends' ? 'Friends ✓' : status === 'sent' ? 'Request Sent' : isRequesting ? 'Sending…' : 'Add Friend'}</span>
                </button>
              </article>
            )
          })
        ) : activeTab === 'businesses' ? (
          results.map((business) => (
            <article key={business.user_id} className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 sm:p-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-semibold text-accent">
                {getInitials(business.business_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{business.business_name || 'Business'}</p>
                {business.address && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{business.address}</p>}
              </div>
              <button
                type="button"
                onClick={() => navigate('/dashboard/deals')}
                className="shrink-0 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-background-foreground transition hover:bg-accent-dim"
              >
                View
              </button>
            </article>
          ))
        ) : (
          results.map((deal) => {
            const displayPrice = deal.final_price ?? deal.price
            return (
              <button
                key={deal.id}
                type="button"
                onClick={() => navigate(`/deal/${deal.id}`)}
                className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left transition hover:border-accent/50 sm:p-4"
              >
                {deal.image_url ? (
                  <img src={deal.image_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden="true">
                    <Tag size={22} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{deal.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">{deal.business_name}</span>
                  <span className="mt-1 block text-sm font-bold text-primary">
                    {displayPrice != null ? `${formatMoney(displayPrice)}` : 'View deal'}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                  {offerLabel(deal.offer_type)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </section>
  )
}
