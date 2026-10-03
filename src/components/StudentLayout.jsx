import StudentCamera from './StudentCamera.jsx'
import { useEffect, useState, cloneElement } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import GroupOrders from '../pages/GroupOrders.jsx'
import Social from '../pages/Social.jsx'
import SocialOnboarding from '../pages/SocialOnboarding.jsx'
import ProfileTab from './ProfileTab.jsx'
import DesktopNav from './DesktopNav.jsx'
import Messages from '../pages/Messages.jsx'
import StudentSearch from '../pages/StudentSearch.jsx'
import StudentTopBar from './StudentTopBar.jsx'
import StudentBottomNav from './StudentBottomNav.jsx'

export default function StudentLayout({ children, onLogout }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [cameraOpen, setCameraOpen] = useState(false)
  const pathTab = pathname.split('/')[2]
  const activeTab = !pathTab || pathTab === 'deals'
    ? 'home'
    : pathTab === 'group-orders'
      ? 'orders'
      : pathTab
  const [socialHasProfile, setSocialHasProfile] = useState(null)
  const [checkingSocialProfile, setCheckingSocialProfile] = useState(false)
  const [messageTarget, setMessageTarget] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [needsActionCount, setNeedsActionCount] = useState(0)
  const [disputeUnreadCount, setDisputeUnreadCount] = useState(0)

  useEffect(() => {
    function handleOpenStudentChat(event) {
      const target = event.detail

      if (!target?.userId) return

      setMessageTarget({
        otherId: target.userId,
        otherName: target.displayName || 'Student',
      })
      navigate('/dashboard/messages')
    }

    window.addEventListener(
      'unipicks-open-student-chat',
      handleOpenStudentChat
    )

    return () => {
      window.removeEventListener(
        'unipicks-open-student-chat',
        handleOpenStudentChat
      )
    }
  }, [navigate])

  useEffect(() => {
    let active = true
    let channel = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      const { count, error } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', user.id)
        .eq('is_read', false)

      if (error) {
        console.error('[unread] initial fetch failed:', error)
      } else if (active) {
        setUnreadCount(count || 0)
      }

      async function refetchUnread() {
        const { count, error } = await supabase
          .from('chat_messages')
          .select('*', { count: 'exact', head: true })
          .eq('receiver_id', user.id)
          .eq('is_read', false)
        if (!error && active) setUnreadCount(count || 0)
      }

      channel = supabase
        .channel(`unread:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
            filter: `receiver_id=eq.${user.id}`,
          },
          () => refetchUnread()
        )
        .subscribe()
    }

    init()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Orders that need the student to act: accepted by the merchant and still
  // inside the payment window. Computed from the student's own orders (RLS),
  // live via Realtime, and re-counted when the earliest deadline passes
  // (a deadline expiring changes no row, so Realtime alone would go stale).
  useEffect(() => {
    let active = true
    let channel = null
    let deadlineTimer = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      async function refetchNeedsAction() {
        const { data, error } = await supabase
          .from('orders')
          .select('payment_deadline')
          .eq('student_id', user.id)
          .eq('status', 'confirmed')
          .gt('payment_deadline', new Date().toISOString())

        if (!active) return
        if (error) {
          console.error('[needs-action] fetch failed:', error)
          return
        }

        setNeedsActionCount(data.length)

        clearTimeout(deadlineTimer)
        if (data.length > 0) {
          const earliest = Math.min(...data.map((o) => new Date(o.payment_deadline).getTime()))
          deadlineTimer = setTimeout(refetchNeedsAction, Math.max(0, earliest - Date.now()) + 1000)
        }
      }

      await refetchNeedsAction()

      channel = supabase
        .channel(`needs-action:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `student_id=eq.${user.id}`,
          },
          () => refetchNeedsAction()
        )
        .subscribe()
    }

    init()

    return () => {
      active = false
      clearTimeout(deadlineTimer)
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // Unread dispute updates (user_notifications rows written by the
  // notify_dispute_change trigger). Cleared when the student opens Order History.
  useEffect(() => {
    let active = true
    let channel = null

    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || !active) return

      async function refetchDisputeUnread() {
        const { count, error } = await supabase
          .from('user_notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
          .like('type', 'dispute_%')

        if (error) {
          console.error('[dispute-unread] fetch failed:', error)
        } else if (active) {
          setDisputeUnreadCount(count || 0)
        }
      }

      await refetchDisputeUnread()

      channel = supabase
        .channel(`dispute-unread:${user.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'user_notifications',
            filter: `user_id=eq.${user.id}`,
          },
          () => refetchDisputeUnread()
        )
        .subscribe()
    }

    init()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  useEffect(() => {
    if (activeTab !== 'social') return

    let cancelled = false

    async function checkSocialProfile() {
      setCheckingSocialProfile(true)

      const { supabase } = await import('../lib/supabaseClient.js')

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (cancelled) return

      if (userError || !user) {
        setSocialHasProfile(false)
        setCheckingSocialProfile(false)
        return
      }

      const { data: profile, error: profileError } = await supabase
        .from('student_profiles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (cancelled) return

      if (profileError) {
        console.error('Failed to check Social profile:', profileError)
        setSocialHasProfile(false)
      } else {
        setSocialHasProfile(Boolean(profile))
      }

      setCheckingSocialProfile(false)
    }

    checkSocialProfile()

    return () => {
      cancelled = true
    }
  }, [activeTab])

  function handleSocialComplete() {
    setSocialHasProfile(true)
  }

  function handleActivity() {
    window.dispatchEvent(new CustomEvent('unipicks-open-activity'))
  }

  function handleMessages() {
    navigate('/dashboard/messages')
  }

  function handleNavigate(tab) {
    const routeTab = tab === 'home'
      ? 'deals'
      : tab === 'group-orders'
        ? 'orders'
        : tab
    navigate(`/dashboard/${routeTab}`)
  }


  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return children

      case 'search':
        return <StudentSearch />

      case 'social':
        if (checkingSocialProfile || socialHasProfile === null) {
          return (
            <div className="flex min-h-[400px] items-center justify-center">
              <p className="text-muted-foreground">Loading Social…</p>
            </div>
          )
        }

        if (!socialHasProfile) {
          return (
            <SocialOnboarding onComplete={handleSocialComplete} />
          )
        }

        return <Social />

      case 'advisor':
        return cloneElement(children, { advisorOpen: true })

      case 'orders':
        return <GroupOrders />

      case 'profile':
        return <ProfileTab needsActionCount={needsActionCount} disputeUnreadCount={disputeUnreadCount} />

      case 'messages':
        return (
          <Messages
            initialConversation={messageTarget}
            onInitialConversationOpened={() => setMessageTarget(null)}
          />
        )

      default:
        return children
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground">
      <StudentTopBar
        onMessages={handleMessages}
        unreadCount={unreadCount}
      />

      <div className="hidden shrink-0 border-b border-border/40 bg-background/80 px-4 py-2 backdrop-blur-xl md:block">
        <DesktopNav
          activeTab={activeTab}
          setActiveTab={handleNavigate}
        />
      </div>

      <main
        className="min-h-0 flex-1 px-4"
        style={{
          paddingTop: 'calc(var(--safe-area-top) + 56px)',
          paddingBottom: 'calc(var(--safe-area-bottom) + 64px)',
        }}
      >
        <div className="animate-fadeIn">
          {renderContent()}
        </div>
      </main>

      <StudentBottomNav
        activeTab={
          activeTab === 'orders'
            ? 'group-orders'
            : activeTab
        }
        onNavigate={handleNavigate}
        onCamera={() => setCameraOpen(true)}
        badges={{ profile: needsActionCount + disputeUnreadCount }}
        className="md:hidden"
      />
          {cameraOpen && <StudentCamera onClose={() => setCameraOpen(false)} />}
    </div>
  )
}
