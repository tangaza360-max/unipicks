import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bell,
  Search,
  UserPlus,
  UserCheck,
  MessageCircle,
  Ban,
  Flag,
  Check,
  X,
  Plus,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import SocialActivity from '../components/SocialActivity.jsx'
import ReportDialog from '../components/ReportDialog.jsx'
import BackLink from '../components/BackLink.jsx'
import Button from '../components/Button.jsx'
import { STORY_POSTED_EVENT, openStoryCamera } from '../lib/studentStories.js'
import StudentStoryViewer from '../components/StudentStoryViewer.jsx'
import StudentAvatar from '../components/StudentAvatar.jsx'
import { useStudentAvatar } from '../lib/studentAvatars.js'

export default function Social() {
  const searchInputRef = useRef(null)
  const [storyTray, setStoryTray] = useState([])
  const [viewerStart, setViewerStart] = useState(null) // { owners, index }

  // Your own stories and friends' live stories (unseen first).
  const loadStoryTray = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_story_tray')
    if (error) {
      console.error('Failed to load stories:', error.message)
      return
    }
    setStoryTray(data || [])
  }, [])

  useEffect(() => {
    loadStoryTray()
    window.addEventListener(STORY_POSTED_EVENT, loadStoryTray)
    return () => window.removeEventListener(STORY_POSTED_EVENT, loadStoryTray)
  }, [loadStoryTray])

  const myStory = storyTray.find((row) => row.is_me)
  const [me, setMe] = useState(null) // { id, name } for the "Your story" circle
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setMe({ id: data.user.id, name: data.user.user_metadata?.full_name || 'You' })
    })
  }, [])
  const myStoryCount = myStory?.story_count || 0
  const friendStories = storyTray.filter((row) => !row.is_me)
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
  const [showReport, setShowReport] = useState(null) // null, 'profile' or 'avatar'
  const selectedAvatarUrl = useStudentAvatar(selectedStudent?.user_id)
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
        <section className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <BackLink onClick={() => setSelectedStudent(null)} />
          </div>

          <div className="px-5 py-8">
            <div className="flex flex-col items-center text-center">
              <StudentAvatar
                userId={selectedStudent.user_id}
                name={selectedStudent.display_name || '?'}
                size="xl"
                alt=""
                className="border border-border"
              />

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
              {relationship !== 'blocked-me' && relationship !== 'self' && (
                <button
                  type="button"
                  onClick={() => setShowReport('profile')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-red-400 hover:bg-muted"
                >
                  <Flag size={16} />
                  Report
                </button>
              )}
              {relationship !== 'blocked-me' && relationship !== 'self' && selectedAvatarUrl && (
                <button
                  type="button"
                  onClick={() => setShowReport('avatar')}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm text-muted-foreground hover:text-red-400 hover:bg-muted"
                >
                  <Flag size={16} />
                  Report photo
                </button>
              )}
            </div>

            {showReport && (
              <ReportDialog
                reportedId={selectedStudent.user_id}
                reportedName={selectedStudent.display_name || selectedStudent.username}
                context={showReport}
                onClose={() => setShowReport(null)}
              />
            )}

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
          ref={searchInputRef}
          type="search"
          aria-label="Search students"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="Search students, businesses, deals and more..."
          className="w-full pl-10 pr-4 py-3 bg-card border border-border rounded-2xl text-sm outline-none focus:ring-2 focus:ring-primary/30"
        />
      </div>


          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setShowActivity((current) => !current)}
              className="inline-flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-2.5 text-sm font-medium hover:bg-muted transition"
            >
              <Bell size={18} />
              Activity
            </button>
          </div>

          {showActivity ? (
            <div className="space-y-3">
              <BackLink onClick={() => setShowActivity(false)} />

              <SocialActivity />
            </div>
          ) : (
            <>
              {searchQuery.trim() && (
                <section className="bg-card border border-border rounded-2xl overflow-hidden">
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
                              <StudentAvatar
                                userId={student.user_id}
                                name={student.display_name || '?'}
                                size="sm"
                                alt=""
                                className="!h-11 !w-11 border border-border"
                              />

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

              {/* Stories: yours, then friends' (unseen first) */}
              {!searchQuery.trim() && (
                <section aria-label="Stories" className="space-y-4">
                  <div className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4">
                    <button
                      type="button"
                      onClick={() =>
                        myStoryCount > 0
                          ? setViewerStart({ owners: [myStory], index: 0 })
                          : openStoryCamera()
                      }
                      aria-label={myStoryCount > 0 ? 'View your story' : 'Add to your story'}
                      className={`relative flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-full ${
                        myStoryCount > 0
                          ? 'border-[3px] border-accent bg-muted'
                          : 'border-2 border-dashed border-border'
                      }`}
                    >
                      <StudentAvatar
                        userId={myStory?.student_id || me?.id}
                        name={myStory?.display_name || me?.name || 'You'}
                        size="lg"
                        alt=""
                        className="!h-[54px] !w-[54px]"
                      />
                      {myStoryCount === 0 && (
                        <span
                          aria-hidden="true"
                          className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full border-2 border-card bg-accent text-background"
                        >
                          <Plus size={14} strokeWidth={3} />
                        </span>
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">Your story</p>
                      <p className="text-sm text-muted-foreground">
                        {myStoryCount > 0
                          ? `${myStoryCount} ${myStoryCount === 1 ? 'photo' : 'photos'} live for your friends.`
                          : 'Share a photo or GIF with your friends. It disappears after 24 hours.'}
                      </p>
                    </div>
                    {myStoryCount > 0 && (
                      <Button variant="secondary" onClick={openStoryCamera} aria-label="Add to your story">
                        <Plus size={18} />
                        Add
                      </Button>
                    )}
                  </div>

                  {friendStories.length > 0 && (
                    <div>
                      <h2 className="mb-2 font-display text-lg font-semibold">Friends' stories</h2>
                      <ul className="flex gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {friendStories.map((friend, index) => (
                          <li key={friend.student_id} className="flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setViewerStart({ owners: friendStories, index })}
                              aria-label={`${friend.display_name}'s story${friend.has_unseen ? ', new' : ''}`}
                              className="flex w-[72px] flex-col items-center gap-1"
                            >
                              <span
                                className={`flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold ${
                                  friend.has_unseen ? 'border-[3px] border-accent' : 'border-2 border-border'
                                }`}
                              >
                                <StudentAvatar userId={friend.student_id} name={friend.display_name || 'S'} size="lg" alt="" className="!h-[54px] !w-[54px]" />
                              </span>
                              <span className="w-full truncate text-center text-xs">
                                {friend.display_name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </section>
              )}

              {viewerStart && (
                <StudentStoryViewer
                  owners={viewerStart.owners}
                  startIndex={viewerStart.index}
                  onClose={() => {
                    setViewerStart(null)
                    loadStoryTray()
                  }}
                />
              )}

              {/* Empty state. The social feed is not built yet (business
                  stories are on Home), so show one sentence and one action
                  instead of placeholder tabs (style guide section 9). */}
              {!searchQuery.trim() && (
                <section className="rounded-2xl border border-border bg-card px-6 py-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    Find students from your campus and follow them.
                  </p>

                  <Button
                    onClick={() => searchInputRef.current?.focus()}
                    className="mt-4"
                  >
                    <Search size={18} />
                    Search students
                  </Button>
                </section>
              )}
            </>
          )}
        </div>
      )
}
