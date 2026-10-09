import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StarRating from '../components/StarRating.jsx'
import { REVIEW_BUCKET, reviewPhotoUrls } from '../lib/reviewPhotos.js'

export default function AdminReviews() {
  const [reviews, setReviews] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [photos, setPhotos] = useState({}) // photo path → private link

  async function loadReviews() {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('ratings')
      .select('*, deals(title, business_name)')
      .order('created_at', { ascending: false })
    if (fetchError) setError(fetchError.message)
    else setReviews(data || [])
    setLoading(false)
    setPhotos(await reviewPhotoUrls((data || []).map((r) => r.photo_path)))
  }

  useEffect(() => {
    loadReviews()
  }, [])

  async function deleteReview(review) {
    if (!window.confirm('Delete this review? This cannot be undone.')) return
    const { error: deleteError } = await supabase.from('ratings').delete().eq('id', review.id)
    if (deleteError) {
      setError(deleteError.message)
      return
    }
    // The food photo goes too (admins may delete any review photo).
    if (review.photo_path) {
      const { error: fileError } = await supabase.storage.from(REVIEW_BUCKET).remove([review.photo_path])
      if (fileError) console.error('Review photo not removed:', fileError.message)
    }
    setReviews((current) => current.filter((item) => item.id !== review.id))
  }

  if (loading) return <p className="text-muted-foreground text-sm">Loading reviews...</p>
  if (error && reviews.length === 0) return <p className="text-destructive text-sm">Could not load reviews: {error}</p>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">Reviews</h2>
        <p className="text-muted-foreground text-sm mt-1">Moderate student ratings and feedback.</p>
      </div>
      <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm">
        {reviews.length === 0 ? <p className="p-8 text-center text-muted-foreground text-sm">No reviews yet.</p> : (
          <div className="divide-y divide-border">
            {reviews.map((review) => (
              <div key={review.id} className="p-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-medium text-foreground">{review.deals?.title || 'Deleted deal'}</p>
                  <p className="text-muted-foreground text-xs">{review.deals?.business_name || 'Unknown business'} · {new Date(review.created_at).toLocaleString()}</p>
                  <StarRating value={review.rating} readonly iconSize={16} />
                  {review.review && <p className="text-sm text-foreground mt-2">{review.review}</p>}
                  {photos[review.photo_path] && (
                    <img src={photos[review.photo_path]} alt={`Food photo in the review of ${review.deals?.title || 'a deal'}`} className="mt-2 h-32 w-32 rounded-lg object-cover" />
                  )}
                </div>
                <button type="button" onClick={() => deleteReview(review)} className="self-start rounded-lg border border-destructive/40 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
    </div>
  )
}
