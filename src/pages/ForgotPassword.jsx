import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { appUrl } from '../lib/authRedirect.js'

// Step 1 of password recovery: email a reset link. The answer is the same
// whether or not the email has an account, so the page can't be used to find
// out who uses Unipicks (OWASP ASVS 2.5).
export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    const address = email.trim().toLowerCase()
    if (!address) {
      setError('Enter your email.')
      return
    }

    setLoading(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: appUrl('/reset-password'),
    })
    setLoading(false)

    if (resetError && resetError.status === 429) {
      setError('Please wait a minute before asking for another link.')
      return
    }
    // Any other answer (including "no such user") shows the same message.
    setSent(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <h1 className="font-display text-3xl font-semibold">Forgot your password?</h1>
          <p className="text-muted-foreground text-sm">
            Enter your email and we'll send you a link to choose a new password.
          </p>
        </div>

        {sent ? (
          <p role="status" className="text-sm rounded-lg border border-border bg-card/60 px-4 py-3 text-foreground">
            If an account exists for this email, we sent a link to reset your password. Check your inbox and spam folder.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="bg-card/60 border border-border rounded-lg p-6 space-y-5">
            <div>
              <label htmlFor="forgot-email" className="field-label">Email</label>
              <input
                id="forgot-email"
                className="field-input"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {error && <p role="alert" className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-sm text-muted-foreground">
          <Link to="/login" className="text-accent hover:underline">Back to log in</Link>
        </p>
      </div>
    </div>
  )
}
