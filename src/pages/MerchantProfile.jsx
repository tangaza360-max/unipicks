import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { LogOut, Store, Trash2 } from 'lucide-react'
import DeleteAccountDialog from '../components/DeleteAccountDialog.jsx'
import PhoneAlertsCard from '../components/PhoneAlertsCard.jsx'
import ConfirmModal from '../components/ConfirmModal.jsx'
import Button from '../components/Button.jsx'

export default function MerchantProfile({ merchantId, onBusinessNameChange, onLogout }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [profile, setProfile] = useState({
    business_name: '',
    phone: '',
    address: '',
    rdb_number: '',
    logo_url: '',
    momo_pay_code: '',
  })
  const [originalProfile, setOriginalProfile] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [approved, setApproved] = useState(false)
  const [confirmReapproval, setConfirmReapproval] = useState(false)
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
        const profileData = {
          business_name: data.business_name || '',
          phone: data.phone || '',
          address: data.address || '',
          rdb_number: data.rdb_number || '',
          logo_url: data.logo_url || '',
          momo_pay_code: data.momo_pay_code || '',
        }
        setProfile(profileData)
        setOriginalProfile(profileData)
        setApproved(Boolean(data.approved))
      }
      setLoading(false)
    }

    if (merchantId) loadProfile()
  }, [merchantId])

  function handleChange(e) {
    setProfile((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  // Founder decision 2026-10-04 (option A): changing the name or RDB number
  // sends an approved business back for approval (enforced in the database).
  const identityChanged =
    profile.business_name.trim() !== (originalProfile.business_name || '').trim() ||
    profile.rdb_number.trim() !== (originalProfile.rdb_number || '').trim()

  function handleSave(e) {
    e.preventDefault()
    if (approved && identityChanged) {
      setConfirmReapproval(true)
      return
    }
    saveProfile()
  }

  async function saveProfile() {
    setConfirmReapproval(false)
    setSaving(true)
    setError('')
    setSuccess('')

    const { data: saved, error: updateError } = await supabase
      .from('merchant_profiles')
      .update({
        business_name: profile.business_name.trim(),
        phone: profile.phone.trim(),
        address: profile.address.trim(),
        rdb_number: profile.rdb_number.trim(),
        logo_url: profile.logo_url.trim() || null,
        momo_pay_code: profile.momo_pay_code.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', merchantId)
      .select('approved')
      .single()

    setSaving(false)

    if (updateError) {
      console.error('Profile save failed:', updateError)
      setError(
        updateError.message?.includes('Only Unipicks')
          ? updateError.message
          : 'We could not save your profile. Please check your details and try again.',
      )
    } else {
      const sentBack = approved && saved?.approved === false
      setApproved(Boolean(saved?.approved))
      setSuccess(
        sentBack
          ? 'Saved. Your business is waiting for Unipicks to approve it again. Your deals are hidden until then.'
          : 'Profile updated.',
      )
      setOriginalProfile(profile)
      onBusinessNameChange?.(profile.business_name.trim())
      setIsEditing(false)
    }
  }

  function handleCancel() {
    setProfile(originalProfile)
    setIsEditing(false)
    setError('')
    setSuccess('')
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

      // --- Automatically save to database after upload ---
      const { error: updateError } = await supabase
        .from('merchant_profiles')
        .update({
          logo_url: logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', merchantId)

      if (updateError) throw updateError

      // Update local state
      setProfile((prev) => ({ ...prev, logo_url: logoUrl }))
      setOriginalProfile((prev) => ({ ...prev, logo_url: logoUrl }))

      setSuccess('Logo uploaded and saved successfully!')

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

  // --- View Mode ---
  if (!isEditing) {
    return (
      <div className="space-y-4">
        {!approved && (
          <p role="status" className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
            Waiting for Unipicks to approve your business. Your deals are hidden from students until then.
          </p>
        )}
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-semibold">Business Profile</h2>
          <button
            onClick={() => { setSuccess(''); setError(''); setIsEditing(true) }}
            className="text-sm bg-accent hover:bg-accent-dim text-background-foreground font-medium rounded-lg px-4 py-2 transition"
          >
            Edit Profile
          </button>
        </div>

        <div className="border border-border rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-4">
            {profile.logo_url ? (
              <img
                src={profile.logo_url}
                alt="Business logo"
                className="w-16 h-16 object-cover rounded-full border border-border"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center text-2xl">
                {profile.business_name?.charAt(0) || <Store size={24} className="text-muted-foreground" />}
              </div>
            )}
            <div>
              <p className="font-semibold text-lg">{profile.business_name || 'Not set'}</p>
              <p className="text-sm text-muted-foreground">{profile.address || 'No address'}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-sm pt-2 border-t border-border/50">
            <div>
              <span className="text-muted-foreground">Phone</span>
              <p className="font-medium">{profile.phone || 'Not set'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">RDB Number</span>
              <p className="font-medium">{profile.rdb_number || 'Not set'}</p>
            </div>
            <div className="col-span-2">
              <span className="text-muted-foreground">MoMo Pay Code</span>
              <p className="font-medium">{profile.momo_pay_code || 'Not set'}</p>
            </div>
          </div>
        </div>

        {success && <p className="text-sm text-green-400">{success}</p>}

        <PhoneAlertsCard audience="merchant" />

        <div className="border border-border rounded-lg p-4">
          <p className="text-sm font-medium">Account</p>
          <button
            onClick={() => setShowDeleteAccount(true)}
            className="mt-2 min-h-11 flex items-center gap-2 text-sm font-medium text-red-400 hover:text-red-300 transition"
          >
            <Trash2 size={16} aria-hidden="true" /> Delete account
          </button>
          <p className="text-xs text-muted-foreground">
            Permanently delete your business account. Orders stay as anonymised records.
          </p>
        </div>

        {onLogout && (
          <Button variant="secondary" className="w-full" onClick={onLogout}>
            <LogOut size={16} aria-hidden="true" /> Log out
          </Button>
        )}

        {showDeleteAccount && (
          <DeleteAccountDialog role="merchant" onClose={() => setShowDeleteAccount(false)} />
        )}
      </div>
    )
  }

  // --- Edit Mode ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-semibold">Edit Profile</h2>
        <button
          onClick={handleCancel}
          className="text-sm text-muted-foreground hover:text-foreground transition"
        >
          Cancel
        </button>
      </div>

      <form onSubmit={handleSave} className="space-y-4 border border-border rounded-lg p-4">
        {approved && (
          <p className="text-xs text-muted-foreground">
            Changing your business name or RDB number sends your business back to Unipicks for approval.
          </p>
        )}
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

        <div className="grid grid-cols-2 gap-4">
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
            <label className="field-label">RDB Number</label>
            <input
              name="rdb_number"
              value={profile.rdb_number}
              onChange={handleChange}
              className="field-input"
              placeholder="RDB/..."
            />
          </div>
        </div>

        <div>
          <label className="field-label">MoMo Pay Code</label>
          <input
            name="momo_pay_code"
            value={profile.momo_pay_code}
            onChange={handleChange}
            className="field-input"
            placeholder="e.g. 123456"
          />
          <p className="text-muted-foreground text-xs mt-1">This is where your share of each payment will be sent.</p>
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
          <label className="field-label">Logo</label>
          {profile.logo_url && (
            <div className="mb-2">
              <img
                src={profile.logo_url}
                alt="Business logo"
                className="w-16 h-16 object-cover rounded-full border border-border"
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
            Upload a square image. It will be saved automatically.
          </p>
        </div>

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

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-2.5 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            type="button"
            onClick={handleCancel}
            className="flex-1 border border-border text-muted-foreground hover:text-foreground rounded-lg py-2.5 transition"
          >
            Cancel
          </button>
        </div>
      </form>

      <ConfirmModal
        isOpen={confirmReapproval}
        onClose={() => setConfirmReapproval(false)}
        onConfirm={saveProfile}
        title="Send your business for approval again?"
        message="You changed your business name or RDB number. Unipicks will check it again. Until then your deals are hidden from students."
        confirmText="Save and send"
        confirmVariant="primary"
      />
    </div>
  )
}
