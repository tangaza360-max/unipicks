import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import ChatThread from '../components/ChatThread.jsx'
import { Store, Users } from 'lucide-react'

export default function Messages() {
  const [currentUser, setCurrentUser] = useState(null)
  const [merchants, setMerchants] = useState([])
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

      // 1. Get every approved merchant, so students can start a chat with any of them.
      const { data: merchantProfiles } = await supabase
        .from('merchant_profiles')
        .select('id, business_name, logo_url')
        .eq('approved', true)
        .order('business_name', { ascending: true })

      // 2. Get this student's existing messages, for a preview + recent-first sort.
      const { data: msgs } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .not('receiver_id', 'is', null)
        .order('created_at', { ascending: false })

      const lastMessageByMerchant = {}
      for (const m of msgs || []) {
        const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id
        if (!lastMessageByMerchant[otherId]) {
          lastMessageByMerchant[otherId] = { lastMessage: m.message, createdAt: m.created_at }
        }
      }

      const merchantList = (merchantProfiles || []).map((m) => ({
        id: m.id,
        businessName: m.business_name || 'Merchant',
        logoUrl: m.logo_url,
        lastMessage: lastMessageByMerchant[m.id]?.lastMessage || null,
        createdAt: lastMessageByMerchant[m.id]?.createdAt || null,
      }))

      // Merchants with a recent message float to the top, like a real inbox.
      merchantList.sort((a, b) => {
        if (a.createdAt && b.createdAt) return new Date(b.createdAt) - new Date(a.createdAt)
        if (a.createdAt) return -1
        if (b.createdAt) return 1
        return a.businessName.localeCompare(b.businessName)
      })

      setMerchants(merchantList)

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

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Messages</h2>

      {groupChats.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">Group orders</p>
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
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Users size={18} />
              </div>
              <div>
                <p className="font-medium text-sm">
                  Group order (code {g.group_orders?.join_code || '----'})
                </p>
                <p className="text-muted-foreground text-xs">Hosted by {g.group_orders?.host_name || 'a student'}</p>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <p className="text-muted-foreground text-xs uppercase tracking-wide">Merchants</p>
        {merchants.length === 0 ? (
          <p className="text-muted-foreground text-sm">No merchants available yet.</p>
        ) : (
          merchants.map((m) => (
            <button
              key={m.id}
              onClick={() => setOpenChat({ otherId: m.id, otherName: m.businessName })}
              className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground shrink-0">
                {m.logoUrl ? (
                  <img src={m.logoUrl} alt={m.businessName} className="w-full h-full object-cover" />
                ) : (
                  <Store size={18} />
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium text-sm">{m.businessName}</p>
                <p className="text-muted-foreground text-xs truncate">
                  {m.lastMessage || 'Tap to start a conversation'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
