import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Mail,
  MapPin,
  Moon,
  Phone,
  Sun,
  GraduationCap,
  IdCard,
  Star,
  LogOut,
  UserRound,
  ShieldCheck,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useTheme } from '../context/ThemeContext.jsx'
import OrdersTab from './OrdersTab.jsx'

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
  const [role, setRole] = useState(null)

  // Social profile
  const [socialProfile, setSocialProfile] = useState(null)
  const [socialProfileLoading, setSocialProfileLoading] = useState(true)
  const [editingSocial, setEditingSocial] = useState(false)
  const [socialSaving, setSocialSaving] = useState(false)
  const [socialError, setSocialError] = useState('')
  const [socialSuccess, setSocialSuccess] = useState('')

  const [socialFormData, setSocialFormData] = useState({
    username: '',
    display_name: '',
    university: '',
    campus: '',
    student_description: '',
    short_bio: '',
  })

  useEffect(() => {
    loadUser()
  }, [])

  async function loadUser() {
    setLoading(true)
    setError('')
    setSocialProfileLoading(true)

    const { data, error } = await supabase.auth.getUser()

    if (error) {
      setError(error.message)
      setLoading(false)
      setSocialProfileLoading(false)
      return
    }

    if (!data.user) {
      setError('Could not find the current user.')
      setLoading(false)
      setSocialProfileLoading(false)
      return
    }

    setUser(data.user)

    const meta = data.user.user_metadata || {}

    const { data: trustedRole, error: roleError } = await supabase.rpc(
      'get_my_role'
    )

    if (roleError) {
      console.error('Could not load user role:', roleError)
    }

    setRole(trustedRole || null)

    if (trustedRole === 'merchant') {
      const { data: ratings } = await supabase
        .from('ratings')
        .select('rating')
        .eq('merchant_id', data.user.id)

      const values = ratings || []

      setRatingStats({
        average: values.length
          ? (
              values.reduce((sum, item) => sum + item.rating, 0) /
              values.length
            ).toFixed(1)
          : '0.0',
        count: values.length,
      })
    } else {
      setRatingStats(null)
    }

    setFormData({
      full_name: meta.full_name || '',
      phone: meta.phone || '',
      university: meta.university || '',
      student_id: meta.student_id || '',
      business_name: meta.business_name || '',
      address: meta.address || '',
    })

    if (trustedRole === 'student') {
      const { data: studentProfile, error: socialError } = await supabase
        .from('student_profiles')
        .select(
          'user_id, username, display_name, university, campus, student_description, short_bio, is_18_plus, discoverable'
        )
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (socialError) {
        console.error('Could not load Social profile:', socialError)
        setSocialProfile(null)
        setSocialError('Could not load your Social profile.')
      } else {
        setSocialProfile(studentProfile || null)

        if (studentProfile) {
          setSocialFormData({
            username: studentProfile.username || '',
            display_name: studentProfile.display_name || '',
            university: studentProfile.university || '',
            campus: studentProfile.campus || '',
            student_description: studentProfile.student_description || '',
            short_bio: studentProfile.short_bio || '',
          })
        }
      }
    } else {
      setSocialProfile(null)
    }

    setLoading(false)
    setSocialProfileLoading(false)
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

  async function handleSaveSocialProfile() {
    if (!socialProfile || !user) return

    setSocialSaving(true)
    setSocialError('')
    setSocialSuccess('')

    const username = socialFormData.username.trim()
    const displayName = socialFormData.display_name.trim()
    const university = socialFormData.university.trim()
    const campus = socialFormData.campus.trim()
    const studentDescription = socialFormData.student_description.trim()
    const shortBio = socialFormData.short_bio.trim()

    if (!username) {
      setSocialError('Username is required.')
      setSocialSaving(false)
      return
    }

    if (!displayName) {
      setSocialError('Display name is required.')
      setSocialSaving(false)
      return
    }

    if (!university) {
      setSocialError('University is required.')
      setSocialSaving(false)
      return
    }

    if (!campus) {
      setSocialError('Campus is required.')
      setSocialSaving(false)
      return
    }

    if (!studentDescription) {
      setSocialError('Student description is required.')
      setSocialSaving(false)
      return
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from('student_profiles')
      .update({
        username,
        display_name: displayName,
        university,
        campus,
        student_description: studentDescription,
        short_bio: shortBio || null,
      })
      .eq('user_id', user.id)
      .select(
        'user_id, username, display_name, university, campus, student_description, short_bio, is_18_plus, discoverable'
      )
      .single()

    setSocialSaving(false)

    if (updateError) {
      console.error('Could not update Social profile:', updateError)

      if (updateError.code === '23505') {
        setSocialError(
          'That username is already taken. Please choose another one.'
        )
      } else {
        setSocialError(updateError.message)
      }

      return
    }

    setSocialProfile(updatedProfile)

    setSocialFormData({
      username: updatedProfile.username || '',
      display_name: updatedProfile.display_name || '',
      university: updatedProfile.university || '',
      campus: updatedProfile.campus || '',
      student_description: updatedProfile.student_description || '',
      short_bio: updatedProfile.short_bio || '',
    })

    setSocialSuccess('Social profile updated successfully!')
    setEditingSocial(false)
  }

  async function handleToggleDiscoverability() {
    if (!socialProfile || !user) return

    setSocialError('')
    setSocialSuccess('')

    const nextValue = !socialProfile.discoverable

    const { data: updatedProfile, error: updateError } = await supabase
      .from('student_profiles')
      .update({
        discoverable: nextValue,
      })
      .eq('user_id', user.id)
      .select(
        'user_id, username, display_name, university, campus, student_description, short_bio, is_18_plus, discoverable'
      )
      .single()

    if (updateError) {
      console.error('Could not update discoverability:', updateError)
      setSocialError('Could not update discoverability right now.')
      return
    }

    setSocialProfile(updatedProfile)

    setSocialSuccess(
      nextValue
        ? 'Your profile is now discoverable by other students.'
        : 'Your profile is no longer discoverable by other students.'
    )
  }

  function cancelSocialEditing() {
    if (socialProfile) {
      setSocialFormData({
        username: socialProfile.username || '',
        display_name: socialProfile.display_name || '',
        university: socialProfile.university || '',
        campus: socialProfile.campus || '',
        student_description: socialProfile.student_description || '',
        short_bio: socialProfile.short_bio || '',
      })
    }

    setEditingSocial(false)
    setSocialError('')
    setSocialSuccess('')
  }

  function cancelProfileEditing() {
    setEditing(false)
    setError('')
    setSuccess('')

    const meta = user?.user_metadata || {}

    setFormData({
      full_name: meta.full_name || '',
      phone: meta.phone || '',
      university: meta.university || '',
      student_id: meta.student_id || '',
      business_name: meta.business_name || '',
      address: meta.address || '',
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  if (loading) {
    return <p className="text-muted-foreground text-sm">Loading profile…</p>
  }

  if (error && !user) {
    return (
      <p className="text-sm text-red-400">
        Could not load profile: {error}
      </p>
    )
  }

  const isStudent = role === 'student'
  const isMerchant = role === 'merchant'

  return (
    <div className="space-y-6">
      {/* Main Profile */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl font-semibold">Account Information</h2>

        {!editing && (
          <button
            onClick={() => {
              setEditing(true)
              setError('')
              setSuccess('')
            }}
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
              onChange={(e) =>
                setFormData({
                  ...formData,
                  full_name: e.target.value,
                })
              }
            />
          </div>

          <div>
            <label className="field-label">Phone</label>
            <input
              className="field-input"
              value={formData.phone}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  phone: e.target.value,
                })
              }
            />
          </div>

          {isStudent && (
            <>
              <div>
                <label className="field-label">University</label>
                <input
                  className="field-input"
                  value={formData.university}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      university: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">Student ID</label>
                <input
                  className="field-input"
                  value={formData.student_id}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      student_id: e.target.value,
                    })
                  }
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
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      business_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">Address</label>
                <input
                  className="field-input"
                  value={formData.address}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      address: e.target.value,
                    })
                  }
                />
              </div>
            </>
          )}

          {error && <p className="text-sm text-red-400">{error}</p>}

          {success && (
            <p className="text-sm text-accent">{success}</p>
          )}

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg px-5 py-2.5 transition disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>

            <button
              onClick={cancelProfileEditing}
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
              <p className="font-display text-lg font-semibold">
                {formData.full_name || 'No name set'}
              </p>

              <p className="text-muted-foreground text-sm">
                {user?.email}
              </p>

              <span className="text-xs capitalize px-2 py-0.5 rounded-lg bg-muted text-muted-foreground">
                {role || 'user'}
              </span>
            </div>
          </div>

          <div className="border-t border-border pt-5 space-y-3 text-sm">
            <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Phone size={15} /> Phone
              </span>
              <span>{formData.phone || '—'}</span>
            </div>

            {isStudent && (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <GraduationCap size={15} /> University
                  </span>
                  <span>{formData.university || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <IdCard size={15} /> Student ID
                  </span>
                  <span>{formData.student_id || '—'}</span>
                </div>
              </>
            )}

            {isMerchant && (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <MapPin size={15} /> Business
                  </span>
                  <span>{formData.business_name || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <MapPin size={15} /> Address
                  </span>
                  <span>{formData.address || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="text-muted-foreground">Rating</span>

                  <span className="text-amber-500 flex items-center gap-1">
                    <Star size={14} className="fill-amber-500" />
                    {ratingStats?.average || '0.0'}
                    <span className="text-muted-foreground">
                      ({ratingStats?.count || 0})
                    </span>
                  </span>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <Mail size={15} /> Email
              </span>

              <span className="truncate max-w-[180px]">
                {user?.email}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Social Profile */}
      {isStudent && (
        <section className="space-y-4 border-t border-border pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-lg font-semibold">
                Social Profile
              </h3>

              <p className="text-sm text-muted-foreground mt-1">
                Your profile for connecting with other Unipicks students.
              </p>
            </div>

            {!socialProfileLoading &&
              socialProfile &&
              !editingSocial && (
                <button
                  onClick={() => {
                    setEditingSocial(true)
                    setSocialError('')
                    setSocialSuccess('')
                  }}
                  className="text-sm text-accent hover:underline"
                >
                  Edit
                </button>
              )}
          </div>

          {socialProfileLoading ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <p className="text-sm text-muted-foreground">
                Loading Social profile…
              </p>
            </div>
          ) : !socialProfile ? (
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                  <UserRound
                    size={18}
                    className="text-muted-foreground"
                  />
                </div>

                <div>
                  <p className="font-medium">
                    Social profile not found
                  </p>

                  <p className="text-sm text-muted-foreground mt-1">
                    Complete Social setup from the Social section to create
                    your student profile.
                  </p>
                </div>
              </div>
            </div>
          ) : editingSocial ? (
            <div className="space-y-5 bg-card border border-border rounded-lg p-6 shadow-sm">
              <div>
                <label className="field-label">Username</label>

                <div className="flex items-center">
                  <span className="px-3 py-2.5 border border-r-0 border-border rounded-l-lg bg-muted text-muted-foreground text-sm">
                    @
                  </span>

                  <input
                    className="field-input rounded-l-none"
                    value={socialFormData.username}
                    onChange={(e) =>
                      setSocialFormData({
                        ...socialFormData,
                        username: e.target.value,
                      })
                    }
                    placeholder="username"
                  />
                </div>

                <p className="text-xs text-muted-foreground mt-1.5">
                  Usernames are unique. Another student can take a username
                  after it becomes available.
                </p>
              </div>

              <div>
                <label className="field-label">Display name</label>

                <input
                  className="field-input"
                  value={socialFormData.display_name}
                  onChange={(e) =>
                    setSocialFormData({
                      ...socialFormData,
                      display_name: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">University</label>

                <input
                  className="field-input"
                  value={socialFormData.university}
                  onChange={(e) =>
                    setSocialFormData({
                      ...socialFormData,
                      university: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">Campus</label>

                <input
                  className="field-input"
                  value={socialFormData.campus}
                  onChange={(e) =>
                    setSocialFormData({
                      ...socialFormData,
                      campus: e.target.value,
                    })
                  }
                />
              </div>

              <div>
                <label className="field-label">
                  Student description
                </label>

                <input
                  className="field-input"
                  value={socialFormData.student_description}
                  onChange={(e) =>
                    setSocialFormData({
                      ...socialFormData,
                      student_description: e.target.value,
                    })
                  }
                  placeholder="Business Analytics student"
                />
              </div>

              <div>
                <label className="field-label">Short bio</label>

                <textarea
                  className="field-input min-h-[90px] resize-y"
                  value={socialFormData.short_bio}
                  onChange={(e) =>
                    setSocialFormData({
                      ...socialFormData,
                      short_bio: e.target.value,
                    })
                  }
                  placeholder="Tell other students a little about yourself..."
                />
              </div>

              <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/30 p-4">
                <ShieldCheck
                  size={18}
                  className="text-accent mt-0.5 flex-shrink-0"
                />

                <div>
                  <p className="text-sm font-medium">
                    18+ confirmation
                  </p>

                  <p className="text-xs text-muted-foreground mt-1">
                    Your 18+ confirmation is already recorded. It cannot be
                    changed from this screen.
                  </p>
                </div>
              </div>

              {socialError && (
                <p className="text-sm text-red-400">{socialError}</p>
              )}

              {socialSuccess && (
                <p className="text-sm text-accent">{socialSuccess}</p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={handleSaveSocialProfile}
                  disabled={socialSaving}
                  className="bg-primary hover:bg-accent-dim text-primary-foreground font-semibold rounded-lg px-5 py-2.5 transition disabled:opacity-50"
                >
                  {socialSaving ? 'Saving…' : 'Save'}
                </button>

                <button
                  onClick={cancelSocialEditing}
                  className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-5 py-2.5 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 bg-card border border-border rounded-lg p-6 shadow-sm">
              <div className="flex items-start gap-4">
                <div className="w-16 h-16 rounded-full bg-accent/15 ring-4 ring-accent/10 flex items-center justify-center text-accent text-2xl font-semibold flex-shrink-0">
                  {socialProfile.display_name?.charAt(0) || '?'}
                </div>

                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold">
                    {socialProfile.display_name}
                  </p>

                  <p className="text-sm text-muted-foreground">
                    @{socialProfile.username.replace(/^@+/, '')}
                  </p>

                  <p className="text-sm text-muted-foreground mt-1">
                    {socialProfile.university} · {socialProfile.campus}
                  </p>
                </div>
              </div>

              <div className="border-t border-border pt-5 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="text-muted-foreground">
                    Student description
                  </span>

                  <span className="text-right">
                    {socialProfile.student_description || '—'}
                  </span>
                </div>

                <div className="border-b border-border/60 pb-3">
                  <p className="text-muted-foreground mb-1">Short bio</p>

                  <p>
                    {socialProfile.short_bio || 'No bio added yet.'}
                  </p>
                </div>

                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-medium">Discoverability</p>

                    <p className="text-xs text-muted-foreground mt-0.5">
                      {socialProfile.discoverable
                        ? 'Other students can find your profile in Social search.'
                        : 'Other students cannot find your profile in Social search.'}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleToggleDiscoverability}
                    className="flex-shrink-0"
                    aria-label={
                      socialProfile.discoverable
                        ? 'Turn discoverability off'
                        : 'Turn discoverability on'
                    }
                  >
                    <span
                      className={[ 'relative block h-6 w-11 rounded-full transition', socialProfile.discoverable ? 'bg-accent' : 'bg-muted' ].join(' ')}
                    >
                      <span
                        className={[ 'absolute top-1 h-4 w-4 rounded-full bg-white transition-transform', socialProfile.discoverable ? 'translate-x-6' : 'translate-x-1' ].join(' ')}
                      />
                    </span>
                  </button>
                </div>
              </div>

              {socialError && (
                <p className="text-sm text-red-400">{socialError}</p>
              )}

              {socialSuccess && (
                <p className="text-sm text-accent">{socialSuccess}</p>
              )}
            </div>
          )}
        </section>
      )}

      {/* Orders */}
      <div className="border-t border-border pt-5">
        <OrdersTab />
      </div>

      {/* Settings */}
     <section className="border-t border-border pt-5 space-y-4">
       <h3 className="font-display text-lg font-semibold">Settings</h3>

       {/* Appearance */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Appearance</p>
           <p className="text-xs text-muted-foreground mt-1">
             Choose how Unipicks looks on your device.
           </p>
         </div>

         <button
           onClick={toggleTheme}
           className="w-full flex items-center justify-between border border-border bg-card text-muted-foreground hover:text-foreground rounded-xl px-4 py-3 transition text-sm font-medium"
         >
           <span className="flex items-center gap-2">
             {theme === 'dark' ? <Moon size={16} /> : <Sun size={16} />}
             {theme === 'dark' ? 'Dark mode' : 'Light mode'}
           </span>

           <span className="relative h-6 w-11 rounded-full bg-muted">
             <span
               className={[
                 'absolute top-1 h-4 w-4 rounded-full bg-accent transition-transform',
                 theme === 'dark' ? 'translate-x-6' : 'translate-x-1',
               ].join(' ')}
             />
           </span>
         </button>
       </div>

       {/* Notifications */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Notifications</p>
           <p className="text-xs text-muted-foreground mt-1">
             Control the types of notifications you receive.
           </p>
         </div>

         {[
           ['Messages', 'Message notifications'],
           ['Friend requests', 'Friend request notifications'],
           ['Orders', 'Order and pickup notifications'],
           ['Deals', 'Deal notifications'],
           ['Events', 'Event notifications'],
         ].map(([label, description]) => (
           <div
             key={label}
             className="flex items-center justify-between gap-4 border-t border-border pt-3"
           >
             <div>
               <p className="text-sm">{label}</p>
               <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
             </div>
             <span className="text-xs text-muted-foreground">Coming soon</span>
           </div>
         ))}
       </div>

       {/* Privacy & Security */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Privacy & Security</p>
           <p className="text-xs text-muted-foreground mt-1">
             Manage your privacy and account security.
           </p>
         </div>

         {[
           ['Password & security', 'Manage your password and account security.'],
           ['Blocked students', 'View and manage students you have blocked.'],
           ['Other privacy controls', 'More privacy controls will appear here as they become available.'],
         ].map(([label, description]) => (
           <div
             key={label}
             className="border-t border-border pt-3"
           >
             <p className="text-sm">{label}</p>
             <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
           </div>
         ))}
       </div>

       {/* Communication */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Communication</p>
           <p className="text-xs text-muted-foreground mt-1">
             Choose how Unipicks communicates with you.
           </p>
         </div>

         <div className="border-t border-border pt-3">
           <p className="text-sm">Email/SMS notification preferences</p>
           <p className="text-xs text-muted-foreground mt-0.5">
             Communication preferences are coming soon.
           </p>
         </div>
       </div>

       {/* Account */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Account</p>
           <p className="text-xs text-muted-foreground mt-1">
             Manage your Unipicks account.
           </p>
         </div>

         {[
           ['Change password', 'Change your account password.'],
           ['Delete/deactivate account', 'Account deactivation and deletion options are coming soon.'],
         ].map(([label, description]) => (
           <div
             key={label}
             className="border-t border-border pt-3"
           >
             <p className="text-sm">{label}</p>
             <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
           </div>
         ))}
       </div>

       {/* About */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">About</p>
           <p className="text-xs text-muted-foreground mt-1">
             Information about Unipicks.
           </p>
         </div>

         <button
           onClick={() => navigate('/terms')}
           className="w-full text-left border-t border-border pt-3 text-sm hover:text-accent transition"
         >
           Terms
         </button>

         <button
           onClick={() => navigate('/privacy')}
           className="w-full text-left border-t border-border pt-3 text-sm hover:text-accent transition"
         >
           Privacy Policy
         </button>

         <div className="border-t border-border pt-3 flex items-center justify-between">
           <span className="text-sm">App version</span>
           <span className="text-xs text-muted-foreground">0.1.0</span>
         </div>
       </div>
     </section>

     {/* Logout */}
      <button
        onClick={handleLogout}
        className="w-full flex items-center justify-center gap-2 border border-red-400/30 text-red-400 hover:text-red-300 hover:border-red-400/50 rounded-lg py-2.5 transition text-sm font-medium"
      >
        <LogOut size={16} /> Log out
      </button>
    </div>
  )
}
