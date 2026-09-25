import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Star, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

function finalPriceOf(deal) {
  if (deal.price == null) return null
  if (deal.discount_percent == null) return deal.price
  return Math.round(deal.price * (1 - deal.discount_percent / 100))
}

export default function DealDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [deal, setDeal] = useState(null)
  const [ratingStats, setRatingStats] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

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
        setLoading(false)
        return
      }

      if (!data) {
        setError('This deal is no longer available.')
        setLoading(false)
        return
      }

      setDeal(data)

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
            onClick={() => navigate('/dashboard')}
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
          >
            Back to deals
          </button>
        </div>
      </div>
    )
  }

  const finalPrice = finalPriceOf(deal)
  const hasDiscount =
    deal.discount_percent != null && deal.price != null

  const expiresLabel = deal.expires_at
    ? new Date(deal.expires_at).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-3xl mx-auto px-4 py-5 md:py-8 space-y-5">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <ArrowLeft size={18} />
          Back
        </button>

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

            {deal.discount_percent != null && (
              <div className="absolute right-4 top-4 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-background-foreground shadow-lg">
                {deal.discount_percent}% off
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
                {hasDiscount && (
                  <span className="text-sm text-muted-foreground line-through">
                    {deal.price} RWF
                  </span>
                )}
                {finalPrice != null && (
                  <span className="text-2xl font-bold text-primary">
                    {finalPrice} RWF
                  </span>
                )}
              </div>

              {expiresLabel && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Valid until {expiresLabel}
                </p>
              )}
            </div>

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

            <button
              onClick={() => navigate(`/deal/${deal.id}/confirm`)}
              className="w-full rounded-lg bg-primary py-3 text-sm font-semibold text-primary-foreground transition hover:bg-accent-dim"
            >
              Continue to Order
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
