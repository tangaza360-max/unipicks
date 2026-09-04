import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function AdminApprovals() {
  const [pending, setPending] = useState([])
  const [approved, setApproved] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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
    if (window.confirm('Permanently delete this merchant profile? This cannot be undone.')) {
      const { error: deleteError } = await supabase.from('merchant_profiles').delete().eq('id', profile.id)
      if (!deleteError) await supabase.rpc('log_admin_action', {
        action: 'reject_merchant', target_type: 'merchant', target_id: profile.id,
        target_name: profile.business_name || 'Unnamed business', details: {},
      })
      loadProfiles()
    }
  }

  async function handleDeactivate(profile) {
    if (window.confirm('Deactivate this merchant? They will lose access until re-approved.')) {
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
    return <p className="text-sm text-red-400">Couldn't load merchants: {error}</p>
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="font-display text-lg font-semibold mb-3">Pending merchants</h2>
        {pending.length === 0 ? (
          <p className="text-muted-foreground text-sm">No merchants waiting for approval.</p>
        ) : (
          <div className="space-y-2">
            {pending.map((profile) => (
              <div
                key={profile.id}
                className="border border-border rounded-lg p-3 flex items-center justify-between"
              >
                <p className="font-medium">{profile.business_name || 'Unnamed business'}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(profile)}
                    className="text-sm bg-accent text-bg-body font-semibold rounded-lg px-3 py-1.5"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => handleReject(profile)}
                    className="text-sm border border-border text-muted-foreground hover:text-foreground rounded-lg px-3 py-1.5"
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
        <h2 className="font-display text-lg font-semibold mb-3">Approved merchants</h2>
        {approved.length === 0 ? (
          <p className="text-muted-foreground text-sm">None yet.</p>
        ) : (
          <div className="space-y-2">
            {approved.map((profile) => (
              <div
                key={profile.id}
                className="border border-border rounded-lg p-3 flex items-center justify-between"
              >
                <span className="text-muted-foreground">{profile.business_name || 'Unnamed business'}</span>
                <button
                  onClick={() => handleDeactivate(profile)}
                  className="text-sm border border-red-400/30 text-red-400/70 hover:text-red-400 rounded-lg px-3 py-1.5"
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