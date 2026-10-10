import { Bookmark, Heart } from 'lucide-react'
import { ShareButton } from './ShareDeal.jsx'

// ❤️ like (with the count), 🔖 save and share, drawn on a deal photo. They sit next
// to the card's link, not inside it (a button can't be inside a link).
export default function DealActions({ deal, social, onLike, onSave, busy = false }) {
  const likes = Number(social?.like_count || 0)
  const liked = Boolean(social?.liked_by_me)
  const saved = Boolean(social?.saved_by_me)
  const pill =
    'flex h-11 items-center justify-center gap-1 rounded-full bg-white/95 text-sm font-semibold text-neutral-900 shadow transition active:scale-90 disabled:opacity-60'

  return (
    <div className="absolute left-2 top-2 flex gap-1.5">
      <button
        type="button"
        onClick={() => onLike(deal)}
        disabled={busy}
        aria-pressed={liked}
        // The visible count is part of the name (WCAG 2.5.3).
        aria-label={`Like ${deal.title}, ${likes} ${likes === 1 ? 'like' : 'likes'}`}
        className={`${pill} min-w-11 px-3`}
      >
        <Heart size={18} aria-hidden="true" className={liked ? 'fill-red-600 text-red-600' : 'text-neutral-900'} />
        {likes > 0 && <span aria-hidden="true">{likes}</span>}
      </button>
      <button
        type="button"
        onClick={() => onSave(deal)}
        disabled={busy}
        aria-pressed={saved}
        aria-label={`Save ${deal.title}`}
        className={`${pill} w-11`}
      >
        <Bookmark size={18} aria-hidden="true" className={saved ? 'fill-neutral-900 text-neutral-900' : 'text-neutral-900'} />
      </button>
      <ShareButton deal={deal} className={`${pill} w-11`} />
    </div>
  )
}
