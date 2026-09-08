import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function MerchantProfile({ merchantId }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [profile, setProfile] = useState({
    business_name: '',
    phone: '',
    address: '',
    rdb_number: '',
    logo_url: '',
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const fileInputRef = useRef(null)

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

  async function handleLogoUpload(e) {
    const file = e.target.files[0]
    if (!file) return

    setUploading(true)
    setError('')

    try {
      const fileExt = file.name.split('.').pop()
      const filePath = `${merchantId}/${Date.now()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('merchant-logos')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: publicUrlData } = supabase.storage
        .from('merchant-logos')
        .getPublicUrl(filePath)

      const logoUrl = publicUrlData.publicUrl
      setProfile((prev) => ({ ...prev, logo_url: logoUrl }))
      setSuccess('Logo uploaded successfully!')

      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
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

        {/* --- Logo upload and preview --- */}
        <div>
          <label className="field-label">Logo</label>
          {profile.logo_url && (
            <div className="mb-2">
              <img
                src={profile.logo_url}
                alt="Business logo"
                className="w-20 h-20 object-cover rounded-full border border-border"
              />
            </div>
          )}
          <div className="flex items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoUpload}
              className="text-sm text-muted-foreground"
              disabled={uploading}
            />
            {uploading && <span className="text-sm text-muted-foreground">Uploading...</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Upload a square image (recommended: 512x512)
          </p>
        </div>

        {/* --- Logo URL input (fallback) --- */}
        <div>
          <label className="field-label">Logo URL (or upload above)</label>
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
