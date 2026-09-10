import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function ChatThread({ currentUserId, otherUserId, otherUserName, groupOrderId, groupOrderLabel, onBack }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const bottomRef = useRef(null)

  const isGroup = Boolean(groupOrderId)

  useEffect(() => {
    let cancelled = false

    async function loadMessages() {
      let query = supabase.from('chat_messages').select('*').order('created_at', { ascending: true })

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
      .channel(`chat-${isGroup ? groupOrderId : [currentUserId, otherUserId].sort().join('-')}`)
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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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
    <div className="flex flex-col h-[70vh] border border-border rounded-lg overflow-hidden bg-card">
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <button onClick={onBack} className="text-muted-foreground hover:text-foreground text-lg leading-none">
          Back
        </button>
        <p className="font-display font-semibold text-sm">
          {isGroup ? (groupOrderLabel || 'Group order chat') : (otherUserName || 'Chat')}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {loading ? (
          <p className="text-muted-foreground text-sm">Loading messages...</p>
        ) : messages.length === 0 ? (
          <p className="text-muted-foreground text-sm">No messages yet, say hi!</p>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={`text-sm rounded-lg px-3 py-2 max-w-[75%] ${
                m.sender_id === currentUserId
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-muted text-foreground'
              }`}
            >
              {m.message}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSend} className="p-3 border-t border-border flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 bg-input border border-input rounded-lg px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="submit" className="bg-primary text-primary-foreground font-semibold rounded-lg px-4 text-sm">
          Send
        </button>
      </form>
    </div>
  )
}
