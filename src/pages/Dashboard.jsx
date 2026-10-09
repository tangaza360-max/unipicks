import { Suspense, useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { liveChannel } from '../lib/realtime.js'
import { useTheme } from '../context/ThemeContext.jsx'
import DealsFeed from './DealsFeed.jsx'
import { ClipboardCheck, ClipboardList, GraduationCap, BarChart3, Users, Settings, FileClock, FileText, Camera, MessageCircle, ShoppingBag, Sun, Moon, LogOut, AlertCircle, Flag } from 'lucide-react'
import Logo from '../components/Logo.jsx'
import StudentLayout from '../components/StudentLayout.jsx'
import NotificationBell from '../components/NotificationBell.jsx'
import BusinessBottomNav from '../components/BusinessBottomNav.jsx'
import PhoneAlertsCard from '../components/PhoneAlertsCard.jsx'
import { forgetThisPhone } from '../lib/pushNotifications.js'
import { lazyPage } from '../lib/lazyPage.js'
import PageLoading from '../components/PageLoading.jsx'

// Loaded only when opened, so they stay out of the first download.
const MerchantDeals = lazyPage(() => import('./MerchantDeals.jsx'))
const MerchantOrders = lazyPage(() => import('./MerchantOrders.jsx'))
const MerchantAnalytics = lazyPage(() => import('./MerchantAnalytics.jsx'))
const MerchantProfile = lazyPage(() => import('./MerchantProfile.jsx'))
const MerchantStories = lazyPage(() => import('./MerchantStories.jsx'))
const Messages = lazyPage(() => import('./Messages.jsx'))
const AdminAnalytics = lazyPage(() => import('./AdminAnalytics.jsx'))
const AdminApprovals = lazyPage(() => import('./AdminApprovals.jsx'))
const AdminStudentView = lazyPage(() => import('./AdminStudentView.jsx'))
const AdminUsers = lazyPage(() => import('./AdminUsers.jsx'))
const AdminSettings = lazyPage(() => import('./AdminSettings.jsx'))
const AdminActivityLogs = lazyPage(() => import('./AdminActivityLogs.jsx'))
const AdminReviews = lazyPage(() => import('./AdminReviews.jsx'))
const AdminDisputes = lazyPage(() => import('./AdminDisputes.jsx'))
const AdminReports = lazyPage(() => import('./AdminReports.jsx'))

export default function Dashboard() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const dashboardTab = pathname.split('/')[2] || ''
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)
  const [merchantUnreadCount, setMerchantUnreadCount] = useState(0)
  const [pendingOrderCount, setPendingOrderCount] = useState(0)
  const [openDisputeCount, setOpenDisputeCount] = useState(0)
  const [openReportCount, setOpenReportCount] = useState(0)
  const [businessName, setBusinessName] = useState('')
  // The signed-in user's id; live features below restart only when it changes.
  const userIdRef = useRef(null)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        userIdRef.current = session.user.id
        setUser(session.user)
      const { data: trustedRole } = await supabase.rpc('get_my_role')
      setRole(trustedRole)
      } else {
        setUser(null)
        navigate('/login', { replace: true })
      }
      setLoading(false)
    }
    fetchSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
  async (event, session) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      // Supabase repeats these for the same person (hourly token renewal,
      // returning to the tab). Only a different person needs a new role.
      const nextId = session?.user?.id ?? null
      const sameUser = nextId !== null && nextId === userIdRef.current
      userIdRef.current = nextId
      setUser(session?.user ?? null)
      if (!sameUser) {
        const { data: trustedRole } = session
          ? await supabase.rpc('get_my_role')
          : { data: null }
        setRole(trustedRole)
      }
      setLoading(false)
    } else if (event === 'SIGNED_OUT') {
      userIdRef.current = null
      setUser(null)
      setRole(null)
      setLoading(false)
      navigate('/login', { replace: true })
    }
  }
)

