import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

function joinedOn(iso) {
  return iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date'
}

// What an admin needs before approving or deactivating a business: when it
// joined, how to reach it, its address and RDB number, and (approved) how
// many deals it has switched on (active).
function BusinessDetails({ profile, email, liveDeals }) {
  return (
    <div className="min-w-0 space-y-0.5 text-sm">
      <p className="font-medium text-foreground">{profile.business_name || 'Unnamed business'}</p>
      <p className="text-muted-foreground">
        Joined {joinedOn(profile.created_at)}
        {liveDeals != null && ` · ${liveDeals} active deal${liveDeals === 1 ? '' : 's'}`}
      </p>
      <p className="flex flex-wrap gap-x-3 text-muted-foreground">
        {profile.phone ? (
          <a href={`tel:${profile.phone.replace(/\s+/g, '')}`} className="inline-flex min-h-11 items-center text-accent underline underline-offset-2">
            {profile.phone}
          </a>
        ) : (
          <span className="inline-flex min-h-11 items-center">No phone given</span>
        )}
        {email && (
          <a href={`mailto:${email}`} className="inline-flex min-h-11 min-w-0 items-center break-all text-accent underline underline-offset-2">
            {email}
          </a>
        )}
      </p>
      <p className="text-muted-foreground">{profile.address || 'No address given'}</p>
      <p className="text-muted-foreground">{profile.rdb_number ? `RDB number: ${profile.rdb_number}` : 'No RDB number given'}</p>
    </div>
  )
}

export default function AdminApprovals() {
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [emails, setEmails] = useState({})
  const [liveDeals, setLiveDeals] = useState({})

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    setLoading(true)
    const { data, error: fetchError } = await supabase
      .from('merchant_profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(fetchError.message)
    } else {
      setPending(data.filter((p) => !p.approved))
      setApproved(data.filter((p) => p.approved))
    }
    setLoading(false)

    // Extras (the list works without them): emails come from the admin-only
    // get_all_merchants; active deals are counted from the deals table.
    const [merchants, deals] = await Promise.all([
      supabase.rpc('get_all_merchants'),
      supabase.from('deals').select('merchant_id').eq('active', true),
    ])
    if (!merchants.error) setEmails(Object.fromEntries((merchants.data || []).map((m) => [m.id, m.email])))
    if (!deals.error) {
      const counts = {}
      for (const d of deals.data || []) counts[d.merchant_id] = (counts[d.merchant_id] || 0) + 1
      setLiveDeals(counts)
    }
  }

  async function handleApprove(profile) {
    const { error: updateError } = await supabase.from('merchant_profiles').update({ approved: true }).eq('id', profile.id)
    if (!updateError) await supabase.rpc('log_admin_action', {
      action: 'approve_merchant', target_type: 'merchant', target_id: profile.id,
      target_name: profile.business_name || 'Unnamed business', details: {},
    })
    loadProfiles()
  }

  async function handleReject(profile) {
    if (window.confirm('Permanently delete this business profile? This cannot be undone.')) {
      const { error: deleteError } = await supabase.from('merchant_profiles').delete().eq('id', profile.id)
      if (!deleteError) await supabase.rpc('log_admin_action', {
        action: 'reject_merchant', target_type: 'merchant', target_id: profile.id,
        target_name: profile.business_name || 'Unnamed business', details: {},
      })
      loadProfiles()
    }
  }

  async function handleDeactivate(profile) {
    if (window.confirm('Deactivate this business? They will lose access until re-approved.')) {
      const { error: updateError } = await supabase.from('merchant_profiles').update({ approved: false }).eq('id', profile.id)
      if (!updateError) await supabase.rpc('log_admin_action', {
        action: 'deactivate_merchant', target_type: 'merchant', target_id: profile.id,
        target_name: profile.business_name || 'Unnamed business', details: {},
      })
      loadProfiles()
    }
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading…</p>
  }

  if (error) {
    return <p className="text-sm text-red-400">Couldn't load businesses: {error}</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Pending businesses</h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">No businesses waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((profile) => (
              <div
                key={profile.id}
                className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3"
              >
                <BusinessDetails profile={profile} email={emails[profile.id]} />
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(profile)}
                    className="min-h-11 text-sm bg-accent text-background-foreground font-semibold rounded-lg px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(profile)}
                    className="min-h-11 text-sm border border-border text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Approved businesses</h2>
        {approved.length === 0 ? (
          <p className="text-muted-foreground text-sm">None yet.</p>
        ) : (
          <div className="space-y-2">
            {approved.map((profile) => (
              <div
                key={profile.id}
                className="border border-border rounded-lg p-3 flex flex-wrap items-start justify-between gap-3"
              >
                <BusinessDetails profile={profile} email={emails[profile.id]} liveDeals={liveDeals[profile.id] || 0} />
                <button
                  onClick={() => handleDeactivate(profile)}
                  className="min-h-11 text-sm border border-red-400/30 text-red-400 hover:text-red-300 rounded-lg px-3 py-1.5"
                >
                  Deactivate
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}