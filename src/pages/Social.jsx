import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bell,
  Search,
  Plus,
  UserPlus,
  UserCheck,
  MessageCircle,
  Ban,
  Check,
  X,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import SocialActivity from '../components/SocialActivity.jsx'

const tabs = [
  { id: 'for-you', label: 'For You' },
  { id: 'deals', label: 'Deals' },
  { id: 'events', label: 'Events' },
  { id: 'activities', label: 'Activities' },
]

export default function Social() {
  const [activeTab, setActiveTab] = useState('for-you')
  const [showActivity, setShowActivity] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedStudent, setSelectedStudent] = useState(null)
  const [studentResults, setStudentResults] = useState([])
  const [searchingStudents, setSearchingStudents] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [relationship, setRelationship] = useState('none')
  const [relationshipLoading, setRelationshipLoading] = useState(false)
  const [relationshipActionLoading, setRelationshipActionLoading] = useState(false)
  const [relationshipError, setRelationshipError] = useState('')
  const [relationshipMessage, setRelationshipMessage] = useState('')

  useEffect(() => {
    const query = searchQuery.trim()

    if (!query) {
      setStudentResults([])
      setSearchError('')
      setSearchingStudents(false)
      return
    }

    let cancelled = false

    const timer = setTimeout(async () => {
      setSearchingStudents(true)
      setSearchError('')

      const { data, error } = await supabase.rpc('search_students', {
        search_query: query,
      })

      if (cancelled) return

      if (error) {
        console.error('Student search failed:', error)
        setStudentResults([])
        setSearchError('Unable to search students right now.')
      } else {
        setStudentResults(data || [])
      }

      setSearchingStudents(false)
    }, 300)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [searchQuery])

  useEffect(() => {
    if (!selectedStudent?.user_id) {
      setRelationship('none')
      setRelationshipError('')
      setRelationshipMessage('')
      return
    }

    let cancelled = false

    async function loadRelationship() {
      setRelationshipLoading(true)
      setRelationshipError('')
      setRelationshipMessage('')

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData?.user) {
        if (!cancelled) {
          setRelationshipError('Unable to load relationship status.')
          setRelationshipLoading(false)
        }
        return
      }

      const currentUserId = userData.user.id
      const targetUserId = selectedStudent.user_id

      if (currentUserId === targetUserId) {
        if (!cancelled) {
          setRelationship('self')
          setRelationshipLoading(false)
        }
        return
      }

      const [friendshipsResult, friendRequestsResult, messageRequestsResult, blocksResult] =
        await Promise.all([
          supabase
            .from('friendships')
            .select('id, student_a, student_b')
            .or(
              `and(student_a.eq.${currentUserId},student_b.eq.${targetUserId}),and(student_a.eq.${targetUserId},student_b.eq.${currentUserId})`
            ),

          supabase
            .from('friend_requests')
            .select('id, sender_id, receiver_id, status, created_at')
            .or(
              `and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`
            )
            .order('created_at', { ascending: false }),

          supabase
            .from('message_requests')
            .select('id, sender_id, receiver_id, status, created_at')
            .or(
              `and(sender_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(sender_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`
            )
            .order('created_at', { ascending: false }),

          supabase
            .from('blocked_students')
            .select('id, blocker_id, blocked_id')
            .or(
              `and(blocker_id.eq.${currentUserId},blocked_id.eq.${targetUserId}),and(blocker_id.eq.${targetUserId},blocked_id.eq.${currentUserId})`
            ),
        ])

      if (cancelled) return

      if (
        friendshipsResult.error ||
        friendRequestsResult.error ||
        messageRequestsResult.error ||
        blocksResult.error
      ) {
        console.error(
          'Failed to load student relationship:',
          friendshipsResult.error ||
            friendRequestsResult.error ||
            messageRequestsResult.error ||
            blocksResult.error
        )
        setRelationshipError('Unable to load relationship status.')
        setRelationshipLoading(false)
        return
      }

      const friendship = friendshipsResult.data?.[0]

      if (friendship) {
        setRelationship('friends')
        setRelationshipLoading(false)
        return
      }

      const block = blocksResult.data?.[0]

      if (block) {
        setRelationship(
          block.blocker_id === currentUserId ? 'blocked-by-me' : 'blocked-me'
        )
        setRelationshipLoading(false)
        return
      }

      const friendRequest =
        friendRequestsResult.data?.find(
          (request) => request.status === 'pending'
        ) || null

      if (friendRequest) {
        setRelationship(
          friendRequest.sender_id === currentUserId
            ? 'friend-request-sent'
            : 'friend-request-received'
        )
        setRelationshipLoading(false)
        return
      }

      const messageRequest =
        messageRequestsResult.data?.find(
          (request) => request.status === 'pending'
        ) || null

      if (messageRequest) {
        setRelationship(
          messageRequest.sender_id === currentUserId
            ? 'message-request-sent'
            : 'message-request-received'
        )
        setRelationshipLoading(false)
        return
      }

      setRelationship('none')
      setRelationshipLoading(false)
    }

    loadRelationship()

    return () => {
      cancelled = true
    }
  }, [selectedStudent])

  async function runRelationshipAction(action) {
    if (!selectedStudent?.user_id) return

    setRelationshipActionLoading(true)
    setRelationshipError('')
    setRelationshipMessage('')

    const rpcMap = {
      friend: 'send_friend_request',
      acceptFriend: 'accept_friend_request',
      message: 'send_message_request',
      acceptMessage: 'accept_message_request',
      block: 'block_student',
      unblock: 'unblock_student',
    }

    const rpcName = rpcMap[action]

    let requestId = selectedStudent.user_id

    if (action === 'acceptFriend' || action === 'acceptMessage') {
      const table =
        action === 'acceptFriend'
          ? 'friend_requests'
          : 'message_requests'

      const { data: userData, error: userError } =
        await supabase.auth.getUser()

      if (userError || !userData?.user) {
        setRelationshipError('Unable to identify your account.')
        setRelationshipActionLoading(false)
        return
      }

      const { data: requests, error } = await supabase
        .from(table)
        .select('id, sender_id, receiver_id, status, created_at')
        .eq('sender_id', selectedStudent.user_id)
        .eq('receiver_id', userData.user.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)

      if (error || !requests?.[0]) {
        setRelationshipError('The request is no longer available.')
        setRelationshipActionLoading(false)
        return
      }

      requestId = requests[0].id
    }

    const { error } = await supabase.rpc(rpcName, {
      ...(action === 'acceptFriend' || action === 'acceptMessage'
        ? { request_id: requestId }
        : { target_student: requestId }),
    })

    if (error) {
      console.error(`Social action failed (${action}):`, error)
      setRelationshipError(error.message || 'Action could not be completed.')
      setRelationshipActionLoading(false)
      return
    }

    if (action === 'friend') {
      setRelationship('friend-request-sent')
      setRelationshipMessage('Friend request sent.')
    } else if (action === 'acceptFriend') {
      setRelationship('friends')
      setRelationshipMessage('You are now friends.')
    } else if (action === 'message') {
      setRelationship('message-request-sent')
      setRelationshipMessage('Message request sent.')
    } else if (action === 'acceptMessage') {
      setRelationship('message-request-accepted')
      setRelationshipMessage('Message request accepted. You can now message each other.')
    } else if (action === 'block') {
      setRelationship('blocked-by-me')
      setRelationshipMessage('Student blocked.')
    } else if (action === 'unblock') {
      setRelationship('none')
      setRelationshipMessage('Student unblocked.')
    }

    setRelationshipActionLoading(false)
  }

  if (selectedStudent) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <section className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <button
              type="button"
              onClick={() => setSelectedStudent(null)}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
            >
              <ArrowLeft size={18} />
              <span>Back to Social</span>
            </button>
          </div>

          <div className="px-5 py-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-24 h-24 rounded-full bg-muted border border-border flex items-center justify-center">
                <span className="text-3xl font-semibold">
                  {selectedStudent.display_name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>

              <h1 className="mt-4 text-xl font-semibold">
                {selectedStudent.display_name}
              </h1>

              <p className="mt-1 text-sm text-muted-foreground">
                @{selectedStudent.username}
              </p>

              <p className="mt-4 text-sm">
                {selectedStudent.university}
              </p>

              <p className="text-sm text-muted-foreground">
                {selectedStudent.campus}
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {relationshipLoading ? (
                <span className="text-sm text-muted-foreground">
                  Checking relationship...
                </span>
              ) : relationship === 'friends' ||
                relationship === 'message-request-accepted' ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      window.dispatchEvent(
                        new CustomEvent('unipicks-open-student-chat', {
                          detail: {
                            userId: selectedStudent.user_id,
                            displayName: selectedStudent.display_name,
                          },
                        })
                      )
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                  >
                    <MessageCircle size={16} />
                    Message
                  </button>

                  {relationship === 'friends' && (
                    <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm">
                      <UserCheck size={16} />
                      Friends
                    </span>
                )}
                  </>
              ) : relationship === 'friend-request-sent' ? (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground">
                  <Check size={16} />
                  Friend Request Sent
                </span>
              ) : relationship === 'friend-request-received' ? (
                <button
                  type="button"
                  disabled={relationshipActionLoading}
                  onClick={() => runRelationshipAction('acceptFriend')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <Check size={16} />
                  Accept Friend
                </button>
              ) : relationship === 'message-request-sent' ? (
                <span className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground">
                  <Check size={16} />
                  Message Request Sent
                </span>
              ) : relationship === 'message-request-received' ? (
                <button
                  type="button"
                  disabled={relationshipActionLoading}
                  onClick={() => runRelationshipAction('acceptMessage')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                >
                  <Check size={16} />
                  Accept Message
                </button>
              ) : relationship === 'blocked-by-me' ? (
                <button
                  type="button"
                  disabled={relationshipActionLoading}
                  onClick={() => runRelationshipAction('unblock')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
                >
                  Unblock
                </button>
              ) : relationship === 'blocked-me' ? (
                <span className="text-sm text-muted-foreground">
                  This student is not available for interaction.
                </span>
              ) : (
                <>
                  <button
                    type="button"
                    disabled={relationshipActionLoading}
                    onClick={() => runRelationshipAction('friend')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
                  >
                    <UserPlus size={16} />
                    Add Friend
                  </button>

                  <button
                    type="button"
                    disabled={relationshipActionLoading}
                    onClick={() => runRelationshipAction('message')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <MessageCircle size={16} />
                    Message
                  </button>

                  <button
                    type="button"
                    disabled={relationshipActionLoading}
                    onClick={() => runRelationshipAction('block')}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <Ban size={16} />
                    Block
                  </button>
                </>
                )}
            </div>

            {relationshipError && (
              <p className="mt-3 text-center text-sm text-destructive">
                {relationshipError}
              </p>
              )}

            {relationshipMessage && (
              <p className="mt-3 text-center text-sm text-muted-foreground">
                {relationshipMessage}
              </p>
            )}

            {selectedStudent.student_description && (
              <div className="mt-6">
                <h2 className="text-sm font-semibold">Student</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedStudent.student_description}
                </p>
              </div>
              )}

            {selectedStudent.short_bio && (
              <div className="mt-5">
                <h2 className="text-sm font-semibold">About</h2>
                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                  {selectedStudent.short_bio}
                </p>
              </div>
              )}
          </div>
        </section>
      </div>
    )
  }


  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Search */}
      <div className="relative">
        <Search
          size={18}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />

        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search students, businesses, deals and more..."
          className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>


          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowActivity((current) => !current)}
              className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition"
            >
              <Bell size={18} />
              Activity
            </button>
          </div>

          {showActivity ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setShowActivity(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"
              >
                <ArrowLeft size={16} />
                Back to Social
              </button>

              <SocialActivity />
            </div>
          ) : (
            <>
              {searchQuery.trim() && (
                <section className="bg-card border border-border rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <h2 className="font-semibold text-sm">Students</h2>
                  </div>

                  {searchingStudents && (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      Searching students...
                    </div>
                  )}

                  {!searchingStudents && searchError && (
                    <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                      {searchError}
                    </div>
                  )}

                  {!searchingStudents &&
                    !searchError &&
                    studentResults.length === 0 && (
                      <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                        No students found.
                      </div>
                    )}

                  {!searchingStudents &&
                    !searchError &&
                    studentResults.length > 0 && (
                      <div className="divide-y divide-border">
                        {studentResults.map((student) => (
                          <button
                            key={student.user_id}
                            type="button"
                            onClick={() => setSelectedStudent(student)}
                            className="w-full text-left px-4 py-4 hover:bg-muted/50 transition"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-11 h-11 rounded-full bg-muted border border-border flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-semibold">
                                  {student.display_name?.charAt(0)?.toUpperCase() || '?'}
                                </span>
                              </div>

                              <div className="min-w-0">
                                <p className="font-medium truncate">
                                  {student.display_name}
                                </p>

                                <p className="text-sm text-muted-foreground truncate">
                                  @{student.username}
                                </p>

                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  {student.university} · {student.campus}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                </section>
              )}

              {/* Stories */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-display text-lg font-semibold">Stories</h2>

                  <button className="text-sm text-muted-foreground hover:text-foreground transition">
                    See all
                  </button>
                </div>

                <div className="flex gap-4 overflow-x-auto pb-2">
                  <button className="flex-shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-full border-2 border-dashed border-border flex items-center justify-center">
                      <Plus size={22} className="text-muted-foreground" />
                    </div>

                    <span className="text-xs text-muted-foreground">
                      Your Story
                    </span>
                  </button>

                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-full bg-muted border border-border" />
                    <span className="text-xs text-muted-foreground">Stories</span>
                  </div>

                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-full bg-muted border border-border" />
                    <span className="text-xs text-muted-foreground">Stories</span>
                  </div>

                  <div className="flex-shrink-0 flex flex-col items-center gap-2">
                    <div className="w-16 h-16 rounded-full bg-muted border border-border" />
                    <span className="text-xs text-muted-foreground">Stories</span>
                  </div>
                </div>
              </section>

              {/* Feed tabs */}
              <div className="flex gap-2 overflow-x-auto border-b border-border">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id

                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition ${
                        isActive
                          ? 'border-primary text-primary'
                          : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {tab.label}
                    </button>
                  )
                })}
              </div>

              {/* Feed */}
              <section className="min-h-[300px] flex items-center justify-center">
                <div className="text-center max-w-md">
                  <h2 className="font-display text-xl font-semibold">
                    {tabs.find((tab) => tab.id === activeTab)?.label}
                  </h2>

                  <p className="mt-2 text-sm text-muted-foreground">
                    Social content will appear here.
                  </p>
                </div>
              </section>
            </>
          )}
        </div>
      )
}
