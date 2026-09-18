import { useEffect, useState, cloneElement } from 'react'
import GroupOrders from '../pages/GroupOrders.jsx'
import Social from '../pages/Social.jsx'
import SocialOnboarding from '../pages/SocialOnboarding.jsx'
import ProfileTab from './ProfileTab.jsx'
import DesktopNav from './DesktopNav.jsx'
import Messages from '../pages/Messages.jsx'
import StudentTopBar from './StudentTopBar.jsx'
import StudentBottomNav from './StudentBottomNav.jsx'

export default function StudentLayout({ children, onLogout }) {
  const [activeTab, setActiveTab] = useState('home')
  const [socialHasProfile, setSocialHasProfile] = useState(null)
  const [checkingSocialProfile, setCheckingSocialProfile] = useState(false)
  const [messageTarget, setMessageTarget] = useState(null)

  useEffect(() => {
    function handleOpenStudentChat(event) {
      const target = event.detail

      if (!target?.userId) return

      setMessageTarget({
        otherId: target.userId,
        otherName: target.displayName || 'Student',
      })
      setActiveTab('messages')
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
    setActiveTab('messages')
  }

  function handleNavigate(tab) {
    if (tab === 'group-orders') {
      setActiveTab('orders')
      return
    }

    setActiveTab(tab)
  }

  function handleCamera() {
    window.dispatchEvent(new CustomEvent('unipicks-open-camera'))
  }

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return children

      case 'search':
        return children

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
        onActivity={handleActivity}
        onMessages={handleMessages}
      />

      <div className="hidden shrink-0 border-b border-border/40 bg-background/80 px-4 py-2 backdrop-blur-xl md:block">
        <DesktopNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />
      </div>

      <main
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
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
        onCamera={handleCamera}
        className="md:hidden"
      />
    </div>
  )
}
