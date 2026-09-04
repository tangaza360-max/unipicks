import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function MerchantAnalytics() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [stats, setStats] = useState({
    totalRedemptions: 0,
    totalDeals: 0,
    activeDeals: 0,
    topDeals: [],
    recentRedemptions: [],
    dailyData: [],
  })

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics() {
    setLoading(true)
    setError('')

    const { data: userData } = await supabase.auth.getUser()
    if (!userData.user) {
      setLoading(false)
      return
    }

    const userId = userData.user.id

    // 1. Get all deals for this merchant
    const { data: deals, error: dealsError } = await supabase
      .from('deals')
      .select('id, title, business_name, active, created_at, price, discount_percent')
      .eq('merchant_id', userId)

    if (dealsError) {
      setError(dealsError.message)
      setLoading(false)
      return
    }

    const dealIds = deals?.map(d => d.id) || []

    // 2. Get all redemptions for these deals
    let allRedemptions = []
    if (dealIds.length > 0) {
      const { data: redemptions, error: redemptionsError } = await supabase
        .from('redemptions')
        .select('*')
        .in('deal_id', dealIds)
        .order('created_at', { ascending: false })

      if (!redemptionsError) {
        allRedemptions = redemptions || []
      }
    }

    // 3. Calculate stats
    const totalRedemptions = allRedemptions.length
    const totalDeals = deals?.length || 0
    const activeDeals = deals?.filter(d => d.active).length || 0

    // 4. Top deals by redemptions
    const redemptionCounts = {}
    allRedemptions.forEach(r => {
      redemptionCounts[r.deal_id] = (redemptionCounts[r.deal_id] || 0) + 1
    })

    const topDeals = deals
      ?.map(deal => ({
        ...deal,
        redemptionCount: redemptionCounts[deal.id] || 0,
      }))
      .sort((a, b) => b.redemptionCount - a.redemptionCount)
      .slice(0, 5) || []

    // 5. Recent redemptions (last 10)
    const recentRedemptions = allRedemptions.slice(0, 10).map(r => {
      const deal = deals?.find(d => d.id === r.deal_id)
      return {
        ...r,
        deal_title: deal?.title || 'Unknown deal',
        business_name: deal?.business_name || 'Unknown business',
      }
    })

    // 6. Daily data (last 7 days)
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - i)
      return d.toISOString().split('T')[0]
    }).reverse()

    const dailyData = last7Days.map(date => {
      const count = allRedemptions.filter(r => r.created_at?.startsWith(date)).length
      return { date, count }
    })

    setStats({
      totalRedemptions,
      totalDeals,
      activeDeals,
      topDeals,
      recentRedemptions,
      dailyData,
    })
    setLoading(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-muted-foreground">Loading analytics…</p>
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

  const { totalRedemptions, totalDeals, activeDeals, topDeals, recentRedemptions, dailyData } = stats

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl font-semibold text-foreground">Analytics</h2>
        <p className="text-muted-foreground text-sm">Track your deal performance and student engagement</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Orders</p>
          <p className="font-display text-3xl font-bold text-foreground">{totalRedemptions}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Total Deals</p>
          <p className="font-display text-3xl font-bold text-foreground">{totalDeals}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-sm text-muted-foreground">Active Deals</p>
          <p className="font-display text-3xl font-bold text-foreground">{activeDeals}</p>
        </div>
      </div>

      {/* Daily chart (simple bar) */}
      {dailyData.length > 0 && (
        <div className="bg-card border border-border rounded-lg p-4">
          <h3 className="font-display text-sm font-semibold text-foreground mb-3">Last 7 Days</h3>
          <div className="flex items-end gap-2 h-24">
            {dailyData.map((day, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                <div
                  className="w-full bg-primary rounded-sm transition-all"
                  style={{ height: `${Math.max(4, (day.count / Math.max(1, Math.max(...dailyData.map(d => d.count)))) * 80)}px` }}
                />
                <span className="text-[10px] text-muted-foreground">
                  {new Date(day.date).toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span className="text-[10px] text-muted-foreground">{day.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top deals */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="font-display text-sm font-semibold text-foreground mb-3">Top Deals</h3>
        {topDeals.length === 0 ? (
          <p className="text-sm text-muted-foreground">No deals yet</p>
        ) : (
          <div className="space-y-2">
            {topDeals.map((deal, idx) => (
              <div key={deal.id} className="flex items-center justify-between py-1 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground w-5">#{idx + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{deal.title}</p>
                    <p className="text-xs text-muted-foreground">{deal.business_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-foreground">{deal.redemptionCount}</span>
                  <span className="text-xs text-muted-foreground">orders</span>
                  {deal.active ? (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary">Active</span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">Paused</span>
                  )}
                </div>
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
          <div className="space-y-2">
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