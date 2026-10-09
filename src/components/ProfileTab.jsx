import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
  Trash2,
} from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'
import { useTheme } from '../context/ThemeContext.jsx'
import OrdersTab from './OrdersTab.jsx'
import DeleteAccountDialog from './DeleteAccountDialog.jsx'
import PhoneAlertsCard from './PhoneAlertsCard.jsx'
import { forgetThisPhone } from '../lib/pushNotifications.js'
import BackLink from './BackLink.jsx'
import AvatarEditor from './AvatarEditor.jsx'
import StudentAvatar from './StudentAvatar.jsx'
import { useStudentAvatar } from '../lib/studentAvatars.js'

// University and student ID are set server-side from the verified email
// domain (auth app_metadata, which the client cannot write). user_metadata
// is user-editable, so it is never used for verified identity.
function verifiedIdentityOf(user) {
  const app = user?.app_metadata || {}
  return {
    university: app.university || '',
    studentId: app.student_id || '',
    emailDomain: app.verified_email_domain || '',
  }
}

export default function ProfileTab({ needsActionCount = 0, disputeUnreadCount = 0 }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()

  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
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

  const [showOrderHistory, setShowOrderHistory] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const location = useLocation()

  // Dispute notifications link to /dashboard/profile?view=orders.
  useEffect(() => {
    if (new URLSearchParams(location.search).get('view') === 'orders') {
      setShowOrderHistory(true)
    }
  }, [location.search])

  // Opening Order History is where dispute updates are shown (OrdersTab),
  // so mark the student's unread dispute notifications as read then.
  useEffect(() => {
    if (!showOrderHistory || disputeUnreadCount === 0) return

    async function markDisputeNotificationsRead() {
      const { data: { user: currentUser } } = await supabase.auth.getUser()
      if (!currentUser) return

      const { error } = await supabase
        .from('user_notifications')
        .update({ is_read: true })
        .eq('user_id', currentUser.id)
        .eq('is_read', false)
        .like('type', 'dispute_%')

      if (error) console.error('Failed to mark dispute notifications as read:', error.message)
    }

    markDisputeNotificationsRead()
  }, [showOrderHistory, disputeUnreadCount])

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
      business_name: meta.business_name || '',
      address: meta.address || '',
    })

    if (trustedRole === 'student') {
      const { data: studentProfile, error: socialError } = await supabase
        .from('student_profiles')
        .select(
          'user_id, username, display_name, university, campus, student_description, short_bio, is_18_plus, discoverable, avatar_path'
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
    // The database also enforces this (student_profiles trigger).
    const university = (verified.university || socialFormData.university).trim()
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
        'user_id, username, display_name, university, campus, student_description, short_bio, is_18_plus, discoverable, avatar_path'
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
        'user_id, username, display_name, university, campus, student_description, short_bio, is_18_plus, discoverable, avatar_path'
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
      business_name: meta.business_name || '',
      address: meta.address || '',
    })
  }

  async function handleLogout() {
    await forgetThisPhone()
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
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
  const verified = verifiedIdentityOf(user)
  const isMerchant = role === 'merchant'

  if (showOrderHistory) {
    return (
      <div className="space-y-4">
        <BackLink onClick={() => setShowOrderHistory(false)} />
        <h2 className="font-display text-xl font-semibold">Order History</h2>
        <OrdersTab />
      </div>
    )
  }

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
            <label htmlFor="profile-full-name" className="field-label">Full name</label>
            <input
              id="profile-full-name"
              autoComplete="name"
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
            <label htmlFor="profile-phone" className="field-label">Phone</label>
            <input
              id="profile-phone"
              autoComplete="tel"
              type="tel"
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
            <p className="text-xs text-muted-foreground">
              University and student ID come from your verified student email and
              can't be changed here. Contact support if they're wrong.
            </p>
          )}

          {isMerchant && (
            <>
              <div>
                <label htmlFor="profile-business-name" className="field-label">Business name</label>
                <input
                  id="profile-business-name"
                  autoComplete="organization"
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
                <label htmlFor="profile-address" className="field-label">Address</label>
                <input
                  id="profile-address"
                  autoComplete="street-address"
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
            {isStudent && socialProfile?.avatar_path ? (
              <OwnAvatar userId={user?.id} name={formData.full_name} />
            ) : (
              <div className="w-20 h-20 shrink-0 rounded-full bg-accent/15 ring-4 ring-accent/10 flex items-center justify-center text-accent text-3xl font-semibold">
                {formData.full_name?.charAt(0) || '?'}
              </div>
            )}

            <div className="min-w-0 flex-1">
              <p className="font-display text-lg font-semibold truncate">
                {formData.full_name || 'No name set'}
              </p>

              <p className="text-muted-foreground text-sm truncate">
                {user?.email}
              </p>

              <span className="text-xs capitalize px-2 py-0.5 rounded-lg bg-muted text-muted-foreground inline-block mt-1">
                {{ merchant: 'business' }[role] || role || 'user'}
              </span>
              {isStudent && verified.university && (
                <span
                  className="ml-2 text-xs px-2 py-0.5 rounded-lg bg-accent/15 text-accent inline-block mt-1 font-medium"
                  title={`Verified via @${verified.emailDomain}`}
                >
                  ✓ Verified student
                </span>
              )}
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
                  <span>{verified.university || '—'}</span>
                </div>

                <div className="flex items-center justify-between gap-4 border-b border-border/60 pb-3">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <IdCard size={15} /> Student ID
                  </span>
                  <span>{verified.studentId || '—'}</span>
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
                <label htmlFor="profile-username" className="field-label">Username</label>

                <div className="flex items-center">
                  <span className="px-3 py-2.5 border border-r-0 border-border rounded-l-lg bg-muted text-muted-foreground text-sm">
                    @
                  </span>

                  <input
                    id="profile-username"
                    autoComplete="off"
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
                <label htmlFor="profile-display-name" className="field-label">Display name</label>

                <input
                  id="profile-display-name"
                  autoComplete="nickname"
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
                <label htmlFor="profile-university" className="field-label">University</label>

                <input
                  id="profile-university"
                  className="field-input opacity-70"
                  value={verified.university || socialFormData.university}
                  readOnly
                  aria-readonly="true"
                />
              </div>

              <div>
                <label htmlFor="profile-campus" className="field-label">Campus</label>

                <input
                  id="profile-campus"
                  autoComplete="off"
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
                <label htmlFor="profile-student-description" className="field-label">
                  Student description
                </label>

                <input
                  id="profile-student-description"
                  autoComplete="off"
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
                <label htmlFor="profile-short-bio" className="field-label">Short bio</label>

                <textarea
                  id="profile-short-bio"
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
              <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
                <AvatarEditor
                  userId={socialProfile.user_id}
                  name={socialProfile.display_name}
                  avatarPath={socialProfile.avatar_path}
                  onChange={(path) => setSocialProfile((current) => ({ ...current, avatar_path: path }))}
                />

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
                        className={[ 'absolute top-1 h-4 w-4 rounded-full bg-white transition-all', socialProfile.discoverable ? 'left-[22px]' : 'left-1' ].join(' ')}
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

      {/* Order History link */}
      <div className="border-t border-border pt-5">
        <button
          onClick={() => setShowOrderHistory(true)}
          className="w-full flex items-center justify-between text-left group"
        >
          {/* The name is the visible text (WCAG 2.5.3 Label in Name); hidden
              text only adds what the screen doesn't show. */}
          <div>
            <p className="font-display text-lg font-semibold">Order History</p>
            <p className="text-sm text-muted-foreground mt-1">
              {needsActionCount > 0
                ? `${needsActionCount} order${needsActionCount === 1 ? '' : 's'} accepted — pay before the deadline`
                : disputeUnreadCount > 0
                  ? 'Your dispute has an update'
                  : 'View all your past orders'}
              {needsActionCount > 0 && disputeUnreadCount > 0 && (
                <span className="sr-only">
                  , {disputeUnreadCount} dispute update{disputeUnreadCount === 1 ? '' : 's'}
                </span>
              )}
            </p>
          </div>
          <span className="flex items-center gap-2">
            {needsActionCount + disputeUnreadCount > 0 && (
              <span
                aria-hidden="true"
                className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white"
              >
                {needsActionCount + disputeUnreadCount > 99 ? '99+' : needsActionCount + disputeUnreadCount}
              </span>
            )}
            <span aria-hidden="true" className="text-muted-foreground group-hover:text-accent transition">&rarr;</span>
          </span>
        </button>
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

           <span className={`relative h-6 w-11 rounded-full transition-colors ${
             theme === 'dark' ? 'bg-accent' : 'bg-muted'
           }`}>
             <span
               className={[
                 'absolute top-1 h-4 w-4 rounded-full bg-white transition-all',
                 theme === 'dark' ? 'left-[22px]' : 'left-1',
               ].join(' ')}
             />
           </span>
         </button>
       </div>

       <PhoneAlertsCard audience="student" />

       {/* Privacy & Security */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Privacy & Security</p>
           <p className="text-xs text-muted-foreground mt-1">
             Manage your privacy and account security.
           </p>
         </div>

         {[
           ['Blocked students', 'View and manage students you have blocked.'],
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

       {/* Account */}
       <div className="rounded-xl border border-border bg-card p-4 space-y-3">
         <div>
           <p className="text-sm font-medium">Account</p>
           <p className="text-xs text-muted-foreground mt-1">
             Manage your Unipicks account.
           </p>
         </div>

         <button
           onClick={() => setShowDeleteAccount(true)}
           className="w-full min-h-11 text-left border-t border-border pt-3 flex items-start gap-2 text-red-400 hover:text-red-300 transition"
         >
           <Trash2 size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
           <span>
             <span className="block text-sm font-medium">Delete account</span>
             <span className="block text-xs text-muted-foreground mt-0.5">
               Permanently delete your account and personal data.
             </span>
           </span>
         </button>
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

      {showDeleteAccount && (
        <DeleteAccountDialog role={role} onClose={() => setShowDeleteAccount(false)} />
      )}
    </div>
  )
}

// The student's photo on the Account card (changed in the Social profile card).
function OwnAvatar({ userId, name }) {
  const url = useStudentAvatar(userId)
  return <StudentAvatar src={url} name={name} size="xl" alt="" className="!h-20 !w-20 ring-4 ring-accent/10" />
}
