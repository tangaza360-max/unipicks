import { useEffect, useRef, useState } from 'react'
import { Camera, X } from 'lucide-react'
import StarRating from './StarRating.jsx'
import { reviewPhotoProblem, submitReview } from '../lib/reviewPhotos.js'

// After pickup: stars, an optional comment and an optional photo of the food.
// Other students see the review on the deal page.
export default function RatingPrompt({ redemption, onSaved }) {
  const [rating, setRating] = useState(0)
  const [review, setReview] = useState('')
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const title = redemption.deals?.title || 'this deal'

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview])

  function pick(event) {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (!chosen) return
    const problem = reviewPhotoProblem(chosen)
    if (problem) {
      setError(problem)
      return
    }
    setError('')
    setFile(chosen)
    setPreview(URL.createObjectURL(chosen))
  }

  async function submitRating(event) {
    event.preventDefault()
    if (!rating || saving) return
    setSaving(true)
    setError('')
    try {
      await submitReview({ redemption, rating, review, file })
      setMessage('Thanks! Your review helps other students.')
      // Let them read the thank-you before the list moves on.
      setTimeout(() => onSaved?.(), 2500)
    } catch (submitError) {
      setError(submitError.message)
    } finally {
      setSaving(false)
    }
  }

  if (message) {
    return <p role="status" className="mt-3 border-t border-border pt-3 text-sm text-muted-foreground">{message}</p>
  }

  return (
    <form onSubmit={submitRating} className="mt-3 space-y-2 border-t border-border pt-3">
      <p className="text-sm font-medium text-foreground">How was it?</p>
      <StarRating value={rating} onChange={setRating} label={`Your rating for ${title}`} />
      {rating > 0 && (
        <>
          <label htmlFor={`review-${redemption.id}`} className="sr-only">Your review of {title} (optional)</label>
          <textarea
            id={`review-${redemption.id}`}
            value={review}
            onChange={(event) => setReview(event.target.value)}
            rows={2}
            maxLength={500}
            placeholder="Tell other students about it (optional)"
            className="field-input py-2 text-sm"
          />
          {preview ? (
            <div className="relative w-fit">
              <img src={preview} alt="Your food photo" className="h-28 w-28 rounded-lg object-cover" />
              <button
                type="button"
                onClick={() => {
                  setFile(null)
                  setPreview('')
                }}
                aria-label="Remove photo"
                className="absolute -right-2 -top-2 flex h-8 w-8 items-center justify-center rounded-full bg-foreground text-background shadow"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-dashed border-border px-3 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <Camera size={18} aria-hidden="true" /> Add a photo of your food
            </button>
          )}
          <input ref={inputRef} type="file" accept="image/*" onChange={pick} aria-label="Choose a food photo" className="hidden" />
        </>
      )}
      <button type="submit" disabled={!rating || saving} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
        {saving ? 'Sending…' : 'Post review'}
      </button>
      {error && <p role="alert" className="text-sm status-bad rounded-md px-2 py-1">{error}</p>}
    </form>
  )
}
