import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

function formatTime(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })
}

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
  return d.toLocaleDateString([], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
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
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)
  const hasScrolledOnce = useRef(false)
  const navigate = useNavigate()

  const isGroup = Boolean(groupOrderId)

  useEffect(() => {
    let cancelled = false

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
      if (!error) setMessages(data || [])
      setLoading(false)
    }

    loadMessages()

    const channel = supabase
      .channel(
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
          if (belongs) setMessages((prev) => [...prev, m])
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

    const payload = isGroup
      ? { sender_id: currentUserId, message: text, group_order_id: groupOrderId }
      : { sender_id: currentUserId, receiver_id: otherUserId, message: text }

    const { error } = await supabase.from('chat_messages').insert(payload)
    if (error) console.error('Failed to send message:', error.message)
  }

  return (
    <div className="flex flex-col h-[calc(100dvh-10rem)] md:h-[70vh] bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button
          onClick={onBack}
          className="text-muted-foreground hover:text-foreground text-lg leading-none"
        >
          Back
        </button>
        <p className="font-display font-semibold text-sm">
          {isGroup
            ? groupOrderLabel || 'Group order chat'
            : otherUserName || 'Chat'}
        </p>
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
                    className={`text-sm rounded-lg px-3 py-2 max-w-[75%] ${
                      isMine
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.message}</p>
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
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

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
    </div>
  )
}
