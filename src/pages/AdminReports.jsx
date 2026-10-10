import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { STORY_BUCKET } from '../lib/studentStories.js'
import { AVATAR_BUCKET } from '../lib/studentAvatars.js'
import { REVIEW_BUCKET, reviewPhotoUrls } from '../lib/reviewPhotos.js'
import StarRating from '../components/StarRating.jsx'
import { formatDateTime } from '../lib/format.js'

// Admin → Reports (fix 8; social audit D5). Reports from students and
// businesses, oldest open first. Target: first response within 24 hours.

const STATUS_LABELS = {
  pending: 'New',
  reviewing: 'Reviewing',
  resolved: 'Resolved',
  dismissed: 'Dismissed',
}

const CONTEXT_LABELS = { chat: 'from a chat', profile: 'from a profile', business: 'about a business', story: 'about a story', avatar: 'about a profile photo', review: 'about a review', comment: 'about a comment' }

const FILTERS = [
  ['open', 'Open'],
  ['resolved', 'Resolved'],
  ['dismissed', 'Dismissed'],
  ['all', 'All'],
]

const SLA_MS = 24 * 60 * 60 * 1000

function age(iso) {
  const ms = Date.now() - new Date(iso).getTime()
  const hours = Math.floor(ms / 3_600_000)
  if (hours < 1) return 'less than 1 hour ago'
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.floor(hours / 24)} days ago`
}

export default function AdminReports() {
  const [reports, setReports] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('open')
  const [target, setTarget] = useState(null) // { report, status }
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [storyUrls, setStoryUrls] = useState({}) // media path → private link
  const [avatarUrls, setAvatarUrls] = useState({}) // photo path → private link
  const [reviewUrls, setReviewUrls] = useState({}) // review photo path → private link

  useEffect(() => {
    loadReports()
  }, [])

  async function loadReports() {
    setLoading(true)
    setError('')
    const { data, error: fetchError } = await supabase.rpc('get_admin_reports')
    if (fetchError) setError(fetchError.message)
    else setReports(data || [])

    // Reported story photos are private: open them with 1-hour links.
    const paths = (data || []).map((r) => r.story_media_path).filter(Boolean)
    if (paths.length) {
      const { data: links, error: linkError } = await supabase.storage
        .from(STORY_BUCKET)
        .createSignedUrls(paths, 3600)
      if (linkError) console.error('Failed to open reported story photos:', linkError.message)
      setStoryUrls(Object.fromEntries((links || []).map((link) => [link.path, link.signedUrl])))
    }

    // Reported review photos (the copy kept with the report).
    setReviewUrls(await reviewPhotoUrls((data || []).map((r) => r.review_photo_path)))

    // Reported profile photos are private too. A removed photo gets no link.
    const avatarPaths = [...new Set((data || []).map((r) => r.avatar_path).filter(Boolean))]
    if (avatarPaths.length) {
      const { data: links, error: linkError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .createSignedUrls(avatarPaths, 3600)
      if (linkError) console.error('Failed to open reported profile photos:', linkError.message)
      setAvatarUrls(Object.fromEntries((links || []).filter((link) => link.signedUrl).map((link) => [link.path, link.signedUrl])))
    }
    setLoading(false)
  }

  const visible = reports.filter((r) => {
    if (filter === 'open') return r.status === 'pending' || r.status === 'reviewing'
    if (filter === 'all') return true
    return r.status === filter
  })

  async function review(report, status, reviewNote = null) {
    setSubmitting(true)
    const { error: rpcError } = await supabase.rpc('review_report', {
      p_report_id: report.id,
      p_status: status,
      p_note: reviewNote,
    })
    setSubmitting(false)
    if (rpcError) {
      setError(rpcError.message)
      return false
    }
    await loadReports()
    return true
  }

  async function banReported(report) {
    if (!window.confirm(`Ban ${report.reported_name || 'this user'}? They will be locked out of messaging, ordering and selling.`)) return
    setSubmitting(true)
    const { error: banError } = await supabase.rpc('admin_ban_user', { target_user_id: report.reported_id })
    if (!banError) {
      await supabase.rpc('log_admin_action', {
        action: 'ban_user',
        target_type: report.reported_role === 'merchant' ? 'merchant' : 'student',
        target_id: report.reported_id,
        target_name: report.reported_name,
        details: { report_id: report.id },
      })
    }
    setSubmitting(false)
    if (banError) {
      setError(banError.message)
      return
    }
    await loadReports()
  }

  async function removeStory(report) {
    if (!window.confirm(`Remove this story from ${report.reported_name || 'this student'}? Their friends will no longer see it.`)) return
    setSubmitting(true)
    const { data: path, error: removeError } = await supabase.rpc('admin_remove_story', { p_report_id: report.id })
    if (!removeError && path) {
      const { error: fileError } = await supabase.storage.from(STORY_BUCKET).remove([path])
      if (fileError) console.error('Story photo not removed:', fileError.message)
    }
    setSubmitting(false)
    if (removeError) {
      setError(removeError.message)
      return
    }
    await loadReports()
  }

  async function removeAvatarPhoto(report) {
    if (!window.confirm(`Remove the profile photo of ${report.reported_name || 'this student'}? Their initials will show instead.`)) return
    setSubmitting(true)
    const { data: path, error: removeError } = await supabase.rpc('admin_remove_avatar', { p_report_id: report.id })
    if (!removeError && path) {
      const { error: fileError } = await supabase.storage.from(AVATAR_BUCKET).remove([path])
      if (fileError) console.error('Profile photo not removed:', fileError.message)
    }
    setSubmitting(false)
    if (removeError) {
      setError(removeError.message)
      return
    }
    await loadReports()
  }

  async function removeReview(report) {
    if (!window.confirm(`Remove the text and photo of this review by ${report.reported_name || 'this student'}? The stars stay.`)) return
    setSubmitting(true)
    const { data: path, error: removeError } = await supabase.rpc('admin_remove_review', { p_report_id: report.id })
    if (!removeError && path) {
      const { error: fileError } = await supabase.storage.from(REVIEW_BUCKET).remove([path])
      if (fileError) console.error('Review photo not removed:', fileError.message)
    }
    setSubmitting(false)
    if (removeError) {
      setError(removeError.message)
      return
    }
    await loadReports()
  }

  async function removeComment(report) {
    if (!window.confirm(`Delete this comment by ${report.reported_name || 'this person'}? Replies to it go too.`)) return
    setSubmitting(true)
    const { error: removeError } = await supabase.rpc('admin_remove_comment', { p_report_id: report.id })
    setSubmitting(false)
    if (removeError) {
      setError(removeError.message)
      return
    }
    await loadReports()
  }

  async function submitDecision() {
    if (!target) return
    const ok = await review(target.report, target.status, note)
    if (ok) {
      setTarget(null)
      setNote('')
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading reports…</p>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold">Reports</h2>
          <p className="text-xs text-muted-foreground">Respond to every new report within 24 hours.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {FILTERS.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`text-xs rounded-full px-3 py-1.5 border transition ${
                filter === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">No reports here.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((report) => {
            const open = report.status === 'pending' || report.status === 'reviewing'
            const overdue = open && Date.now() - new Date(report.created_at).getTime() > SLA_MS
            return (
              <div
                key={report.id}
                className={`rounded-2xl border bg-card p-4 space-y-3 ${overdue ? 'border-red-400/60' : 'border-border'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">
                      {report.category}: {report.reported_name || 'Unknown'}
                      <span className="text-muted-foreground font-normal"> ({report.reported_role || 'user'})</span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reported by {report.reporter_name || 'Unknown'} ({report.reporter_role || 'user'})
                      {report.context ? `, ${CONTEXT_LABELS[report.context] || report.context}` : ''} · {age(report.created_at)}
                    </p>
                    {overdue && (
                      <p className="text-xs font-medium text-red-400 mt-1">Over 24 hours without a decision</p>
                    )}
                    {report.reported_banned && (
                      <p className="text-xs text-muted-foreground mt-1">This account is banned.</p>
                    )}
                    {report.reported_deleted && (
                      <p className="text-xs text-muted-foreground mt-1">This account has been deleted.</p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                    {STATUS_LABELS[report.status] || report.status}
                  </span>
                </div>

                {report.description && (
                  <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <p className="text-xs text-muted-foreground">Details</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{report.description}</p>
                  </div>
                )}

                {report.story_media_path && (
                  <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    {storyUrls[report.story_media_path] ? (
                      <img
                        src={storyUrls[report.story_media_path]}
                        alt={report.story_caption || 'Reported story photo'}
                        className="h-40 w-24 flex-shrink-0 rounded-md bg-black object-cover"
                      />
                    ) : (
                      <div className="flex h-40 w-24 flex-shrink-0 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
                        No photo
                      </div>
                    )}
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="text-xs text-muted-foreground">Reported story</p>
                      {report.story_caption && <p className="break-words">“{report.story_caption}”</p>}
                      <p className="text-xs text-muted-foreground">Posted {formatDateTime(report.story_created_at)}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(report.story_expires_at) > new Date()
                          ? `Friends can see it until ${formatDateTime(report.story_expires_at)}`
                          : 'Ended (friends no longer see it)'}
                      </p>
                    </div>
                  </div>
                )}

                {report.context === 'comment' && (
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <p className="text-xs text-muted-foreground">Reported comment</p>
                    {report.comment_text && <p className="break-words">“{report.comment_text}”</p>}
                    {report.comment_removed && <p className="text-xs text-muted-foreground">The comment was removed.</p>}
                  </div>
                )}

                {report.context === 'review' && (
                  <div className="flex gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    {reviewUrls[report.review_photo_path] && (
                      <img
                        src={reviewUrls[report.review_photo_path]}
                        alt={`Food photo in the reported review by ${report.reported_name || 'this student'}`}
                        className="h-24 w-24 flex-shrink-0 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="text-xs text-muted-foreground">Reported review</p>
                      {report.review_rating != null && <StarRating value={report.review_rating} readonly iconSize={14} />}
                      {report.review_text && <p className="break-words">“{report.review_text}”</p>}
                      {report.review_removed && <p className="text-xs text-muted-foreground">Text and photo were removed.</p>}
                    </div>
                  </div>
                )}

                {report.avatar_path && (
                  <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
                    {avatarUrls[report.avatar_path] ? (
                      <img
                        src={avatarUrls[report.avatar_path]}
                        alt={`Reported profile photo of ${report.reported_name || 'this student'}`}
                        className="h-24 w-24 flex-shrink-0 rounded-full bg-muted object-cover"
                      />
                    ) : (
                      <div className="flex h-24 w-24 flex-shrink-0 items-center justify-center rounded-full bg-muted text-center text-xs text-muted-foreground">
                        No photo
                      </div>
                    )}
                    <div className="min-w-0 space-y-1 text-sm">
                      <p className="text-xs text-muted-foreground">Reported profile photo</p>
                      {!avatarUrls[report.avatar_path] && (
                        <p className="text-xs text-muted-foreground">This photo was removed.</p>
                      )}
                    </div>
                  </div>
                )}

                {report.story_removed && (
                  <p className="text-xs text-muted-foreground">The reported story was removed.</p>
                )}

                {report.admin_note && (
                  <p className="text-xs text-muted-foreground">Admin note: “{report.admin_note}”</p>
                )}

                {open && (
                  <div className="flex flex-wrap gap-2">
                    {report.status === 'pending' && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => review(report, 'reviewing')}
                        className="text-xs border border-border text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 transition disabled:opacity-50"
                      >
                        Start review
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => { setTarget({ report, status: 'resolved' }); setNote('') }}
                      className="text-xs border border-border text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 transition disabled:opacity-50"
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => { setTarget({ report, status: 'dismissed' }); setNote('') }}
                      className="text-xs border border-border text-muted-foreground hover:text-foreground rounded-lg px-3 py-2 transition disabled:opacity-50"
                    >
                      Dismiss
                    </button>
                    {report.story_media_path && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => removeStory(report)}
                        className="text-xs border border-[color:var(--status-bad-fg)] text-[color:var(--status-bad-fg)] hover:bg-[color:var(--status-bad-bg)] rounded-lg px-3 py-2 transition disabled:opacity-50"
                      >
                        Remove story
                      </button>
                    )}
                    {report.context === 'comment' && !report.comment_removed && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => removeComment(report)}
                        className="text-xs border border-[color:var(--status-bad-fg)] text-[color:var(--status-bad-fg)] hover:bg-[color:var(--status-bad-bg)] rounded-lg px-3 py-2 transition disabled:opacity-50"
                      >
                        Remove comment
                      </button>
                    )}
                    {report.context === 'review' && !report.review_removed && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => removeReview(report)}
                        className="text-xs border border-[color:var(--status-bad-fg)] text-[color:var(--status-bad-fg)] hover:bg-[color:var(--status-bad-bg)] rounded-lg px-3 py-2 transition disabled:opacity-50"
                      >
                        Remove review
                      </button>
                    )}
                    {report.avatar_path && avatarUrls[report.avatar_path] && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => removeAvatarPhoto(report)}
                        className="text-xs border border-[color:var(--status-bad-fg)] text-[color:var(--status-bad-fg)] hover:bg-[color:var(--status-bad-bg)] rounded-lg px-3 py-2 transition disabled:opacity-50"
                      >
                        Remove photo
                      </button>
                    )}
                    {!report.reported_banned && !report.reported_deleted && (
                      <button
                        type="button"
                        disabled={submitting}
                        onClick={() => banReported(report)}
                        className="text-xs border border-[color:var(--status-bad-fg)] text-[color:var(--status-bad-fg)] hover:bg-[color:var(--status-bad-bg)] rounded-lg px-3 py-2 transition disabled:opacity-50"
                      >
                        Ban reported account
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {target && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="report-decision-title" className="w-full max-w-md rounded-2xl bg-card border border-border p-5 shadow-2xl space-y-4">
            <div>
              <h3 id="report-decision-title" className="font-display text-lg font-semibold">
                {target.status === 'resolved' ? 'Resolve report' : 'Dismiss report'}
              </h3>
              <p className="text-muted-foreground text-sm mt-1">
                {target.report.category}: {target.report.reported_name || 'Unknown'}
              </p>
            </div>
            <div>
              <label htmlFor="report-note" className="field-label">Note (optional, for the admin team)</label>
              <textarea
                id="report-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="field-input min-h-[90px] resize-y"
                maxLength={500}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setTarget(null)}
                disabled={submitting}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={submitDecision}
                disabled={submitting}
                className="bg-primary text-primary-foreground font-semibold rounded-lg px-4 py-2.5 text-sm transition disabled:opacity-50"
              >
                {submitting ? 'Saving…' : target.status === 'resolved' ? 'Resolve' : 'Dismiss'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
