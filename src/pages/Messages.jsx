import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import ChatThread from '../components/ChatThread.jsx'

export default function Messages() {
  const [currentUser, setCurrentUser] = useState(null)
  const [conversations, setConversations] = useState([])
  const [groupChats, setGroupChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [openChat, setOpenChat] = useState(null)

  useEffect(() => {
    async function load() {
      const { data: userData } = await supabase.auth.getUser()
      const user = userData?.user
      if (!user) {
        setLoading(false)
        return
      }
      setCurrentUser(user)

      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .not('receiver_id', 'is', null)
        .order('created_at', { ascending: false })

      const seen = new Set()
      const convos = []
      for (const m of msgs || []) {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id
        if (!seen.has(otherId)) {
          seen.add(otherId)
          convos.push({ otherId, lastMessage: m.message, createdAt: m.created_at })
        }
      }
      const otherIds = convos.map((c) => c.otherId)
      let displayNames = {}
      if (otherIds.length > 0) {
        // 1. Try merchant_profiles first (covers: other person is a merchant)
        const { data: merchantProfiles } = await supabase
          .from('merchant_profiles')
          .select('id, business_name')
          .in('id', otherIds)

        if (merchantProfiles) {
          merchantProfiles.forEach((p) => {
            displayNames[p.id] = p.business_name || 'Merchant'
          })
        }

        // 2. For anyone not resolved yet, try redemptions.student_name (covers: other person is a student)
        const stillUnresolved = otherIds.filter((id) => !displayNames[id])
        if (stillUnresolved.length > 0) {
          const { data: redemptionRows } = await supabase
            .from('redemptions')
            .select('student_id, student_name')
            .in('student_id', stillUnresolved)

          if (redemptionRows) {
            redemptionRows.forEach((r) => {
              if (!displayNames[r.student_id] && r.student_name) {
                displayNames[r.student_id] = r.student_name
              }
            })
          }
        }
      }

      const convosWithNames = convos.map((c) => ({
        ...c,
        businessName: displayNames[c.otherId] || 'Unknown user',
      }))

      setConversations(convosWithNames)

      const { data: memberships } = await supabase
        .from('group_order_members')
        .select('group_order_id, group_orders(id, host_name, join_code)')
        .eq('student_id', user.id)

      setGroupChats(memberships || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading messages...</p>
  }

  if (openChat) {
    return (
      <ChatThread
        currentUserId={currentUser.id}
        otherUserId={openChat.otherId}
        otherUserName={openChat.otherName}
        groupOrderId={openChat.groupOrderId}
        groupOrderLabel={openChat.groupOrderLabel}
        onBack={() => setOpenChat(null)}
      />
    )
  }

  const hasNothing = conversations.length === 0 && groupChats.length === 0

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Messages</h2>

      {hasNothing ? (
        <p className="text-muted-foreground text-sm">
          No conversations yet. Message a merchant from a deal, or join a group order to chat with your group.
        </p>
      ) : (
        <div className="space-y-2">
          {groupChats.map((g) => (
            <button
              key={g.group_order_id}
              onClick={() =>
                setOpenChat({
                  groupOrderId: g.group_order_id,
                  groupOrderLabel: `Group order (code ${g.group_orders?.join_code || '----'})`,
                })
              }
              className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition flex items-center gap-3"
            >
              <span className="text-xl">group</span>
              <div>
                <p className="font-medium text-sm">
                  Group order (code {g.group_orders?.join_code || '----'})
                </p>
                <p className="text-muted-foreground text-xs">Hosted by {g.group_orders?.host_name || 'a student'}</p>
              </div>
            </button>
          ))}

          {conversations.map((c) => (
            <button
              key={c.otherId}
              onClick={() => setOpenChat({ otherId: c.otherId, otherName: c.businessName })}
              className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition"
            >
              <p className="font-medium text-sm">{c.businessName}</p>
              <p className="text-muted-foreground text-xs truncate">{c.lastMessage}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
