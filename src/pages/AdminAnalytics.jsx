import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function AdminAnalytics() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalStudents: 0,
    totalMerchants: 0,
    totalAdmins: 0,
    totalDeals: 0,
    totalRedemptions: 0,
    activeDeals: 0,
    pendingMerchants: 0,
    recentRedemptions: [],
    dailyRedemptions: [],
    topDeals: [],
  })

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    setLoading(true)
    setError('')

    try {
      // 1. Get all users (auth.users is restricted, so we use a view or RPC)
      // Instead, we'll count from existing tables and use the admin function we created earlier
      const { data: students, error: studentsError } = await supabase
        .from('student_profiles')
        .select('id')

      if (studentsError) {
        console.warn('Could not fetch students:', studentsError)
      }

      // 2. Get all merchants (from merchant_profiles)
      const { data: merchants, error: merchantsError } = await supabase
        .from('merchant_profiles')
        .select('id, approved')

      if (merchantsError) {
        console.warn('Could not fetch merchants:', merchantsError)
      }

      // 3. Get all deals
      const { data: deals, error: dealsError } = await supabase
        .from('deals')
        .select('id, active, merchant_id, created_at')

      if (dealsError) {
        console.warn('Could not fetch deals:', dealsError)
      }

      // 4. Get all redemptions
      const { data: redemptions, error: redemptionsError } = await supabase
        .from('redemptions')
        .select('*, deals(title, business_name)')
        .order('created_at', { ascending: false })

      if (redemptionsError) {
        console.warn('Could not fetch redemptions:', redemptionsError)
      }

      // 5. Get all users from auth via the RPC function (if available)
      // We'll use the student_profiles view we created earlier
      const totalStudents = students?.length || 0
      const totalMerchants = merchants?.length || 0
      const totalUsers = totalStudents + totalMerchants + 1 // +1 for admin (we know at least one admin exists)

      const totalDeals = deals?.length || 0
      const activeDeals = deals?.filter(d => d.active).length || 0
      const totalRedemptions = redemptions?.length || 0
      const pendingMerchants = merchants?.filter(m => !m.approved).length || 0

      // Recent redemptions (last 10)
      const recentRedemptions = (redemptions || []).slice(0, 10).map(r => ({
        ...r,
        deal_title: r.deals?.title || 'Unknown deal',
        business_name: r.deals?.business_name || 'Unknown business',
      }))

      // Daily redemptions (last 7 days)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const d = new Date()
        d.setDate(d.getDate() - i)
        return d.toISOString().split('T')[0]
      }).reverse()

      const dailyRedemptions = last7Days.map(date => {
        const count = (redemptions || []).filter(r => r.created_at?.startsWith(date)).length
        return { date, count }
      })

      // Top deals by redemptions
      const redemptionCounts = {}
      ;(redemptions || []).forEach(r => {
        redemptionCounts[r.deal_id] = (redemptionCounts[r.deal_id] || 0) + 1
      })

      const topDeals = (deals || [])
        .map(deal => ({
          ...deal,
          redemptionCount: redemptionCounts[deal.id] || 0,
        }))
        .sort((a, b) => b.redemptionCount - a.redemptionCount)
        .slice(0, 5)

      setStats({
        totalUsers,
        totalStudents,
        totalMerchants,
        totalAdmins: 1,
        totalDeals,
        totalRedemptions,
        activeDeals,
        pendingMerchants,
        recentRedemptions,
        dailyRedemptions,
        topDeals,
      })
    } catch (err) {
      setError(err.message || 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading platform analytics…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Could not load analytics: {error}</p>
      </div>
    )
  }

  const {
    totalUsers,
    totalStudents,
    totalMerchants,
    totalAdmins,
    totalDeals,
    totalRedemptions,
    activeDeals,
    pendingMerchants,
    recentRedemptions,
    dailyRedemptions,
    topDeals,
  } = stats

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">Platform Analytics</h2>
        <p className="text-muted-foreground text-sm">Overview of users, deals, and activity</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Users</p>
          <p className="font-display text-3xl font-bold text-foreground">{totalUsers}</p>
          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
            <span>Students: {totalStudents}</span>
            <span>Merchants: {totalMerchants}</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Deals</p>
          <p className="font-display text-3xl font-bold text-foreground">{totalDeals}</p>
          <div className="flex gap-2 text-xs text-muted-foreground mt-1">
            <span>Active: {activeDeals}</span>
            <span>Paused: {totalDeals - activeDeals}</span>
          </div>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Orders</p>
          <p className="font-display text-3xl font-bold text-foreground">{totalRedemptions}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Pending Merchants</p>
          <p className="font-display text-3xl font-bold text-foreground">{pendingMerchants}</p>
        </div>
      </div>

      {/* Daily chart */}
      {dailyRedemptions.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-display text-sm font-semibold text-foreground mb-3">Orders (Last 7 Days)</h3>
          <div className="flex items-end gap-2 h-24">
            {dailyRedemptions.map((day, idx) => {
              const max = Math.max(1, Math.max(...dailyRedemptions.map(d => d.count)))
              const height = Math.max(4, (day.count / max) * 80)
              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-primary rounded-sm transition-all"
                    style={{ height: `${height}px` }}
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{day.count}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Top deals */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-display text-sm font-semibold text-foreground mb-3">Top Deals</h3>
        {topDeals.length === 0 || topDeals.every(d => d.redemptionCount === 0) ? (
          <p className="text-sm text-muted-foreground">No orders yet</p>
        ) : (
          <div className="space-y-2">
            {topDeals.map((deal, idx) => (
              <div key={deal.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground w-5">#{idx + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{deal.title || 'Untitled'}</p>
                    <p className="text-xs text-muted-foreground">Deal ID: {deal.id.slice(0, 8)}</p>
                  </div>
                </div>
                <span className="text-sm font-semibold text-foreground">{deal.redemptionCount} orders</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Recent orders */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-display text-sm font-semibold text-foreground mb-3">Recent Orders</h3>
        {recentRedemptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No orders yet</p>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {recentRedemptions.map((r, idx) => (
              <div key={r.id || idx} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                <div>
                  <p className="text-sm text-foreground">{r.student_name}</p>
                  <p className="text-xs text-muted-foreground">{r.deal_title} · {r.business_name}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {r.created_at ? new Date(r.created_at).toLocaleDateString() : '—'}
                  </p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    r.status === 'redeemed'
                      ? 'bg-primary/10 text-primary'
                      : 'bg-muted text-muted-foreground'
                  }`}>
                    {r.status || 'pending'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}