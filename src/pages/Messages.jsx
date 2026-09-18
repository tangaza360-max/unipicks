import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import ChatThread from '../components/ChatThread.jsx'
import { Store, Users } from 'lucide-react'

export default function Messages({
  initialConversation = null,
  onInitialConversationOpened,
}) {
  const [currentUser, setCurrentUser] = useState(null)
  const [role, setRole] = useState(null)
  const [merchants, setMerchants] = useState([])
const [studentConversations, setStudentConversations] = useState([])
  const [conversations, setConversations] = useState([])
  const [groupChats, setGroupChats] = useState([])
  const [loading, setLoading] = useState(true)
  const [openChat, setOpenChat] = useState(null)

  useEffect(() => {
    if (!initialConversation?.otherId || !currentUser) return

    setOpenChat({
      otherId: initialConversation.otherId,
      otherName: initialConversation.otherName || 'Student',
    })

    onInitialConversationOpened?.()
  }, [initialConversation, currentUser])

  useEffect(() => {
    let cancelled = false
    let channel = null

    async function load() {
      setLoading(true)

      const { data: userData, error: userError } = await supabase.auth.getUser()
      if (userError) {
        console.error('Failed to get current user:', userError.message)
      }

      const user = userData?.user

      if (!user) {
        if (!cancelled) setLoading(false)
        return
      }

      const { data: trustedRole, error: roleError } = await supabase.rpc('get_my_role')

      if (roleError) {
        console.error('Failed to get user role:', roleError.message)
      }

      if (cancelled) return

      setCurrentUser(user)
      setRole(trustedRole)

      if (trustedRole === 'merchant') {
        await loadMerchantInbox(user.id)
      } else if (trustedRole === 'student') {
        await loadStudentInbox(user.id)
      }

      if (cancelled) return

      channel = supabase
        .channel(`messages-inbox-${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
          },
          (payload) => {
            const message = payload.new || payload.old

            if (
              message?.sender_id === user.id ||
              message?.receiver_id === user.id
            ) {
              if (trustedRole === 'merchant') {
                loadMerchantInbox(user.id)
              } else if (trustedRole === 'student') {
                loadStudentInbox(user.id)
              }
            }
          }
        )
        .subscribe()

      if (!cancelled) {
        setLoading(false)
      }
    }

    async function loadStudentInbox(userId) {
      const { data: merchantProfiles, error: merchantError } = await supabase
        .from('merchant_profiles')
        .select('id, business_name, logo_url')
        .eq('approved', true)
        .order('business_name', { ascending: true })

      if (merchantError) {
        console.error('Failed to load merchants:', merchantError.message)
      }

      const { data: msgs, error: messageError } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .not('receiver_id', 'is', null)
        .order('created_at', { ascending: false })

      if (messageError) {
        console.error('Failed to load student messages:', messageError.message)
      }

      const lastMessageByMerchant = {}

      for (const message of msgs || []) {
        const otherId =
          message.sender_id === userId
            ? message.receiver_id
            : message.sender_id

        if (!otherId || lastMessageByMerchant[otherId]) continue

        lastMessageByMerchant[otherId] = {
          lastMessage: message.message,
          createdAt: message.created_at,
          unreadCount:
            message.receiver_id === userId && !message.is_read ? 1 : 0,
        }
      }

      const unreadCounts = {}

      for (const message of msgs || []) {
        const otherId =
          message.sender_id === userId
            ? message.receiver_id
            : message.sender_id

        if (!otherId) continue

        if (
          message.receiver_id === userId &&
          !message.is_read
        ) {
          unreadCounts[otherId] = (unreadCounts[otherId] || 0) + 1
        }
      }

      const merchantList = (merchantProfiles || []).map((merchant) => ({
        id: merchant.id,
        businessName: merchant.business_name || 'Merchant',
        logoUrl: merchant.logo_url,
        lastMessage: lastMessageByMerchant[merchant.id]?.lastMessage || null,
        createdAt: lastMessageByMerchant[merchant.id]?.createdAt || null,
        unreadCount: unreadCounts[merchant.id] || 0,
      }))

      merchantList.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt)
        }

        if (a.createdAt) return -1
        if (b.createdAt) return 1

        return a.businessName.localeCompare(b.businessName)
      })

      setMerchants(merchantList)

      const studentIds = [...new Set(
        (msgs || [])
          .map((message) =>
            message.sender_id === userId
              ? message.receiver_id
              : message.sender_id
          )
          .filter(Boolean)
      )].filter(
        (id) => !(merchantProfiles || []).some((merchant) => merchant.id === id)
      )

      let studentProfiles = []

      if (studentIds.length > 0) {
        const { data, error } = await supabase.rpc(
          'get_student_message_profiles',
          {
            target_student_ids: studentIds,
          }
        )

        if (error) {
          console.error(
            'Failed to load student messaging profiles:',
            error.message
          )
        } else {
          studentProfiles = data || []
        }
      }

      const studentList = studentProfiles.map((student) => ({
        id: student.user_id,
        displayName: student.display_name || 'Student',
        username: student.username || null,
        lastMessage: lastMessageByMerchant[student.user_id]?.lastMessage || null,
        createdAt: lastMessageByMerchant[student.user_id]?.createdAt || null,
        unreadCount: unreadCounts[student.user_id] || 0,
      }))

      studentList.sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return new Date(b.createdAt) - new Date(a.createdAt)
        }

        if (a.createdAt) return -1
        if (b.createdAt) return 1

        return a.displayName.localeCompare(b.displayName)
      })

      setStudentConversations(studentList)

      const { data: memberships, error: membershipError } = await supabase
        .from('group_order_members')
        .select('group_order_id, group_orders(id, host_name, join_code)')
        .eq('student_id', userId)

      if (membershipError) {
        console.error(
          'Failed to load group chats:',
          membershipError.message
        )
      }

      setGroupChats(memberships || [])
    }

    async function loadMerchantInbox(userId) {
      const { data: msgs, error: messageError } = await supabase
        .from('chat_messages')
        .select('*')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .not('receiver_id', 'is', null)
        .order('created_at', { ascending: false })

      if (messageError) {
        console.error('Failed to load merchant messages:', messageError.message)
        setConversations([])
        return
      }

      const conversationsByStudent = {}

      for (const message of msgs || []) {
        const otherId =
          message.sender_id === userId
            ? message.receiver_id
            : message.sender_id

        if (!otherId) continue

        if (!conversationsByStudent[otherId]) {
          conversationsByStudent[otherId] = {
            otherId,
            otherName: 'Student',
            lastMessage: message.message,
            createdAt: message.created_at,
            unreadCount: 0,
          }
        }

        if (
          message.receiver_id === userId &&
          !message.is_read
        ) {
          conversationsByStudent[otherId].unreadCount += 1
        }
      }

      const merchantConversations = Object.values(conversationsByStudent)

      merchantConversations.sort((a, b) => {
        return new Date(b.createdAt) - new Date(a.createdAt)
      })

      setConversations(merchantConversations)
    }

    load()

    return () => {
      cancelled = true

      if (channel) {
        channel.unsubscribe()
      }
    }
  }, [])

  async function markConversationRead(otherUserId) {
    if (!currentUser?.id || !otherUserId) return

    const { error } = await supabase
      .from('chat_messages')
      .update({ is_read: true })
      .eq('receiver_id', currentUser.id)
      .eq('sender_id', otherUserId)
      .eq('is_read', false)

    if (error) {
      console.error('Failed to mark messages as read:', error.message)
      return
    }

    if (role === 'merchant') {
      const updated = conversations.map((conversation) =>
        conversation.otherId === otherUserId
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )

      setConversations(updated)
    }

    if (role === 'student') {
      const updated = merchants.map((merchant) =>
        merchant.id === otherUserId
          ? { ...merchant, unreadCount: 0 }
          : merchant
      )

      setMerchants(updated)

      const updatedStudents = studentConversations.map((student) =>
        student.id === otherUserId
          ? { ...student, unreadCount: 0 }
          : student
      )

      setStudentConversations(updatedStudents)
    }
  }

  function openConversation(conversation) {
    markConversationRead(conversation.otherId)

    setOpenChat({
      otherId: conversation.otherId,
      otherName: conversation.otherName,
    })
  }

  if (loading) {
    return (
      <p className="text-muted-foreground text-sm">
        Loading messages...
      </p>
    )
  }

  if (!currentUser) {
    return (
      <p className="text-muted-foreground text-sm">
        Please sign in to view messages.
      </p>
    )
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

  const totalUnread =
    role === 'merchant'
      ? conversations.reduce(
          (total, conversation) => total + conversation.unreadCount,
          0
        )
      : merchants.reduce(
          (total, merchant) => total + merchant.unreadCount,
          0
        ) +
        studentConversations.reduce(
          (total, conversation) => total + conversation.unreadCount,
          0
        )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">
          Messages
        </h2>

        {totalUnread > 0 && (
          <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center">
            {totalUnread > 99 ? '99+' : totalUnread}
          </span>
        )}
      </div>

      {role === 'student' && groupChats.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Group orders
          </p>

          {groupChats.map((group) => (
            <button
              key={group.group_order_id}
              onClick={() =>
                setOpenChat({
                  groupOrderId: group.group_order_id,
                  groupOrderLabel: `Group order (code ${
                    group.group_orders?.join_code || '----'
                  })`,
                })
              }
              className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Users size={18} />
              </div>

              <div>
                <p className="font-medium text-sm">
                  Group order (code{' '}
                  {group.group_orders?.join_code || '----'})
                </p>

                <p className="text-muted-foreground text-xs">
                  Hosted by{' '}
                  {group.group_orders?.host_name || 'a student'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {role === 'student' && studentConversations.length > 0 && (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Students
          </p>

          {studentConversations.map((student) => (
            <button
              key={student.id}
              onClick={() =>
                openConversation({
                  otherId: student.id,
                  otherName: student.displayName,
                })
              }
              className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition flex items-center gap-3"
            >
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                <Users size={18} />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">
                      {student.displayName}
                    </p>

                    {student.username && (
                      <p className="text-muted-foreground text-xs truncate">
                        @{student.username.replace(/^@+/, '')}
                      </p>
                    )}
                  </div>

                  {student.unreadCount > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                      {student.unreadCount > 99 ? '99+' : student.unreadCount}
                    </span>
                  )}
                </div>

                <p className="text-muted-foreground text-xs truncate">
                  {student.lastMessage || 'No messages yet'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}

      {role === 'merchant' ? (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Students
          </p>

          {conversations.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No conversations yet.
            </p>
          ) : (
            conversations.map((conversation) => (
              <button
                key={conversation.otherId}
                onClick={() => openConversation(conversation)}
                className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <Users size={18} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">
                      {conversation.otherName}
                    </p>

                    {conversation.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                        {conversation.unreadCount > 99
                          ? '99+'
                          : conversation.unreadCount}
                      </span>
                    )}
                  </div>

                  <p className="text-muted-foreground text-xs truncate">
                    {conversation.lastMessage || 'No messages yet'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-xs uppercase tracking-wide">
            Merchants
          </p>

          {merchants.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No merchants available yet.
            </p>
          ) : (
            merchants.map((merchant) => (
              <button
                key={merchant.id}
                onClick={() =>
                  openConversation({
                    otherId: merchant.id,
                    otherName: merchant.businessName,
                  })
                }
                className="w-full text-left border border-border rounded-lg p-3 hover:border-accent/50 transition flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-muted overflow-hidden flex items-center justify-center text-muted-foreground shrink-0">
                  {merchant.logoUrl ? (
                    <img
                      src={merchant.logoUrl}
                      alt={merchant.businessName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Store size={18} />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm">
                      {merchant.businessName}
                    </p>

                    {merchant.unreadCount > 0 && (
                      <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-xs font-semibold flex items-center justify-center shrink-0">
                        {merchant.unreadCount > 99
                          ? '99+'
                          : merchant.unreadCount}
                      </span>
                    )}
                  </div>

                  <p className="text-muted-foreground text-xs truncate">
                    {merchant.lastMessage ||
                      'Tap to start a conversation'}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}