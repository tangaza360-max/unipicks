import { useEffect, useState, cloneElement } from 'react'
import { Home, Users, User, MessageCircle, LogOut, Search, Sparkles } from 'lucide-react'
import GroupOrders from '../pages/GroupOrders.jsx'
import Social from '../pages/Social.jsx'
import SocialOnboarding from '../pages/SocialOnboarding.jsx'
import ProfileTab from './ProfileTab.jsx'
import DesktopNav from './DesktopNav.jsx'
import Messages from '../pages/Messages.jsx'
import Logo from './Logo'

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

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return children

      case 'search':
        return children

      case 'social':
        if (checkingSocialProfile || socialHasProfile === null) {
          return (
            <div className="min-h-[400px] flex items-center justify-center">
              <p className="text-muted-foreground">
                Loading Social…
              </p>
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
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Desktop Header with Navigation */}
      <header className="hidden md:flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/40 bg-card/60 sticky top-0 z-40 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <Logo size={24} className="text-accent" />
          <span className="font-display text-xl font-bold text-foreground">
            Unipicks
          </span>
        </div>

        <DesktopNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('messages')}
            aria-label="Messages"
            className={`flex items-center justify-center w-10 h-10 transition-colors rounded-lg hover:bg-muted/50 ${
              activeTab === 'messages'
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <MessageCircle size={18} />
          </button>

          <button
            onClick={onLogout}
            aria-label="Log out"
            className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted/50"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Mobile Header */}
      <header
        className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border/40 bg-card/60 sticky top-0 z-40 backdrop-blur-sm"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <div className="flex items-center gap-2">
          <Logo size={22} className="text-accent" />
          <span className="font-display text-lg font-bold text-foreground">
            Unipicks
          </span>
        </div>

        <button
          onClick={() => setActiveTab('messages')}
          aria-label="Messages"
          className={`flex items-center justify-center w-9 h-9 transition-colors rounded-lg ${
            activeTab === 'messages'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <MessageCircle size={22} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 px-4 md:px-6 py-4 pb-24 md:pb-6 overflow-y-auto">
        <div className="animate-fadeIn">
          {renderContent()}
        </div>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/40 flex items-center justify-around"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Home */}
        <button
          onClick={() => setActiveTab('home')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'home'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <Home size={22} />
          <span className="text-[10px] font-medium">Home</span>

          {activeTab === 'home' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
          )}
        </button>

        {/* Search */}
        <button
          onClick={() => setActiveTab('search')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'search'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <Search size={22} />
          <span className="text-[10px] font-medium">Search</span>

          {activeTab === 'search' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
          )}
        </button>

        {/* Social */}
        <button
          onClick={() => setActiveTab('social')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'social'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <Sparkles size={22} />
          <span className="text-[10px] font-medium">Social</span>

          {activeTab === 'social' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
          )}
        </button>

        {/* Orders */}
        <button
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'orders'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <Users size={22} />
          <span className="text-[10px] font-medium">Group Orders</span>

          {activeTab === 'orders' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
          )}
        </button>

        {/* Profile */}
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex flex-col items-center justify-center gap-1 flex-1 py-2 transition-colors select-none relative ${
            activeTab === 'profile'
              ? 'text-primary'
              : 'text-muted-foreground'
          }`}
        >
          <User size={22} />
          <span className="text-[10px] font-medium">Profile</span>

          {activeTab === 'profile' && (
            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
          )}
        </button>
      </nav>
    </div>
  )
}