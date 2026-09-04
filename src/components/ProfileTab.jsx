import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Mail, MapPin, Moon, Phone, Sun, GraduationCap, IdCard } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useTheme } from '../context/ThemeContext.jsx'

export default function ProfileTab() {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    university: '',
    student_id: '',
    business_name: '',
    address: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [ratingStats, setRatingStats] = useState(null)

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    setLoading(true)
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    setUser(data.user)
    const meta = data.user.user_metadata || {}
    if (meta.role === 'merchant') {
      const { data: ratings } = await supabase
        .from('ratings')
        .select('rating')
        .eq('merchant_id', data.user.id)
      const values = ratings || []
      setRatingStats({
        average: values.length ? (values.reduce((sum, item) => sum + item.rating, 0) / values.length).toFixed(1) : '0.0',
        count: values.length,
      })
    }
    setFormData({
      full_name: meta.full_name || '',
      phone: meta.phone || '',
      university: meta.university || '',
      student_id: meta.student_id || '',
      business_name: meta.business_name || '',
      address: meta.address || '',
    })
    setLoading(false)
  }

  async function handleSave() {
    setSaving(true)
    setError('')
    setSuccess('')

    const updates = {
      full_name: formData.full_name.trim(),
      phone: formData.phone.trim(),
      university: formData.university.trim(),
      student_id: formData.student_id.trim(),
      business_name: formData.business_name.trim(),
      address: formData.address.trim(),
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: updates,
    })

    setSaving(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Profile updated successfully!')
    setEditing(false)
    await loadUser()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading profile…</p>
  }

  if (error && !user) {
    return <p className="text-sm text-red-400">Could not load profile: {error}</p>
  }

  const role = user?.user_metadata?.role || 'student'
  const isStudent = role === 'student'
  const isMerchant = role === 'merchant'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Profile</h2>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-accent hover:underline"
          >
            Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-5 bg-card border border-border rounded-lg p-6 shadow-sm">
          <div>
            <label className="field-label">Full name</label>
            <input
              className="field-input"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
          </div>

          <div>
            <label className="field-label">Phone</label>
            <input
              className="field-input"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          {isStudent && (
            <>
              <div>
                <label className="field-label">University</label>
                <input
                  className="field-input"
                  value={formData.university}
                  onChange={(e) => setFormData({ ...formData, university: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Student ID</label>
                <input
                  className="field-input"
                  value={formData.student_id}
                  onChange={(e) => setFormData({ ...formData, student_id: e.target.value })}
                />
              </div>
            </>
          )}

          {isMerchant && (
            <>
              <div>
                <label className="field-label">Business name</label>
                <input
                  className="field-input"
                  value={formData.business_name}
                  onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                />
              </div>
              <div>
                <label className="field-label">Address</label>
                <input
                  className="field-input"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}
          {success && <p className="text-sm text-accent">{success}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg px-5 py-2.5 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false)
                setError('')
                setSuccess('')
                const meta = user.user_metadata || {}
                setFormData({
                  full_name: meta.full_name || '',
                  phone: meta.phone || '',
                  university: meta.university || '',
                  student_id: meta.student_id || '',
                  business_name: meta.business_name || '',
                  address: meta.address || '',
                })
              }}
              className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-5 py-2.5 transition"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5 bg-card border border-border rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-20 h-20 rounded-full bg-accent/15 ring-4 ring-accent/10 flex items-center justify-center text-accent text-3xl font-semibold">
              {formData.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="font-display text-lg font-semibold">{formData.full_name || 'No name set'}</p>
              <p className="text-muted-foreground text-sm">{user?.email}</p>
              <span className="text-xs capitalize px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">
                {role}
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
              <span className="flex items-center gap-2 text-muted-foreground"><Phone size={15} /> Phone</span>
              <span>{formData.phone || '—'}</span>
            </div>

            {isStudent && (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground"><GraduationCap size={15} /> University</span>
                  <span>{formData.university || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground"><IdCard size={15} /> Student ID</span>
                  <span>{formData.student_id || '—'}</span>
                </div>
              </>
            )}

            {isMerchant && (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground"><MapPin size={15} /> Business</span>
                  <span>{formData.business_name || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground"><MapPin size={15} /> Address</span>
                  <span>{formData.address || '—'}</span>
                </div>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="text-muted-foreground">Rating</span>
                  <span className="text-amber-500">★ {ratingStats?.average || '0.0'} <span className="text-muted-foreground">({ratingStats?.count || 0})</span></span>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground"><Mail size={15} /> Email</span>
              <span className="truncate max-w-[180px]">{user?.email}</span>
            </div>
          </div>
        </div>
      )}

      <button
        onClick={toggleTheme}
        className="w-full flex items-center justify-between border border-border bg-card shadow-sm text-muted-foreground hover:text-foreground rounded-full px-4 py-3 transition text-sm font-medium"
      >
        <span className="flex items-center gap-2">{theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />} {theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        <span className="relative h-6 w-11 rounded-full bg-muted">
          <span className={`absolute top-1 h-4 w-4 rounded-full bg-accent transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-1'}`} />
        </span>
      </button>

      <button
        onClick={handleLogout}
        className="w-full border border-red-400/30 text-red-400 hover:text-red-300 hover:border-red-400/50 rounded-lg py-2.5 transition text-sm font-medium"
      >
        Log out
      </button>
    </div>
  )
}