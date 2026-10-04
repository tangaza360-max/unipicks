import React from 'react'
import ReactDOM from 'react-dom/client'
import { useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './index.css'
import { ThemeProvider } from './context/ThemeContext.jsx'
import Register from './pages/Register.jsx'
import RegisterMerchant from './pages/RegisterMerchant.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import AdminStudentView from './pages/AdminStudentView.jsx'
import Privacy from './pages/Privacy.jsx'
import Terms from './pages/Terms.jsx'
import DeleteAccount from './pages/DeleteAccount.jsx'
import PaymentCheckout from './pages/PaymentCheckout.jsx'
import DealDetail from './pages/DealDetail.jsx'
import OrderConfirmation from './pages/OrderConfirmation.jsx'
import { readAuthLinkError } from './lib/authLinkError.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initMonitoring } from './lib/monitoring.js'

function RouteTitle() {
  const { pathname } = useLocation()

  useEffect(() => {
    const dashboardTitles = {
      deals: 'Deals',
      search: 'Search',
      social: 'Social',
      advisor: 'Advisor',
      orders: 'Orders',
      stats: 'Stats',
      profile: 'Profile',
      stories: 'Stories',
      messages: 'Messages',
      jobs: 'Available Jobs',
      approvals: 'Approvals',
      'student-view': 'Students',
      analytics: 'Analytics',
      users: 'Users',
      settings: 'Settings',
      'activity-logs': 'Activity Logs',
      reviews: 'Reviews',
      disputes: 'Disputes',
      reports: 'Reports',
    }
    const dashboardTab = pathname.split('/')[2]
    const pageTitle = pathname.startsWith('/dashboard')
      ? dashboardTitles[dashboardTab] || 'Deals'
      : pathname === '/register/merchant'
        ? 'Merchant Registration'
        : pathname === '/register'
          ? 'Student Registration'
          : pathname === '/login'
            ? 'Login'
            : pathname === '/payment'
              ? 'Payment'
              : pathname === '/privacy'
                ? 'Privacy'
                : pathname === '/terms'
                  ? 'Terms'
                  : pathname === '/delete-account'
                    ? 'Delete Account'
                  : pathname === '/admin/student-view'
                    ? 'Students'
                    : pathname.endsWith('/confirm')
                      ? 'Confirm Order'
                      : pathname.startsWith('/deal/')
                        ? 'Deal'
                        : 'Unipicks'

    document.title = `${pageTitle} | Unipicks`
  }, [pathname])

  return null
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error) => {
      console.error('Service worker registration failed:', error)
    })
  })
}

initMonitoring()

// A failed email link lands here with the error in the URL; show it on the
// login page instead of silently redirecting to signup.
const authLinkError = readAuthLinkError()
if (authLinkError) {
  window.history.replaceState(null, '', `/login?link_error=${encodeURIComponent(authLinkError)}`)
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
      <BrowserRouter>
        <RouteTitle />
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/register/merchant" element={<RegisterMerchant />} />
          <Route path="/login" element={<Login />} />
          <Route path="/dashboard/*" element={<Dashboard />} />
          <Route path="/admin/student-view" element={<AdminStudentView />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/delete-account" element={<DeleteAccount />} />
          <Route path="/payment" element={<PaymentCheckout />} />
        <Route path="/deal/:id" element={<DealDetail />} />
        <Route path="/deal/:id/confirm" element={<OrderConfirmation />} />
          <Route path="*" element={<Navigate to="/register" replace />} />
        </Routes>
      </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
)
