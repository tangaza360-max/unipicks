import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

// Step 2 of password recovery: the email link opens this page with a
// one-time recovery session (Supabase reads it from the URL). The student
// chooses a new password; every other device is then logged out.
const MIN_LENGTH = 8

export default function ResetPassword() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && event === 'PASSWORD_RECOVERY' && session) setHasSession(true)
    })
    // getSession waits until Supabase has read the link from the URL.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return
      if (session) setHasSession(true)
      setChecking(false)
    })
    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < MIN_LENGTH) {
      setError(`Password must be at least ${MIN_LENGTH} characters.`)
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }

    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setSaving(false)
      setError(updateError.message)
      return
    }
    // Someone who knew the old password may still be logged in elsewhere.
    await supabase.auth.signOut({ scope: 'others' })
    setSaving(false)
    navigate('/dashboard', { replace: true })
  }

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <p className="text-muted-foreground">Checking your link…</p>
      </div>
    )
  }

  if (!hasSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div role="alert" className="max-w-sm text-center space-y-4">
          <h1 className="font-display text-2xl font-semibold">This reset link is invalid or has expired</h1>
          <p className="text-muted-foreground text-sm">Reset links work once and only for a short time. Ask for a new one.</p>
          <Link
            to="/forgot-password"
            className="inline-block w-full bg-primary text-primary-foreground font-semibold rounded-lg py-3 text-sm"
          >
            Request a new link
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <h1 className="font-display text-3xl font-semibold">Choose a new password</h1>
          <p className="text-muted-foreground text-sm">At least {MIN_LENGTH} characters.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card/60 border border-border rounded-lg p-6 space-y-5">
          <div>
            <label htmlFor="new-password" className="field-label">New password</label>
            <input
              id="new-password"
              className="field-input"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="field-label">Confirm new password</label>
            <input
              id="confirm-password"
              className="field-input"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>

          {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save new password'}
          </button>
        </form>
      </div>
    </div>
  )
}
