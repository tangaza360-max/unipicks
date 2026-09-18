import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import Logo from '../components/Logo.jsx'

const initialForm = {
  is18Plus: false,
  username: '',
  displayName: '',
  university: '',
  campus: '',
  studentDescription: '',
  shortBio: '',
}

export default function SocialOnboarding({ onComplete }) {
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [step, setStep] = useState(1)

  useEffect(() => {
    async function loadAccountInfo() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        setError('Please log in again.')
        setLoading(false)
        return
      }

      const metadata = user.user_metadata || {}

      setForm((current) => ({
        ...current,
        displayName: metadata.full_name || '',
        university: metadata.university || '',
      }))

      setLoading(false)
    }

    loadAccountInfo()
  }, [])

  function update(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
    }))
  }

  function nextStep() {
    setError('')

    if (step === 1 && !form.is18Plus) {
      setError('You must confirm that you are 18 or older to use Unipicks Social.')
      return
    }

    if (step === 2 && !form.username.trim()) {
      setError('Choose a username.')
      return
    }

    if (step === 3) {
      if (!form.displayName.trim()) {
        setError('Enter your display name.')
        return
      }

      if (!form.university.trim()) {
        setError('Enter your university.')
        return
      }

      if (!form.campus.trim()) {
        setError('Enter your campus.')
        return
      }
    }

    setStep((current) => Math.min(current + 1, 4))
  }

  function previousStep() {
    setError('')
    setStep((current) => Math.max(current - 1, 1))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!form.studentDescription.trim()) {
      setError('Enter a short student description.')
      return
    }

    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      setError('Your session has expired. Please log in again.')
      setSaving(false)
      return
    }

    const username = form.username.trim()
    const displayName = form.displayName.trim()
    const university = form.university.trim()
    const campus = form.campus.trim()
    const studentDescription = form.studentDescription.trim()
    const shortBio = form.shortBio.trim()

    const { error: profileError } = await supabase
      .from('student_profiles')
      .insert({
        user_id: user.id,
        username,
        display_name: displayName,
        university,
        campus,
        student_description: studentDescription,
        short_bio: shortBio || null,
        is_18_plus: true,
        discoverable: true,
      })

    setSaving(false)

    if (profileError) {
      if (profileError.code === '23505') {
        setError('That username is already taken. Please choose another one.')
      } else {
        setError(profileError.message)
      }
      return
    }

    if (onComplete) {
      onComplete()
    }
  }

  if (loading) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <p className="text-muted-foreground">Loading Social setup…</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-4">
      <div className="flex flex-col items-center text-center gap-3 mb-8">
        <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center text-accent">
          <Logo size={28} />
        </div>

        <div>
          <h1 className="font-display text-2xl font-semibold">
            Set up Unipicks Social
          </h1>

          <p className="text-muted-foreground text-sm mt-1">
            Connect with students, discover what is happening, and explore
            deals and activities.
          </p>
        </div>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3, 4].map((number) => (
          <div
            key={number}
            className={`h-1.5 flex-1 rounded-full ${
              number <= step ? 'bg-accent' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-card/60 border border-border rounded-xl p-6 space-y-6"
      >
        {/* Step 1 */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Welcome to Social
              </h2>

              <p className="text-sm text-muted-foreground mt-2">
                Unipicks Social is designed for adults. You can still use the
                normal Unipicks account if you choose not to use Social.
              </p>
            </div>

            <label className="flex items-start gap-3 p-4 border border-border rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={form.is18Plus}
                onChange={(e) => update('is18Plus', e.target.checked)}
                className="mt-1 accent-accent"
              />

              <span className="text-sm">
                I confirm that I am <strong>18 or older</strong>.
              </span>
            </label>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Choose your username
              </h2>

              <p className="text-sm text-muted-foreground mt-2">
                This is how other Unipicks students can find you.
              </p>
            </div>

            <div>
              <label className="field-label">Username</label>

              <input
                className="field-input"
                placeholder="Choose your username"
                value={form.username}
                onChange={(e) => update('username', e.target.value)}
                autoComplete="off"
              />

              <p className="text-xs text-muted-foreground mt-2">
                Your username must be unique. You can change it later.
              </p>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Your student profile
              </h2>

              <p className="text-sm text-muted-foreground mt-2">
                These details can appear on your public Social profile.
              </p>
            </div>

            <div>
              <label className="field-label">Display name</label>

              <input
                className="field-input"
                placeholder="Your name"
                value={form.displayName}
                onChange={(e) => update('displayName', e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">University</label>

              <input
                className="field-input"
                placeholder="Your university"
                value={form.university}
                onChange={(e) => update('university', e.target.value)}
              />
            </div>

            <div>
              <label className="field-label">Campus</label>

              <input
                className="field-input"
                placeholder="Your campus"
                value={form.campus}
                onChange={(e) => update('campus', e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Step 4 */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 className="font-display text-xl font-semibold">
                Tell students about you
              </h2>

              <p className="text-sm text-muted-foreground mt-2">
                Keep it short and simple.
              </p>
            </div>

            <div>
              <label className="field-label">Student description</label>

              <input
                className="field-input"
                placeholder="Business Analytics student"
                value={form.studentDescription}
                onChange={(e) =>
                  update('studentDescription', e.target.value)
                }
              />
            </div>

            <div>
              <label className="field-label">Short bio</label>

              <textarea
                className="field-input min-h-[100px] resize-none"
                placeholder="Building things and learning."
                value={form.shortBio}
                onChange={(e) => update('shortBio', e.target.value)}
              />

              <p className="text-xs text-muted-foreground mt-2">
                Optional
              </p>
            </div>

            <div className="border border-border rounded-lg p-4 bg-muted/20">
              <p className="text-sm font-medium mb-3">Profile preview</p>

              <div className="space-y-1 text-sm">
                <p className="font-semibold">{form.displayName || 'Your name'}</p>
                <p className="text-muted-foreground">
                  @{form.username || 'username'}
                </p>
                <p>{form.university || 'University'}</p>
                <p>{form.campus || 'Campus'}</p>
                <p>{form.studentDescription || 'Student description'}</p>

                {form.shortBio && (
                  <p className="text-muted-foreground mt-2">
                    “{form.shortBio}”
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-400">
            {error}
          </p>
        )}

        <div className="flex gap-3">
          {step > 1 && (
            <button
              type="button"
              onClick={previousStep}
              disabled={saving}
              className="flex-1 border border-border rounded-lg py-3 font-medium transition hover:bg-muted/50 disabled:opacity-50"
            >
              Back
            </button>
          )}

          {step < 4 ? (
            <button
              type="button"
              onClick={nextStep}
              className="flex-1 bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition"
            >
              Continue
            </button>
          ) : (
            <button
              type="submit"
              disabled={saving}
              className="flex-1 bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
            >
              {saving ? 'Creating profile…' : 'Create Social profile'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}