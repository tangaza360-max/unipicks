import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { useTheme } from '../context/ThemeContext.jsx'
import DealsFeed from './DealsFeed.jsx'
import MerchantDeals from './MerchantDeals.jsx'
import MerchantAnalytics from './MerchantAnalytics.jsx'
import MerchantProfile from './MerchantProfile.jsx'
import MerchantStories from './MerchantStories.jsx'
import Messages from './Messages.jsx'
import { ClipboardCheck, ClipboardList, GraduationCap, BarChart3, Users, Settings, FileClock, FileText, Camera, MessageCircle, Sun, Moon, LogOut } from 'lucide-react'
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
        {/* --- Improved merchant tabs (pill style) --- */}
        <div className="flex flex-wrap gap-2 border-b border-border pb-4 mb-4">
          {[
            { id: 'deals', label: 'Deals', icon: ClipboardList },
            { id: 'stats', label: 'Stats', icon: BarChart3 },
            { id: 'profile', label: 'Profile', icon: Settings },
            { id: 'stories', label: 'Stories', icon: Camera },
            { id: 'messages', label: 'Messages', icon: MessageCircle },
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setMerchantTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 ${
                  merchantTab === tab.id
                    ? 'bg-accent text-background-foreground shadow-sm'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {merchantTab === 'deals' && <MerchantDeals />}
        {merchantTab === 'stats' && <MerchantAnalytics />}
        {merchantTab === 'profile' && <MerchantProfile merchantId={user.id} />}
        {merchantTab === 'stories' && <MerchantStories />}
        {merchantTab === 'messages' && <Messages />}
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
          ].map((tab) => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setAdminTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  adminTab === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground border border-border'
                }`}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            )
          })}
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
          <div className="flex items-center gap-2">
            {role === 'merchant' && <NotificationBell />}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {role !== 'student' && (
              <button
                onClick={handleLogout}
                aria-label="Log out"
                className="flex items-center justify-center w-10 h-10 text-muted-foreground hover:text-foreground border border-border rounded-lg transition"
              >
                <LogOut size={18} />
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
