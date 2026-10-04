import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Star, Store, Users } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { dealHoursLabel, hasDealHours, isDealOpenNow } from '../../supabase/functions/_shared/deal-availability.ts'
import { hasStudentPrice, offerBadge, struckOutPrice, studentPrice } from '../lib/dealPricing.js'
import { formatMoney, formatDate } from '../lib/format.js'
import BackLink from '../components/BackLink.jsx'

function formatRelativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deal, setDeal] = useState(null)
  const [openGroups, setOpenGroups] = useState([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [ratingStats, setRatingStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setOpenGroups([])
    setLoadingGroups(true)

    async function loadDeal() {
      setLoading(true)
      setError('')

      const { data, error: dealError } = await supabase
        .from('deals')
        .select('*')
        .eq('id', id)
        .eq('active', true)
        .maybeSingle()

      if (cancelled) return

      if (dealError) {
        setError(dealError.message)
        setLoadingGroups(false)
        setLoading(false)
        return
      }

      if (!data) {
        setError('This deal is no longer available.')
        setLoadingGroups(false)
        setLoading(false)
        return
      }

      setDeal(data)

      async function loadOpenGroups() {
        try {
          const { data: groups, error: groupsError } = await supabase.rpc(
            'get_open_groups_for_deal',
            { p_deal_id: data.id }
          )

          if (cancelled) return
          if (groupsError) {
            console.error('Failed to load open groups for deal:', groupsError)
            setOpenGroups([])
          } else {
            setOpenGroups(groups || [])
          }
        } catch (groupsError) {
          if (cancelled) return
          console.error('Failed to load open groups for deal:', groupsError)
          setOpenGroups([])
        } finally {
          if (!cancelled) setLoadingGroups(false)
        }
      }

      loadOpenGroups()

      const { data: ratingData, error: ratingError } = await supabase.rpc(
        'get_deal_rating_stats',
        { target_deal_id: data.id }
      )

      if (!cancelled && !ratingError) {
        setRatingStats(ratingData)
      }

      setLoading(false)
    }

    loadDeal()

    return () => {
      cancelled = true
    }
  }, [id])

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <p className="text-muted-foreground">Loading deal…</p>
      </div>
    )
  }

  if (error || !deal) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">
            {error || 'Deal not found.'}
          </p>
          <button
            onClick={() => navigate('/dashboard/deals')}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Back to deals
          </button>
        </div>
      </div>
    )
  }

  const finalPrice = studentPrice(deal)
  const originalPrice = struckOutPrice(deal)
  const badge = offerBadge(deal)
  const priced = hasStudentPrice(deal)

  // Same rule the order functions enforce (Kigali time).
  const openNow = isDealOpenNow(deal)
  const hoursLabel = hasDealHours(deal) ? dealHoursLabel(deal) : null

  const expiresLabel = deal.expires_at
    ? formatDate(deal.expires_at)
    : null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-5 md:py-8 space-y-5">
        <BackLink to="/dashboard/deals" />

        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="relative h-56 w-full sm:h-72">
            {deal.image_url ? (
              <img
                src={deal.image_url}
                alt={deal.title}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-muted">
                <Store size={48} className="text-muted-foreground" />
              </div>
            )}

            {badge && (
              <div className="absolute right-4 top-4 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background-foreground shadow-lg">
                {badge}
              </div>
            )}
          </div>

          <div className="space-y-5 p-5 md:p-7">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {deal.business_name}
              </p>
              <h1 className="mt-1 font-display text-2xl font-semibold md:text-3xl">
                {deal.title}
              </h1>
            </div>

            {ratingStats?.review_count > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Star
                  size={16}
                  className="fill-amber-500 text-amber-500"
                />
                <span>{ratingStats.average_rating}</span>
                <span className="text-muted-foreground">
                  ({ratingStats.review_count} reviews)
                </span>
              </div>
            )}

            {deal.description && (
              <div>
                <h2 className="font-semibold">About this deal</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {deal.description}
                </p>
              </div>
            )}

            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="flex flex-wrap items-end gap-3">
                {originalPrice != null && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatMoney(originalPrice)}
                  </span>
                )}
                {finalPrice != null ? (
                  <span className="text-2xl font-bold text-primary">
                    {formatMoney(finalPrice)}
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">Price not set. This deal can't be ordered yet.</span>
                )}
              </div>

              {expiresLabel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Valid until {expiresLabel}
                </p>
              )}
              {hoursLabel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Available {hoursLabel} (Kigali time)
                </p>
              )}
            </div>

            {(loadingGroups || openGroups.length > 0) && (
              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                  <Users size={17} className="text-accent" />
                  <h2 className="font-semibold">Open groups for this deal</h2>
                </div>
                {loadingGroups ? (
                  <p className="px-4 py-3 text-sm text-muted-foreground">
                    Checking for open groups…
                  </p>
                ) : (
                  <div className="divide-y divide-border">
                    {openGroups.map((group) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between gap-3 px-4 py-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">
                            {group.host_name || 'A student'} · {group.member_count} member{Number(group.member_count) === 1 ? '' : 's'} · {group.total_quantity} item{Number(group.total_quantity) === 1 ? '' : 's'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Started {formatRelativeTime(group.created_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => navigate(`/dashboard/orders?join_code=${group.join_code}`)}
                          className="shrink-0 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-background-foreground transition hover:bg-accent-dim"
                        >
                          Join
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <div className="border-t border-border pt-4">
              <h2 className="font-semibold">Terms</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Please review the deal description, price, expiry date, and
                the Unipicks Terms of Service before ordering.
              </p>
              <button
                onClick={() => navigate('/terms')}
                className="mt-2 text-sm text-primary hover:underline"
              >
                View Unipicks Terms of Service
              </button>
            </div>

            {!openNow && (
              <p role="status" className="text-sm text-muted-foreground text-center">
                This deal can't be ordered right now. It's available {dealHoursLabel(deal)} (Kigali time).
              </p>
            )}
            <button
              onClick={() => navigate(`/deal/${deal.id}/confirm`)}
              disabled={!openNow || !priced}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-accent-dim disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {!priced ? 'Price not set' : openNow ? 'Continue to Order' : 'Not available right now'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
