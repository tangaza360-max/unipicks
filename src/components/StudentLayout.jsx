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
        return <ProfileTab />

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
        className="md:hidden"
      />
          {cameraOpen && <StudentCamera onClose={() => setCameraOpen(false)} />}
    </div>
  )
}
