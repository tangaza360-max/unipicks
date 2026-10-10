import { useCallback, useEffect, useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { MessageCircle, Store } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { withNext } from '../lib/safeNext.js'
import StudentAvatar from './StudentAvatar.jsx'

const MAX = 500

function ago(iso) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} h`
  const days = Math.floor(hours / 24)
  return days < 30 ? `${days} d` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

// The database says it in plain words (limits, blocks); anything else is generic.
function plain(error) {
  return /Slow down|reply to|can only reply/.test(error?.message || '')
    ? error.message
    : "Your comment wasn't posted. Please try again."
}

// Questions and answers under a deal, Instagram-style: comments, one level of
// replies, the business answers with its name. Rules live in the database
// (20261010090000): who may write, who sees names, limits.
export default function DealComments({ dealId }) {
  const [signedIn, setSignedIn] = useState(null)
  const [comments, setComments] = useState([])
  const [count, setCount] = useState(0)
  const [replyTo, setReplyTo] = useState(null) // top-level comment being answered
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data: session } = await supabase.auth.getSession()
    const loggedIn = Boolean(session.session)
    setSignedIn(loggedIn)
    if (!loggedIn) {
      const { data } = await supabase.rpc('get_deal_comment_count', { p_deal_id: dealId })
      setCount(Number(data || 0))
      return
    }
    const { data, error: loadError } = await supabase.rpc('get_deal_comments', { p_deal_id: dealId, p_limit: 200 })
    if (loadError) {
      console.warn('Could not load comments:', loadError.message)
      return
    }
    setComments(data || [])
    setCount((data || []).length)
  }, [dealId])

  useEffect(() => {
    load()
  }, [load])

  async function post(body, parentId = null) {
    setError('')
    const { data: { user } } = await supabase.auth.getUser()
    const { error: postError } = await supabase.from('deal_comments').insert({
      deal_id: dealId,
      author_id: user?.id,
      body,
      parent_id: parentId,
    })
    if (postError) {
      setError(plain(postError))
      return false
    }
    setReplyTo(null)
    await load()
    return true
  }

  async function remove(comment) {
    if (!window.confirm('Delete your comment?')) return
    const { error: deleteError } = await supabase.from('deal_comments').delete().eq('id', comment.id)
    if (deleteError) setError("Your comment wasn't deleted. Please try again.")
    else await load()
  }

  if (signedIn === null) return null

  const top = comments.filter((c) => !c.parent_id)
  const repliesOf = (id) => comments.filter((c) => c.parent_id === id)

  return (
    <section aria-labelledby="comments-title" className="space-y-3 border-t border-border pt-4">
      <h2 id="comments-title" className="font-semibold">
        Comments{count > 0 ? ` (${count})` : ''}
      </h2>

      {!signedIn ? (
        <p className="text-sm text-muted-foreground">
          {count > 0 ? `${count} comment${count === 1 ? '' : 's'}. ` : ''}
          <Link to={withNext('/login', `/deal/${dealId}`)} className="font-medium text-accent underline underline-offset-2">
            Log in
          </Link>{' '}
          to read and ask a question.
        </p>
      ) : (
        <>
          {top.length === 0 && <p className="text-sm text-muted-foreground">No comments yet. Ask the business a question.</p>}
          <ul className="space-y-4">
            {top.map((c) => (
              <li key={c.id} className="space-y-3">
                <Comment comment={c} onReply={() => setReplyTo(c.id)} onDelete={() => remove(c)} />
                {(repliesOf(c.id).length > 0 || replyTo === c.id) && (
                  <ul className="ml-11 space-y-3 border-l border-border pl-3">
                    {repliesOf(c.id).map((r) => (
                      <li key={r.id}>
                        <Comment comment={r} onDelete={() => remove(r)} />
                      </li>
                    ))}
                    {replyTo === c.id && (
                      <li>
                        <Composer
                          label={`Your reply to ${c.is_mine ? 'your comment' : c.author_name || 'a student'}`}
                          placeholder="Write a reply…"
                          autoFocus
                          onSend={(body) => post(body, c.id)}
                          onCancel={() => setReplyTo(null)}
                        />
                      </li>
                    )}
                  </ul>
                )}
              </li>
            ))}
          </ul>
          <Composer label="Add a comment" placeholder="Ask about this deal…" onSend={(body) => post(body)} />
        </>
      )}
      {error && <p role="alert" className="status-bad rounded-md px-2 py-1 text-sm">{error}</p>}
    </section>
  )
}

function Comment({ comment: c, onReply, onDelete }) {
  const name = c.is_mine ? 'You' : c.author_name || 'A student'
  return (
    <div className="flex gap-2">
      {c.is_business ? (
        <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
          <Store size={16} />
        </span>
      ) : (
        <StudentAvatar userId={c.author_id} name={c.author_name || 'Student'} size="sm" alt="" className="!h-9 !w-9" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{name}</span>
          {c.is_business && <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Business</span>}
          <span className="ml-1.5 text-xs text-muted-foreground">{ago(c.created_at)}</span>
        </p>
        <p className="whitespace-pre-wrap break-words text-sm">{c.body}</p>
        <div className="flex gap-3">
          {onReply && (
            <button type="button" onClick={onReply} aria-label={`Reply to ${name === 'You' ? 'your comment' : name}`} className="min-h-9 text-xs font-medium text-muted-foreground hover:text-foreground">
              Reply
            </button>
          )}
          {c.is_mine && (
            <button type="button" onClick={onDelete} aria-label="Delete your comment" className="min-h-9 text-xs font-medium text-muted-foreground hover:text-foreground">
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Composer({ label, placeholder, onSend, onCancel, autoFocus = false }) {
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const id = useId()
  const trimmed = body.trim()

  async function submit(event) {
    event.preventDefault()
    if (!trimmed || sending) return
    setSending(true)
    const ok = await onSend(trimmed)
    setSending(false)
    if (ok) setBody('')
  }

  return (
    <form onSubmit={submit} className="space-y-1.5">
      <label className="sr-only" htmlFor={id}>{label}</label>
      <div className="flex items-end gap-2">
        <textarea
          id={id}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={1}
          maxLength={MAX}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className="field-input min-h-11 flex-1 resize-y py-2 text-sm"
        />
        <button type="submit" disabled={!trimmed || sending} className="flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
          <MessageCircle size={16} aria-hidden="true" />
          {sending ? 'Posting…' : 'Post'}
        </button>
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{body.length > MAX - 50 ? `${body.length}/${MAX}` : ''}</span>
        {onCancel && (
          <button type="button" onClick={onCancel} className="min-h-9 font-medium hover:text-foreground">Cancel</button>
        )}
      </div>
    </form>
  )
}
