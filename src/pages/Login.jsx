import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'

export default function Login() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })

    setLoading(false)

    if (signInError) {
      setError(signInError.message)
      return
    }
    navigate('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <h1 className="font-display text-3xl font-semibold">Welcome back</h1>
          <p className="text-muted-foreground text-sm">Log in to Unipicks</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card/60 border border-border rounded-lg p-6 space-y-5"
        >
          <div>
            <label className="field-label">Email</label>
            <input
              className="field-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Password</label>
            <input
              className="field-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-dim text-bg-body font-semibold rounded-lg py-3 transition disabled:opacity-50"
          >
            {loading ? 'Logging in…' : 'Log in'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          New to Unipicks?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/terms" className="hover:text-foreground hover:underline">Terms</Link>
          {' · '}
          <Link to="/privacy" className="hover:text-foreground hover:underline">Privacy</Link>
        </p>
      </div>
    </div>
  )
}
