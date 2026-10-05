import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Eye, Flag, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { STORY_BUCKET } from '../lib/studentStories.js'
import { formatTime } from '../lib/format.js'
import Button from './Button.jsx'
import ReportDialog from './ReportDialog.jsx'

const STORY_MS = 5000
const TAP_MS = 250

function timeAgo(iso) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return minutes === 1 ? '1 minute ago' : `${minutes} minutes ago`
  const hours = Math.floor(minutes / 60)
  return hours === 1 ? '1 hour ago' : `${hours} hours ago`
}

// Full-screen viewer for student stories (Instagram-style): progress bars,
// tap right/left (or arrow keys) for next/previous, press and hold to pause,
// Escape to close. Plays one person's stories, then the next person's.
//   owners:     rows from get_story_tray() ({ student_id, display_name, is_me })
//   startIndex: which owner to start with
// Friends' views are recorded (for "Seen by"); friends can report a story;
// owners see who viewed and can delete.
export default function StudentStoryViewer({ owners, startIndex = 0, onClose }) {
  const [ownerIndex, setOwnerIndex] = useState(startIndex)
  const [stories, setStories] = useState([])
  const [storyIndex, setStoryIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [imageReady, setImageReady] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [held, setHeld] = useState(false)
  const [sheet, setSheet] = useState(null) // 'viewers' | 'delete' | 'report'
  const [viewers, setViewers] = useState(null)
  const [actionError, setActionError] = useState('')
  const [deleting, setDeleting] = useState(false)
  const pressRef = useRef(null)
  const closeRef = useRef(null)

  const owner = owners[ownerIndex]
  const story = stories[storyIndex]
  const paused = held || sheet !== null || !imageReady
  const ownerName = owner?.is_me ? 'Your story' : owner?.display_name || 'Student'

  useEffect(() => {
    closeRef.current?.focus()
  }, [])

  // Load one person's live stories with short-lived private links.
  useEffect(() => {
    if (!owner) return
    let cancelled = false

    async function load() {
      setLoading(true)
      setLoadError('')
      setStories([])
      setImageReady(false)

      const { data, error } = await supabase
        .from('student_stories')
        .select('id, student_id, media_url, caption, created_at')
        .eq('student_id', owner.student_id)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: true })

      if (cancelled) return
      if (error || !data?.length) {
        if (error) console.error('Failed to load stories:', error.message)
        setLoadError(error ? "We couldn't load this story. Please try again." : 'This story has ended.')
        setLoading(false)
        return
      }

      const { data: links, error: linkError } = await supabase.storage
        .from(STORY_BUCKET)
        .createSignedUrls(data.map((row) => row.media_url), 3600)
      if (cancelled) return
      if (linkError) console.error('Failed to open story photos:', linkError.message)

      const urlByPath = Object.fromEntries((links || []).map((link) => [link.path, link.signedUrl]))
      const rows = data.map((row) => ({ ...row, url: urlByPath[row.media_url] || null }))

      // Friends start at the first story they have not seen.
      let first = 0
      if (!owner.is_me) {
        const { data: seen } = await supabase
          .from('student_story_views')
          .select('story_id')
          .in('story_id', rows.map((row) => row.id))
        if (cancelled) return
        const seenIds = new Set((seen || []).map((row) => row.story_id))
        const unseen = rows.findIndex((row) => !seenIds.has(row.id))
        first = unseen === -1 ? 0 : unseen
      }

      setStories(rows)
      setStoryIndex(first)
      setElapsed(0)
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [owner])

  const goNext = useCallback(() => {
    setActionError('')
    setImageReady(false)
    setElapsed(0)
    if (storyIndex < stories.length - 1) {
      setStoryIndex((index) => index + 1)
    } else if (ownerIndex < owners.length - 1) {
      setOwnerIndex((index) => index + 1)
    } else {
      onClose()
    }
  }, [storyIndex, stories.length, ownerIndex, owners.length, onClose])

  const goPrev = useCallback(() => {
    setActionError('')
    setElapsed(0)
    if (storyIndex > 0) {
      setImageReady(false)
      setStoryIndex((index) => index - 1)
    } else if (ownerIndex > 0) {
      setImageReady(false)
      setOwnerIndex((index) => index - 1)
    }
  }, [storyIndex, ownerIndex])

  // Timer for the progress bar; stops while paused.
  useEffect(() => {
    if (paused || !story) return
    const startedAt = Date.now() - elapsed
    const timer = setInterval(() => {
      const next = Date.now() - startedAt
      if (next >= STORY_MS) {
        clearInterval(timer)
        goNext()
      } else {
        setElapsed(next)
      }
    }, 50)
    return () => clearInterval(timer)
    // elapsed is read once, when the timer (re)starts
  }, [paused, story, goNext])

  // A friend's view is recorded once (for the owner's "Seen by").
  useEffect(() => {
    if (!story || owner?.is_me || !imageReady) return
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      supabase
        .from('student_story_views')
        .upsert(
          { story_id: story.id, viewer_id: user.id },
          { onConflict: 'story_id,viewer_id', ignoreDuplicates: true }
        )
        .then(({ error }) => {
          if (error) console.error('Failed to record story view:', error.message)
        })
    })
  }, [story, owner, imageReady])

  useEffect(() => {
    function onKeyDown(event) {
      if (sheet) return
      if (event.key === 'Escape') onClose()
      else if (event.key === 'ArrowRight') goNext()
      else if (event.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sheet, goNext, goPrev, onClose])

  // Press and hold pauses; a short tap moves (left third back, rest forward).
  const handlePointerDown = (event) => {
    pressRef.current = { at: Date.now(), x: event.clientX }
    setHeld(true)
  }
  const handlePointerUp = (event) => {
    const press = pressRef.current
    pressRef.current = null
    setHeld(false)
    if (!press || Date.now() - press.at > TAP_MS) return
    const { left, width } = event.currentTarget.getBoundingClientRect()
    if (event.clientX - left < width / 3) goPrev()
    else goNext()
  }

  async function openViewers() {
    setSheet('viewers')
    setViewers(null)
    const { data: views, error } = await supabase
      .from('student_story_views')
      .select('viewer_id, viewed_at')
      .eq('story_id', story.id)
      .order('viewed_at', { ascending: false })
    if (error) {
      setViewers([])
      setActionError("We couldn't load who saw this. Please try again.")
      return
    }
    const ids = (views || []).map((view) => view.viewer_id)
    let names = {}
    if (ids.length) {
      const { data: profiles } = await supabase.rpc('get_student_message_profiles', {
        target_student_ids: ids,
      })
      names = Object.fromEntries((profiles || []).map((p) => [p.user_id, p.display_name]))
    }
    setViewers((views || []).map((view) => ({ ...view, name: names[view.viewer_id] || 'Student' })))
  }

  async function deleteStory() {
    setDeleting(true)
    setActionError('')
    const { error } = await supabase.from('student_stories').delete().eq('id', story.id)
    if (error) {
      setDeleting(false)
      setActionError("We couldn't delete this story. Please try again.")
      return
    }
    await supabase.storage.from(STORY_BUCKET).remove([story.media_url])
    setDeleting(false)
    setSheet(null)
    const remaining = stories.filter((row) => row.id !== story.id)
    if (!remaining.length) {
      onClose()
      return
    }
    setStories(remaining)
    setStoryIndex((index) => Math.min(index, remaining.length - 1))
    setImageReady(false)
    setElapsed(0)
  }

  const progressFor = (index) =>
    index < storyIndex ? 1 : index > storyIndex ? 0 : Math.min(elapsed / STORY_MS, 1)

  // Rendered on <body>: the page wrapper animates (transform), which would
  // otherwise keep this full-screen layer inside the page, under the top bar.
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Story: ${ownerName}`}
      className="fixed inset-0 z-[110] flex flex-col bg-black text-white"
    >
      <div
        className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/70 to-transparent px-3 pb-6"
        style={{ paddingTop: 'calc(var(--safe-area-top) + 8px)' }}
      >
        <div className="flex gap-1" aria-hidden="true">
          {stories.map((row, index) => (
            <div key={row.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/35">
              <div className="h-full bg-white" style={{ width: `${progressFor(index) * 100}%` }} />
            </div>
          ))}
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">
            {(owner?.display_name || 'S').charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{ownerName}</p>
            {story && (
              <p className="text-xs text-white/85">
                <time dateTime={story.created_at} title={formatTime(story.created_at)}>
                  {timeAgo(story.created_at)}
                </time>
              </p>
            )}
          </div>

          {story && !owner?.is_me && (
            <button
              type="button"
              onClick={() => setSheet('report')}
              aria-label="Report this story"
              className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
            >
              <Flag size={20} />
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close story"
            className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"
          >
            <X size={24} />
          </button>
        </div>
      </div>

      <div
        className="relative flex min-h-0 flex-1 select-none items-center justify-center"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => {
          pressRef.current = null
          setHeld(false)
        }}
        onContextMenu={(event) => event.preventDefault()}
        data-testid="story-stage"
      >
        {loading ? (
          <p className="text-sm text-white/85">Loading…</p>
        ) : loadError ? (
          <div className="px-6 text-center">
            <p className="text-sm">{loadError}</p>
            <Button className="mt-4" onClick={onClose}>Close</Button>
          </div>
        ) : story?.url ? (
          <img
            key={story.id}
            src={story.url}
            alt={story.caption || `Story photo from ${ownerName}`}
            onLoad={() => setImageReady(true)}
            onError={() => setImageReady(true)}
            draggable={false}
            className="h-full w-full object-contain"
          />
        ) : (
          <p className="text-sm">This photo is no longer available.</p>
        )}

        {/* Buttons for keyboard and screen-reader users; taps work anywhere. */}
        {!loading && !loadError && (
          <>
            <button
              type="button"
              onClick={goPrev}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              aria-label="Previous story"
              className="absolute left-1 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 md:flex"
            >
              <ChevronLeft size={24} />
            </button>
            <button
              type="button"
              onClick={goNext}
              onPointerDown={(event) => event.stopPropagation()}
              onPointerUp={(event) => event.stopPropagation()}
              aria-label="Next story"
              className="absolute right-1 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/30 md:flex"
            >
              <ChevronRight size={24} />
            </button>
          </>
        )}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/80 to-transparent px-4 pt-10"
        style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 16px)' }}
      >
        {story?.caption && <p className="mb-3 text-center text-base">{story.caption}</p>}
        {actionError && (
          <p role="alert" className="mb-3 text-center text-sm">{actionError}</p>
        )}
        {story && owner?.is_me && (
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={openViewers}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-white/10"
            >
              <Eye size={18} />
              Seen by
            </button>
            <button
              type="button"
              onClick={() => setSheet('delete')}
              className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold hover:bg-white/10"
            >
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        )}
      </div>

      {sheet === 'viewers' && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/60" onClick={() => setSheet(null)}>
          <div
            role="dialog"
            aria-label="Seen by"
            className="max-h-[60vh] w-full max-w-md overflow-y-auto rounded-t-xl bg-card p-4 text-foreground"
            style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 16px)' }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold">
                {viewers ? `Seen by ${viewers.length}` : 'Seen by'}
              </h2>
              <button
                type="button"
                onClick={() => setSheet(null)}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-full hover:bg-muted"
              >
                <X size={20} />
              </button>
            </div>
            {viewers === null ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : viewers.length === 0 ? (
              <p className="text-sm text-muted-foreground">No one has seen this yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {viewers.map((viewer) => (
                  <li key={viewer.viewer_id} className="flex items-center justify-between py-3 text-sm">
                    <span className="font-medium">{viewer.name}</span>
                    <span className="text-muted-foreground">{timeAgo(viewer.viewed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {sheet === 'delete' && (
        <div className="absolute inset-0 z-30 flex items-end justify-center bg-black/60 sm:items-center">
          <div
            role="alertdialog"
            aria-label="Delete this story?"
            className="w-full max-w-md rounded-t-xl bg-card p-5 text-foreground sm:rounded-xl"
            style={{ paddingBottom: 'calc(var(--safe-area-bottom) + 20px)' }}
          >
            <h2 className="font-display text-lg font-semibold">Delete this story?</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your friends won't see it any more.</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button variant="secondary" onClick={() => setSheet(null)} disabled={deleting}>
                Cancel
              </Button>
              <button
                type="button"
                onClick={deleteStory}
                disabled={deleting}
                className="min-h-11 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {sheet === 'report' && story && (
        <ReportDialog
          reportedId={owner.student_id}
          reportedName={owner.display_name}
          context="story"
          storyId={story.id}
          onClose={() => setSheet(null)}
        />
      )}
    </div>,
    document.body
  )
}
