import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { reviewPhotoUrls } from '../lib/reviewPhotos.js'
import StarRating from './StarRating.jsx'
import StudentAvatar from './StudentAvatar.jsx'
import ReportDialog from './ReportDialog.jsx'
import { Flag } from 'lucide-react'

function ago(iso) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days < 1) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// What students who picked up this deal said, newest first, with their food
// photos. Names and photos follow the database rules (get_deal_reviews).
export default function DealReviews({ dealId }) {
  const [reviews, setReviews] = useState(null)
  const [photos, setPhotos] = useState({})
  const [signedIn, setSignedIn] = useState(false)
  const [reporting, setReporting] = useState(null) // the review being reported

  useEffect(() => {
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => !cancelled && setSignedIn(Boolean(data.session)))
    async function load() {
      const { data, error } = await supabase.rpc('get_deal_reviews', { p_deal_id: dealId, p_limit: 20 })
      if (cancelled) return
      if (error) {
        console.warn('Could not load reviews:', error.message)
        setReviews([])
        return
      }
      setReviews(data || [])
      const urls = await reviewPhotoUrls((data || []).map((r) => r.photo_path))
      if (!cancelled) setPhotos(urls)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [dealId])

  if (!reviews || reviews.length === 0) return null

  return (
    <section aria-labelledby="reviews-title" className="space-y-3 border-t border-border pt-4">
      <h2 id="reviews-title" className="font-semibold">What students say ({reviews.length})</h2>
      <ul className="space-y-4">
        {reviews.map((r) => {
          const name = r.is_mine ? 'You' : r.reviewer_name || 'A student'
          return (
            <li key={r.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <StudentAvatar userId={r.reviewer_id} name={r.reviewer_name || 'Student'} size="sm" alt="" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    <StarRating value={r.rating} readonly iconSize={14} />
                    <span>{ago(r.created_at)}</span>
                  </p>
                </div>
              </div>
              {r.review && <p className="whitespace-pre-wrap break-words text-sm">{r.review}</p>}
              {photos[r.photo_path] && (
                <img
                  src={photos[r.photo_path]}
                  alt={`Food photo from ${name === 'You' ? 'your' : `${name}'s`} review`}
                  loading="lazy"
                  className="max-h-80 w-full rounded-xl object-cover"
                />
              )}
              {signedIn && !r.is_mine && (
                <button
                  type="button"
                  onClick={() => setReporting(r)}
                  aria-label={`Report review by ${name}`}
                  className="inline-flex min-h-11 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <Flag size={14} aria-hidden="true" /> Report
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {reporting && (
        <ReportDialog
          context="review"
          ratingId={reporting.id}
          reportedId={reporting.reviewer_id}
          reportedName={reporting.reviewer_name}
          onClose={() => setReporting(null)}
        />
      )}
    </section>
  )
}
