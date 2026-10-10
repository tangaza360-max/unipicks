import { useEffect } from 'react'
import { Bookmark, Heart } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useDealSocial } from '../lib/useDealSocial.js'
import { friendsLikedText } from './DealTile.jsx'

// On the deal page: ❤️ Like (with the count), 🔖 Save and "Fred M and 2 other
// friends liked this" — the same data and rules as the home feed cards.
// Signed-in people only (visitors see no likes).
export default function DealSocialBar({ deal }) {
  const { social, setSocial, busy, notice, toggle } = useDealSocial()

  useEffect(() => {
    let cancelled = false
    supabase.rpc('get_deals_social', { p_deal_ids: [deal.id] }).then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        console.warn('Could not load likes:', error.message)
        return
      }
      if (data?.[0]) setSocial({ [deal.id]: data[0] })
    })
    return () => {
      cancelled = true
    }
  }, [deal.id, setSocial])

  const s = social[deal.id]
  if (!s) return null
  const likes = Number(s.like_count || 0)
  const friends = friendsLikedText(s)
  const pill =
    'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium transition hover:bg-muted active:scale-95 disabled:opacity-60'

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => toggle(deal, 'like')}
          disabled={busy.has(deal.id)}
          aria-pressed={Boolean(s.liked_by_me)}
          className={pill}
        >
          <Heart size={18} aria-hidden="true" className={s.liked_by_me ? 'fill-red-600 text-red-600' : ''} />
          Like
          {likes > 0 && (
            <span className="text-muted-foreground">
              {likes}
              <span className="sr-only"> {likes === 1 ? 'like' : 'likes'}</span>
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => toggle(deal, 'save')}
          disabled={busy.has(deal.id)}
          aria-pressed={Boolean(s.saved_by_me)}
          className={pill}
        >
          <Bookmark size={18} aria-hidden="true" className={s.saved_by_me ? 'fill-current' : ''} />
          Save
        </button>
      </div>
      {friends && (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <Heart size={14} aria-hidden="true" className="shrink-0 fill-red-600 text-red-600" />
          {friends}
        </p>
      )}
      <p role="status" aria-live="polite" className={notice ? 'text-sm text-muted-foreground' : 'sr-only'}>
        {notice}
      </p>
    </div>
  )
}
