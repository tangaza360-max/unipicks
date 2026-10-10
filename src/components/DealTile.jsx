import { Link } from 'react-router-dom'
import { Heart, MessageCircle, Star } from 'lucide-react'
import { offerBadge, struckOutPrice, studentPrice } from '../lib/dealPricing.js'
import { formatMoney } from '../lib/format.js'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// "Fred M and 2 other friends liked this" (names only of friends; the
// database leaves out anyone blocked).
export function friendsLikedText(social) {
  const n = Number(social?.friend_like_count || 0)
  if (n === 0) return ''
  const name = social?.friend_name
  if (!name) return `${n} friend${n === 1 ? '' : 's'} liked this`
  if (n === 1) return `${name} liked this`
  return `${name} and ${n - 1} other friend${n - 1 === 1 ? '' : 's'} liked this`
}

export function isNewDeal(deal, now = Date.now()) {
  return deal.created_at ? now - new Date(deal.created_at).getTime() < WEEK_MS : false
}

// A small, concrete deal card (like the main food apps): photo, deal name,
// business, stars, price. The whole card opens the deal; ordering happens
// there. `overlay` is for buttons drawn on the photo (they can't sit inside
// the link). The buttons take the top-left corner, so the offer badge sits at
// the bottom-left: on small row cards a top-right badge was hidden under them.
export default function DealTile({ deal, ratingStats, social = null, overlay = null, className = '' }) {
  const price = studentPrice(deal)
  const before = struckOutPrice(deal)
  const badge = offerBadge(deal)
  const reviews = Number(ratingStats?.review_count || 0)
  const friends = friendsLikedText(social)
  const comments = Number(social?.comment_count || 0)

  return (
    <article className={`relative ${className}`}>
      <Link to={`/deal/${deal.id}`} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl bg-muted">
          {deal.image_url ? (
            // The deal name is written just below: the photo is decorative here.
            <img src={deal.image_url} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" />
          ) : (
            <div aria-hidden="true" className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent/30 via-muted to-card text-4xl">
              🍽️
            </div>
          )}
          {badge && (
            <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-primary px-2.5 py-1 font-display text-xs font-semibold text-primary-foreground shadow">
              {badge}
            </span>
          )}
        </div>

        <h3 className="mt-2 truncate font-display font-semibold">{deal.title}</h3>
        <p className="truncate text-sm text-muted-foreground">{deal.business_name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-sm">
          {reviews > 0 ? (
            <span className="flex items-center gap-1">
              <Star size={14} aria-hidden="true" className="fill-amber-400 text-amber-400" />
              <span className="font-medium">{ratingStats.average_rating}</span>
              <span className="text-muted-foreground">({reviews})</span>
            </span>
          ) : isNewDeal(deal) ? (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">New</span>
          ) : null}
          {price != null ? (
            <span className="ml-auto flex items-baseline gap-1.5">
              {before != null && <span className="text-xs text-muted-foreground line-through">{formatMoney(before)}</span>}
              <span className="font-semibold text-primary">{formatMoney(price)}</span>
            </span>
          ) : (
            <span className="ml-auto text-xs text-muted-foreground">Price not set</span>
          )}
        </p>
        {(friends || comments > 0) && (
          <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
            {friends && (
              <span className="flex min-w-0 items-center gap-1">
                <Heart size={12} aria-hidden="true" className="shrink-0 fill-red-600 text-red-600" />
                <span className="truncate">{friends}</span>
              </span>
            )}
            {comments > 0 && (
              <span className="ml-auto flex shrink-0 items-center gap-1">
                <MessageCircle size={12} aria-hidden="true" />
                {comments}
                <span className="sr-only"> comment{comments === 1 ? '' : 's'}</span>
              </span>
            )}
          </p>
        )}
      </Link>
      {overlay}
    </article>
  )
}
