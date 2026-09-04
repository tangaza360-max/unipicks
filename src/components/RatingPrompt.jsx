import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import StarRating from './StarRating.jsx'

export default function RatingPrompt({ redemption, onSaved }) {
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  async function submitRating(event) {
    event.preventDefault()
    if (!rating || saving) return
    setSaving(true)
    setMessage('')

    const { data: userData } = await supabase.auth.getUser()
    const user = userData.user
    const { error } = await supabase.from('ratings').insert({
      deal_id: redemption.deal_id,
      merchant_id: redemption.deals?.merchant_id || null,
      student_id: user?.id,
      redemption_id: redemption.id,
      rating,
      review: review.trim() || null,
    })

    if (error) {
      setMessage(error.code === '23505' ? 'You already rated this deal.' : error.message)
    } else {
      setMessage('Thanks for your review!')
      onSaved?.()
    }
    setSaving(false)
  }

  return (
    <form onSubmit={submitRating} className="mt-3 border-t border-border pt-3 space-y-2">
      <p className="text-sm font-medium text-foreground">Rate this deal</p>
      <StarRating value={rating} onChange={setRating} />
      {rating > 0 && (
        <textarea
          value={review}
          onChange={(event) => setReview(event.target.value)}
          rows={2}
          placeholder="Share an optional review"
          className="field-input py-2 text-sm"
        />
      )}
      <button type="submit" disabled={!rating || saving} className="bg-primary text-primary-foreground rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50">
        {saving ? 'Saving...' : 'Submit rating'}
      </button>
      {message && <p className="text-muted-foreground text-xs">{message}</p>}
    </form>
  )
}
