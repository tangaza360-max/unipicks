import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { liveChannel } from '../lib/realtime.js'
import { linkPhoneNumbers } from '../lib/linkPhoneNumbers.jsx'
import { Flag } from 'lucide-react'
import ReportDialog from './ReportDialog.jsx'
import { formatDate, formatTime } from '../lib/format.js'
import BackLink from './BackLink.jsx'


function dayKey(iso) {
  return new Date(iso).toDateString()
}

function formatDateSeparator(iso) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const same = (a, b) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return formatDate(d)
}

export default function ChatThread({
  currentUserId,
  otherUserId,
  otherUserName,
  groupOrderId,
  groupOrderLabel,
  onBack,
}) {
  const [messages, setMessages] = useState([])
  const [senderProfiles, setSenderProfiles] = useState({})
  const [otherUserRole, setOtherUserRole] = useState(null)
  const [input, setInput] = useState('')
  const [sendError, setSendError] = useState('')
  const [showReport, setShowReport] = useState(false)
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)
  const hasScrolledOnce = useRef(false)
  const navigate = useNavigate()

  const isGroup = Boolean(groupOrderId)

  useEffect(() => {
    let cancelled = false

    async function loadSenderProfiles(senderIds) {
      const ids = [...new Set(senderIds.filter(Boolean))]
      if (!ids.length) return

      const [merchantResult, studentResult] = await Promise.all([
        supabase
          .from('merchant_profiles')
          .select('id, business_name')
          .in('id', ids),
        supabase.rpc('get_student_message_profiles', {
          target_student_ids: ids,
        }),
      ])

      const profiles = {}
      for (const merchant of merchantResult.data || []) {
        profiles[merchant.id] = {
          displayName: merchant.business_name || 'Business',
          role: 'merchant',
        }
      }
      for (const student of studentResult.data || []) {
        if (!profiles[student.user_id]) {
          profiles[student.user_id] = {
            displayName: student.display_name || 'Student',
            role: 'student',
          }
        }
      }
      // Ids with no profile are either students without a social profile or
      // deleted accounts (profile rows are removed by the tombstone).
      const unresolved = ids.filter((id) => !profiles[id])
      if (unresolved.length) {
        const { data: deletedRows } = await supabase.rpc('get_deleted_user_ids', {
          p_user_ids: unresolved,
        })
        for (const row of deletedRows || []) {
          profiles[row.user_id] = { displayName: 'Deleted user', role: 'deleted' }
        }
      }
      for (const id of ids) {
        if (!profiles[id]) profiles[id] = { displayName: 'Student', role: 'student' }
      }

      if (cancelled) return
      setSenderProfiles((current) => ({ ...current, ...profiles }))
      if (!isGroup && otherUserId) {
        setOtherUserRole(profiles[otherUserId]?.role || 'student')
      }
    }

    async function loadMessages() {
      let query = supabase
        .from('chat_messages')
        .select('*')
        .order('created_at', { ascending: true })

      if (isGroup) {
        query = query.eq('group_order_id', groupOrderId)
      } else {
        query = query.or(
          `and(sender_id.eq.${currentUserId},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${currentUserId})`
        )
      }

      const { data, error } = await query
      if (cancelled) return
      if (!error) {
        const loadedMessages = data || []
        setMessages(loadedMessages)
        const senderIds = loadedMessages
          .filter((message) => message.sender_id !== currentUserId)
          .map((message) => message.sender_id)
        if (!isGroup && otherUserId) senderIds.push(otherUserId)
        await loadSenderProfiles(senderIds)
      }
      setLoading(false)
    }

    loadMessages()

    const channel = liveChannel(
        `chat-${isGroup ? groupOrderId : [currentUserId, otherUserId].sort().join('-')}`
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages' },
        (payload) => {
          const m = payload.new
          const belongs = isGroup
            ? m.group_order_id === groupOrderId
            : (m.sender_id === currentUserId && m.receiver_id === otherUserId) ||
              (m.sender_id === otherUserId && m.receiver_id === currentUserId)
          if (belongs) {
            setMessages((prev) => [...prev, m])
            if (m.sender_id !== currentUserId) loadSenderProfiles([m.sender_id])
          }
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      channel.unsubscribe()
    }
  }, [currentUserId, otherUserId, groupOrderId, isGroup])

  useEffect(() => {
    if (!bottomRef.current) return

    // On the very first render (loading the thread), jump instantly
    // to the bottom so the user doesn't watch a slow scroll animation.
    // After that, animate smoothly for new incoming messages.
    const behavior = hasScrolledOnce.current ? 'smooth' : 'auto'
    bottomRef.current.scrollIntoView({ behavior })

    if (!loading) hasScrolledOnce.current = true
  }, [messages, loading])

  // Mark incoming messages as read when the thread is opened
  // (or when new messages arrive while viewing it).
  useEffect(() => {
    const hasUnreadIncoming = messages.some(
      (m) => m.sender_id !== currentUserId && !m.is_read
    )
    if (!hasUnreadIncoming) return

    async function markRead() {
      let update = supabase
        .from('chat_messages')
        .update({ is_read: true })
        .eq('receiver_id', currentUserId)
        .eq('is_read', false)

      if (isGroup) {
        update = update.eq('group_order_id', groupOrderId)
      } else {
        update = update.eq('sender_id', otherUserId)
      }

      const { error } = await update
      if (error) {
        console.error('Failed to mark messages as read:', error.message)
      }
    }

    markRead()
  }, [messages, currentUserId, otherUserId, groupOrderId, isGroup])

  async function handleSend(e) {
    e.preventDefault()
    const text = input.trim()
    if (!text) return
    setInput('')
    setSendError('')

    const payload = isGroup
      ? { sender_id: currentUserId, message: text, group_order_id: groupOrderId }
      : { sender_id: currentUserId, receiver_id: otherUserId, message: text }

    const { error } = await supabase.from('chat_messages').insert(payload)
    if (error) {
      console.error('Failed to send message:', error.message)
      // Keep the text so it isn't lost. RLS refusals mean the chat rules
      // (friends / accepted request / ordered from this business) don't allow it.
      setInput(text)
      setSendError(
        error.code === '42501' || /row-level security/i.test(error.message)
          ? "You can't message this person yet. Send a friend or message request first."
          : error.message.includes('suspended')
            ? error.message
            : 'Message not sent. Please try again.',
      )
    }
  }

  const headerName = isGroup
    ? groupOrderLabel || 'Group order chat'
    : senderProfiles[otherUserId]?.displayName || otherUserName || 'Chat'
  const headerRole = isGroup ? 'student' : otherUserRole
  // 1:1 with a deleted account: history stays readable, nothing can be sent.
  const otherDeleted = !isGroup && otherUserRole === 'deleted'

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[70vh] bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <BackLink onClick={onBack} />
        <p className="font-display font-semibold text-sm">{headerName}</p>
        {headerRole && headerRole !== 'deleted' && (
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            headerRole === 'merchant'
              ? 'bg-green-100 text-green-700'
              : 'bg-blue-100 text-blue-700'
          }`}>
            {headerRole === 'merchant' ? '🏪 Business' : '🎓 Student'}
          </span>
        )}
        {!isGroup && !otherDeleted && otherUserId && (
          <button
            type="button"
            onClick={() => setShowReport(true)}
            className="ml-auto inline-flex min-h-11 items-center gap-1 px-2 text-xs text-muted-foreground hover:text-red-400 transition"
          >
            <Flag size={14} aria-hidden="true" /> Report
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">No messages yet, say hi!</p>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1]
            const showDaySep = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
            const isMine = m.sender_id === currentUserId
            return (
              <div key={m.id}>
                {showDaySep && (
                  <div className="flex justify-center my-3">
                    <span className="text-[11px] text-muted-foreground bg-muted/60 px-3 py-1 rounded-full">
                      {formatDateSeparator(m.created_at)}
                    </span>
                  </div>
                )}
                <div
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`flex max-w-[75%] flex-col ${isMine ? 'items-end' : 'items-start'}`}
                  >
                    {!isMine && (
                      <p className="mb-1 px-1 text-[11px] text-muted-foreground">
                        {senderProfiles[m.sender_id]?.displayName ||
                          (!isGroup && m.sender_id === otherUserId ? otherUserName : null) ||
                          'Student'}
                      </p>
                    )}
                    <div className={`text-sm rounded-lg px-3 py-2 max-w-full ${
                      isMine
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{linkPhoneNumbers(m.message)}</p>
                      {m.link_path && (
                        <button
                          type="button"
                          onClick={() => navigate(m.link_path)}
                          className={`mt-2 w-full text-xs font-semibold rounded-md px-3 py-2 transition ${
                            isMine
                              ? 'bg-background/20 hover:bg-background/30 text-primary-foreground'
                              : 'bg-accent/20 hover:bg-accent/30 text-accent'
                          }`}
                        >
                          {m.link_label || 'Open'} &rarr;
                        </button>
                      )}
                      <p
                        className={`text-[10px] mt-1 text-right ${
                        isMine
                          ? 'text-primary-foreground/70'
                          : 'text-muted-foreground'
                        }`}
                      >
                        {formatTime(m.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      {otherDeleted ? (
        <p role="status" className="p-3 border-t border-border text-center text-sm text-muted-foreground">
          This account has been deleted. You can still read this conversation.
        </p>
      ) : (
      <>
      {sendError && (
        <p role="alert" className="px-3 pt-2 text-xs text-red-400">{sendError}</p>
      )}
      <form
        onSubmit={handleSend}
        className="p-3 border-t border-border flex items-center gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 h-11 bg-input border border-input rounded-lg px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="submit"
          className="h-11 bg-primary text-primary-foreground font-semibold rounded-lg px-4 text-sm shrink-0"
        >
          Send
        </button>
      </form>
      </>
      )}

      {showReport && (
        <ReportDialog
          reportedId={otherUserId}
          reportedName={headerName}
          context={headerRole === 'merchant' ? 'business' : 'chat'}
          onClose={() => setShowReport(false)}
        />
      )}
    </div>
  )
}
