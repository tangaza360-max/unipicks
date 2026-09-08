// src/pages/MerchantProfile.jsx
import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function MerchantProfile({ merchantId }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [profile, setProfile] = useState({
    business_name: '',
    phone: '',
    address: '',
    rdb_number: '',
    logo_url: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase
        .from('merchant_profiles')
        .select('*')
        .eq('id', merchantId)
        .single()

      if (error) {
        console.error('Error loading profile:', error)
        setError('Could not load profile')
      } else if (data) {
        setProfile({
          business_name: data.business_name || '',
          phone: data.phone || '',
          address: data.address || '',
          rdb_number: data.rdb_number || '',
          logo_url: data.logo_url || '',
        })
      }
      setLoading(false)
    }

    if (merchantId) loadProfile()
  }, [merchantId])

  async function handleSave(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    setSuccess('')

    const { error: updateError } = await supabase
      .from('merchant_profiles')
      .update({
        business_name: profile.business_name.trim(),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        rdb_number: profile.rdb_number.trim(),
        logo_url: profile.logo_url.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', merchantId)

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
    } else {
      setSuccess('Profile updated successfully!')
    }
  }

  function handleChange(e) {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading profile…</p>
  }

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Business Profile</h2>

      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="field-label">Business Name</label>
          <input
            name="business_name"
            value={profile.business_name}
            onChange={handleChange}
            className="field-input"
            required
          />
        </div>

        <div>
          <label className="field-label">Phone</label>
          <input
            name="phone"
            value={profile.phone}
            onChange={handleChange}
            className="field-input"
            placeholder="0788..."
          />
        </div>

        <div>
          <label className="field-label">Address</label>
          <input
            name="address"
            value={profile.address}
            onChange={handleChange}
            className="field-input"
            placeholder="Street, building"
          />
        </div>

        <div>
          <label className="field-label">RDB Number</label>
          <input
            name="rdb_number"
            value={profile.rdb_number}
            onChange={handleChange}
            className="field-input"
            placeholder="RDB/..."
          />
        </div>

        <div>
          <label className="field-label">Logo URL</label>
          <input
            name="logo_url"
            value={profile.logo_url}
            onChange={handleChange}
            className="field-input"
            placeholder="https://example.com/logo.png"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {success && <p className="text-sm text-green-400">{success}</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full bg-accent text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </form>
    </div>
  )
}