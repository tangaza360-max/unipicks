import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

// Report a student, a business, a student's story or a profile photo (fix 8). Reports go to the admin Reports
// queue; admins are alerted and aim to respond within 24 hours (decision D5).
const CATEGORIES = ['Harassment', 'Spam', 'Impersonation', 'Inappropriate behavior', 'Other']

export default function ReportDialog({ reportedId, reportedName, context, storyId = null, onClose }) {
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (!category) {
      setError('Please choose a reason.')
      return
    }
    if (category === 'Other' && !description.trim()) {
      setError('Please describe the problem when choosing Other.')
      return
    }

    setSubmitting(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: insertError } = await supabase.from('student_reports').insert({
      reporter_id: user?.id,
      reported_id: reportedId,
      category,
      description: description.trim() || null,
      context,
      ...(storyId ? { story_id: storyId } : {}),
    })
    setSubmitting(false)

    if (insertError) {
      setError(
        /suspended|profile photo|photo you can see/.test(insertError.message)
          ? insertError.message
          : 'Your report could not be sent. Please try again.',
      )
      return
    }
    setDone(true)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-title"
        className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl"
      >
        <h2 id="report-title" className="font-display text-lg font-semibold">
          {storyId
            ? `Report this story from ${reportedName || 'this student'}`
            : context === 'avatar'
              ? `Report the profile photo of ${reportedName || 'this student'}`
              : `Report ${reportedName || 'this account'}`}
        </h2>

        {done ? (
          <div className="mt-4 space-y-4">
            <p role="status" className="text-sm text-muted-foreground">
              Thank you. Our team will review your report within 24 hours. The person you reported
              won't know it was you.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="bg-primary text-primary-foreground font-semibold rounded-lg px-4 py-2.5 text-sm"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor="report-category" className="field-label">Reason</label>
              <select
                id="report-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="field-input"
                disabled={submitting}
              >
                <option value="">Choose a reason…</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="report-details" className="field-label">
                Details {category === 'Other' ? '(required)' : '(optional)'}
              </label>
              <textarea
                id="report-details"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="field-input min-h-[90px] resize-y"
                placeholder="What happened?"
                maxLength={500}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground mt-1">{description.length}/500 characters</p>
            </div>

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="text-sm font-semibold rounded-lg px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white transition disabled:opacity-50"
              >
                {submitting ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
