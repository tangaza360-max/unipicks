import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useTheme } from '../context/ThemeContext.jsx'
import DealsFeed from './DealsFeed.jsx'
import MerchantDeals from './MerchantDeals.jsx'
import MerchantAnalytics from './MerchantAnalytics.jsx'
import MerchantProfile from './MerchantProfile.jsx'
import MerchantStories from './MerchantStories.jsx'
import AIDealGenerator from './AIDealGenerator.jsx'
import AdminAnalytics from './AdminAnalytics.jsx'
import AdminApprovals from './AdminApprovals.jsx'
import AdminStudentView from './AdminStudentView.jsx'
import AdminUsers from './AdminUsers.jsx'
import AdminSettings from './AdminSettings.jsx'
import AdminActivityLogs from './AdminActivityLogs.jsx'
import AdminReviews from './AdminReviews.jsx'
import StudentLayout from '../components/StudentLayout.jsx'
import NotificationBell from '../components/NotificationBell.jsx'

export default function Dashboard() {
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [adminTab, setAdminTab] = useState('approvals')
  const [merchantTab, setMerchantTab] = useState('deals')
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    const fetchSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setUser(session.user)
      } else {
        setUser(null)
        navigate('/login')
      }
      setLoading(false)
    }
    fetchSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
          setUser(session?.user ?? null)
          setLoading(false)
        } else if (event === 'SIGNED_OUT') {
          setUser(null)
          setLoading(false)
          navigate('/login')
        }
      }
    )

    return () => {
      subscription?.unsubscribe()
    }
  }, [navigate])

  async function handleLogout() {
    await supabase.auth.signOut()
    setUser(null)
    navigate('/login')
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!user) {
    navigate('/login')
    return null
  }

  const role = user.user_metadata?.role
  const name = user.user_metadata?.full_name ?? user.email

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
            className="mt-4 bg-primary text-primary-foreground rounded-lg px-6 py-2"
          >
            Sign Out
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
        <div className="flex gap-2 border-b border-border pb-3 mb-4 flex-wrap">
          <button
            onClick={() => setMerchantTab('deals')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              merchantTab === 'deals'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            My Deals
          </button>
          <button
            onClick={() => setMerchantTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              merchantTab === 'analytics'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            📊 Analytics
          </button>
          <button
            onClick={() => setMerchantTab('profile')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              merchantTab === 'profile'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            ⚙️ Profile
          </button>
          <button
            onClick={() => setMerchantTab('ai-deal')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              merchantTab === 'ai-deal'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            ✨ AI Deal
          </button>
          <button
            onClick={() => setMerchantTab('stories')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              merchantTab === 'stories'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            📸 Stories
          </button>
        </div>
        {merchantTab === 'deals' && <MerchantDeals />}
        {merchantTab === 'analytics' && <MerchantAnalytics />}
        {merchantTab === 'profile' && <MerchantProfile merchantId={user.id} />}
        {merchantTab === 'ai-deal' && <AIDealGenerator />}
        {merchantTab === 'stories' && <MerchantStories merchantId={user.id} />}
      </>
    )
  } else if (role === 'delivery') {
    content = <DeliveryPlaceholder />
  } else if (role === 'admin') {
    content = (
      <>
        <div className="flex gap-2 border-b border-border pb-3 mb-4 flex-wrap">
          <button
            onClick={() => setAdminTab('approvals')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'approvals'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Merchant Approvals
          </button>
          <button
            onClick={() => setAdminTab('student-view')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'student-view'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            Student Lookup
          </button>
          <button
            onClick={() => setAdminTab('analytics')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'analytics'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            📊 Analytics
          </button>
          <button
            onClick={() => setAdminTab('users')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'users'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            👥 Users
          </button>
          <button
            onClick={() => setAdminTab('settings')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'settings'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            ⚙️ Settings
          </button>
          <button
            onClick={() => setAdminTab('activity-logs')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'activity-logs'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            📋 Activity Logs
          </button>
          <button
            onClick={() => setAdminTab('reviews')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              adminTab === 'reviews'
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground border border-border'
            }`}
          >
            📝 Reviews
          </button>
        </div>
        {adminTab === 'approvals' ? <AdminApprovals /> : 
         adminTab === 'student-view' ? <AdminStudentView /> : 
         adminTab === 'analytics' ? <AdminAnalytics /> : 
         adminTab === 'users' ? <AdminUsers /> :
         adminTab === 'settings' ? <AdminSettings /> :
         adminTab === 'activity-logs' ? <AdminActivityLogs /> :
         <AdminReviews />}
      </>
    )
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-semibold">Hi, {name}</h1>
            <p className="text-muted-foreground text-sm capitalize">{role} account</p>
          </div>
          <div className="flex items-center gap-3">
            {role === 'merchant' && <NotificationBell />}
            <button
              onClick={toggleTheme}
              className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-2 transition"
            >
              {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
            </button>
            {role !== 'student' && (
              <button
                onClick={handleLogout}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2 transition"
              >
                Log out
              </button>
            )}
          </div>
        </div>

        <div className="bg-card/60 border border-border rounded-lg p-6">
          {content}
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
