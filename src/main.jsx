import React from 'react'
import ReactDOM from 'react-dom/client'
import { Suspense, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import './assets/fonts/fonts.css'
import './index.css'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { registerServiceWorker } from './lib/serviceWorker.js'
import Register from './pages/Register.jsx'
import Login from './pages/Login.jsx'
import { readAuthLinkError } from './lib/authLinkError.js'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { initMonitoring } from './lib/monitoring.js'
import { lazyPage } from './lib/lazyPage.js'
import PageLoading from './components/PageLoading.jsx'

// Screens load when opened (only Login and Register come with the first file).
const RegisterMerchant = lazyPage(() => import('./pages/RegisterMerchant.jsx'))
const ForgotPassword = lazyPage(() => import('./pages/ForgotPassword.jsx'))
const ResetPassword = lazyPage(() => import('./pages/ResetPassword.jsx'))
const Receipt = lazyPage(() => import('./pages/Receipt.jsx'))
const Dashboard = lazyPage(() => import('./pages/Dashboard.jsx'))
const AdminStudentView = lazyPage(() => import('./pages/AdminStudentView.jsx'))
const Privacy = lazyPage(() => import('./pages/Privacy.jsx'))
const Terms = lazyPage(() => import('./pages/Terms.jsx'))
const DeleteAccount = lazyPage(() => import('./pages/DeleteAccount.jsx'))
const PaymentCheckout = lazyPage(() => import('./pages/PaymentCheckout.jsx'))
const DealDetail = lazyPage(() => import('./pages/DealDetail.jsx'))
const OrderConfirmation = lazyPage(() => import('./pages/OrderConfirmation.jsx'))

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
        ? 'Business Registration'
        : pathname === '/register'
          ? 'Student Registration'
          : pathname === '/login'
            ? 'Login'
            : pathname === '/forgot-password'
              ? 'Forgot Password'
              : pathname === '/reset-password'
                ? 'Reset Password'
                : pathname.startsWith('/receipt/')
                  ? 'Receipt'
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

if (import.meta.env.PROD) registerServiceWorker()

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
        <Suspense fallback={<PageLoading />}>
        <Routes>
          <Route path="/register" element={<Register />} />
          <Route path="/register/merchant" element={<RegisterMerchant />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/receipt/:orderId" element={<Receipt />} />
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
        </Suspense>
      </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </React.StrictMode>,
)