return () => {
      subscription?.unsubscribe()
    }
  }, [navigate])

  const userId = user?.id ?? null

  useEffect(() => {
    if (loading || !role) return

    const roleTabs = {
      student: ['deals', 'search', 'social', 'advisor', 'orders', 'profile', 'messages'],
      merchant: ['deals', 'orders', 'stats', 'profile', 'stories', 'messages'],
      delivery: ['jobs'],
      admin: ['approvals', 'student-view', 'analytics', 'users', 'settings', 'activity-logs', 'reviews', 'disputes', 'reports'],
    }
    const defaultTab = role === 'admin' ? 'approvals' : role === 'delivery' ? 'jobs' : 'deals'

    if (!roleTabs[role]?.includes(dashboardTab)) {
      navigate(`/dashboard/${defaultTab}`, { replace: true })
    }
  }, [dashboardTab, loading, navigate, role])

  // Merchant header: the account belongs to the business, so show the
  // business name students see on deals and chats (merchant_profiles).
  useEffect(() => {
    if (role !== 'merchant' || !userId) return
    let active = true

    supabase
      .from('merchant_profiles')
      .select('business_name')
      .eq('id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error('[merchant header] business name fetch failed:', error)
        else if (active) setBusinessName(data?.business_name?.trim() || '')
      })

    return () => {
      active = false
    }
  }, [role, userId])

  // Merchant pending-order badge: count of orders awaiting the merchant's accept/decline.
  useEffect(() => {
    if (role !== 'merchant' || !userId) return

    let active = true
    let channel = null

    async function init() {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('merchant_id', userId)
        .eq('status', 'pending_confirmation')

      if (error) {
        console.error('[merchant pending-orders] initial fetch failed:', error)
      } else if (active) {
        setPendingOrderCount(count || 0)
      }

      channel = liveChannel(`merchant-orders-count:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'orders',
            filter: `merchant_id=eq.${userId}`,
          },
          async () => {
            const { count, error: refetchError } = await supabase
              .from('orders')
              .select('*', { count: 'exact', head: true })
              .eq('merchant_id', userId)
              .eq('status', 'pending_confirmation')
            if (!refetchError && active) setPendingOrderCount(count || 0)
          }
        )
        .subscribe()
    }

    init()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [role, userId])

  // Merchant unread message badge: fetch on mount, update in real-time.
  // Only runs when the current user is a merchant.
  useEffect(() => {
    if (role !== 'merchant' || !userId) return

    let active = true
    let channel = null

    async function init() {
      const { count, error } = await supabase
        .from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('receiver_id', userId)
        .eq('is_read', false)

      if (error) {
        console.error('[merchant unread] initial fetch failed:', error)
      } else if (active) {
        setMerchantUnreadCount(count || 0)
      }

      channel = liveChannel(`merchant-unread:${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'chat_messages',
            filter: `receiver_id=eq.${userId}`,
          },
          async () => {
            const { count, error: refetchError } = await supabase
              .from('chat_messages')
              .select('*', { count: 'exact', head: true })
              .eq('receiver_id', userId)
              .eq('is_read', false)
            if (!refetchError && active) setMerchantUnreadCount(count || 0)
          }
        )
        .subscribe()
    }

    init()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [role, userId])

  // Admin reports badge (fix 8): reports not yet decided. Refreshed every
  // minute and whenever the admin opens a tab; new reports also reach the
  // admin bell via user_notifications.
  useEffect(() => {
    if (role !== 'admin' || !userId) return
    let active = true

    async function refetchOpenReports() {
      const { count, error } = await supabase
        .from('student_reports')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'reviewing'])
      if (error) {
        console.error('[admin reports] count failed:', error)
      } else if (active) {
        setOpenReportCount(count || 0)
      }
    }

    refetchOpenReports()
    const timer = setInterval(refetchOpenReports, 60_000)
    return () => {
      active = false
      clearInterval(timer)
    }
  }, [role, userId, dashboardTab])

  // Admin dispute badge: count of orders with an open dispute, live.
  // Realtime filters match the NEW row, so filtering on 'open' alone would miss
  // the open -> under_review/resolved/rejected transition and leave the count
  // stale. Listen to every dispute state, then re-count only 'open'.
  useEffect(() => {
    if (role !== 'admin' || !userId) return

    let active = true
    let channel = null

    async function refetchOpenDisputes() {
      const { count, error } = await supabase
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .eq('dispute_status', 'open')

      if (error) {
        console.error('[admin disputes] count failed:', error)
      } else if (active) {
        setOpenDisputeCount(count || 0)
      }
    }

    refetchOpenDisputes()

    channel = liveChannel(`admin-open-disputes:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: 'dispute_status=in.(open,under_review,resolved,rejected)',
        },
        () => refetchOpenDisputes()
      )
      .subscribe()

    return () => {
      active = false
      if (channel) supabase.removeChannel(channel)
    }
  }, [role, userId])

  async function handleLogout() {
    await forgetThisPhone()
    await supabase.auth.signOut()
    setUser(null)
    navigate('/login', { replace: true })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user) {
    navigate('/login', { replace: true })
    return null
  }

  const name = user.user_metadata?.full_name ?? user.email
  const merchantTitle =
    businessName || user.user_metadata?.business_name?.trim() || user.user_metadata?.full_name || user.email

  if (!role) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 px-4">
        <div className="text-center">
          <h2 className="font-display text-2xl font-semibold">Account Not Set Up</h2>
          <p className="text-muted-foreground mt-2">
            Your account doesn't have a role assigned yet. Please contact support.
          </p>
          <button
            onClick={handleLogout}
            className="mt-4 flex items-center gap-2 mx-auto bg-primary text-primary-foreground rounded-lg px-6 py-2"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </div>
    )
  }

  let content

  if (role === 'student') {
    content = (
      <StudentLayout onLogout={handleLogout}>
        <DealsFeed />
      </StudentLayout>
    )
  } else if (role === 'merchant') {
    content = (
      <>
        {/* Tabs on laptops; phones use BusinessBottomNav (style guide §7). */}
        <div className="hidden md:flex flex-wrap gap-2 border-b border-border pb-4 mb-4">
          {[
            { id: 'deals', label: 'Deals', icon: ClipboardList },
            { id: 'orders', label: 'Orders', icon: ShoppingBag },
            { id: 'stats', label: 'Stats', icon: BarChart3 },
            { id: 'profile', label: 'Profile', icon: Settings },
            { id: 'stories', label: 'Stories', icon: Camera },
            { id: 'messages', label: 'Messages', icon: MessageCircle },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => navigate(`/dashboard/${tab.id}`)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  dashboardTab === tab.id
                    ? 'bg-accent text-background-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.id === 'orders' && pendingOrderCount > 0 && (
                  <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    {pendingOrderCount > 99 ? '99+' : pendingOrderCount}
                  </span>
                )}
                {tab.id === 'messages' && merchantUnreadCount > 0 && (
                  <span className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
                    {merchantUnreadCount > 99 ? '99+' : merchantUnreadCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="mb-4">
          <PhoneAlertsCard variant="prompt" audience="merchant" />
        </div>

        {dashboardTab === 'deals' && <MerchantDeals />}
        {dashboardTab === 'orders' && <MerchantOrders />}
        {dashboardTab === 'stats' && <MerchantAnalytics />}
        {dashboardTab === 'profile' && (
          <MerchantProfile merchantId={user.id} onBusinessNameChange={setBusinessName} onLogout={handleLogout} />
        )}
        {dashboardTab === 'stories' && <MerchantStories />}
        {dashboardTab === 'messages' && <Messages />}

        <BusinessBottomNav
          activeTab={dashboardTab}
          onNavigate={(tab) => navigate(`/dashboard/${tab}`)}
          pendingOrders={pendingOrderCount}
          unreadMessages={merchantUnreadCount}
        />
      </>
    )
  } else if (role === 'delivery') {
    content = <DeliveryPlaceholder />
  } else if (role === 'admin') {
    content = (
      <>
        <div className="flex gap-2 border-b border-border pb-3 mb-4 flex-wrap">
          {[
            { id: 'approvals', label: 'Approvals', icon: ClipboardCheck },
            { id: 'student-view', label: 'Students', icon: GraduationCap },
            { id: 'analytics', label: 'Analytics', icon: BarChart3 },
            { id: 'users', label: 'Users', icon: Users },
            { id: 'settings', label: 'Settings', icon: Settings },
            { id: 'activity-logs', label: 'Activity logs', icon: FileClock },
            { id: 'reviews', label: 'Reviews', icon: FileText },
            { id: 'disputes', label: 'Disputes', icon: AlertCircle },
            { id: 'reports', label: 'Reports', icon: Flag },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => navigate(`/dashboard/${tab.id}`)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  dashboardTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.id === 'disputes' && openDisputeCount > 0 && (
                  <span
                    className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
                    aria-label={`${openDisputeCount} open dispute${openDisputeCount === 1 ? '' : 's'}`}
                  >
                    {openDisputeCount > 99 ? '99+' : openDisputeCount}
                  </span>
                )}
                {tab.id === 'reports' && openReportCount > 0 && (
                  <span
                    className="ml-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
                    aria-label={`${openReportCount} open report${openReportCount === 1 ? '' : 's'}`}
                  >
                    {openReportCount > 99 ? '99+' : openReportCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {dashboardTab === 'approvals' ? <AdminApprovals /> : 
         dashboardTab === 'student-view' ? <AdminStudentView /> : 
         dashboardTab === 'analytics' ? <AdminAnalytics /> : 
         dashboardTab === 'users' ? <AdminUsers /> :
         dashboardTab === 'settings' ? <AdminSettings /> :
         dashboardTab === 'activity-logs' ? <AdminActivityLogs /> :
         dashboardTab === 'disputes' ? <AdminDisputes /> :
         dashboardTab === 'reports' ? <AdminReports /> :
         <AdminReviews />}
      </>
    )
  }

  if (role === 'student') {
    return content
  }

  return (
    <div className={`min-h-screen px-4 pt-6 md:py-10 ${role === 'merchant' ? 'pb-28 md:pb-10' : 'pb-10'}`}>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo size={32} className="text-accent" />
            <div>
              {role === 'merchant' ? (
                <>
                  <h1 className="font-display text-2xl font-semibold">{merchantTitle}</h1>
                  <p className="text-muted-foreground text-sm">Business account</p>
                </>
              ) : (
                <>
                  <h1 className="font-display text-2xl font-semibold">Hi, {name}</h1>
                  <p className="text-muted-foreground text-sm capitalize">{role} account</p>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {role === 'merchant' && <NotificationBell />}
            {role === 'admin' && <NotificationBell includeMerchantInbox={false} />}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-11 h-11 text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {role !== 'student' && (
              <button
                onClick={handleLogout}
                aria-label="Log out"
                className={`${role === 'merchant' ? 'hidden md:flex' : 'flex'} items-center justify-center w-11 h-11 text-muted-foreground hover:text-foreground border border-border rounded-lg transition`}
              >
                <LogOut size={18} />
              </button>
            )}
          </div>
        </div>

        <div className="md:bg-card/60 md:border md:border-border md:rounded-lg md:p-6">
          <Suspense fallback={<PageLoading />}>{content}</Suspense>
        </div>
      </div>
    </div>
  )
}

function DeliveryPlaceholder() {
  return (
    <div className="space-y-2">
      <h2 className="font-display text-lg font-semibold">Available jobs</h2>
      <p className="text-muted-foreground text-sm">
        This is where delivery jobs will show up once ordering is built. Coming later.
      </p>
    </div>
  )
}
