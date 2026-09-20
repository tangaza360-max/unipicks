import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import Logo from '../components/Logo.jsx'

const initialForm = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  confirm: '',
  businessName: '',
  rdbNumber: '',
  address: '',
  agreed: false,
}

export default function RegisterMerchant() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successEmail, setSuccessEmail] = useState('')

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function validate() {
    if (!form.fullName.trim()) return 'Enter your full name.'
    if (!form.phone.trim()) return 'Enter your phone number.'
    if (!form.email.trim()) return 'Enter your email.'
    if (form.password.length < 8) return 'Password must be at least 8 characters.'
    if (form.password !== form.confirm) return 'Passwords do not match.'
    if (!form.businessName.trim()) return 'Enter your business name.'
    if (!form.rdbNumber.trim()) return 'Enter your RDB number.'
    if (!form.address.trim()) return 'Enter your business address.'
    if (!form.agreed) return 'You need to agree to the Terms and Privacy Policy.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    const metadata = {
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      business_name: form.businessName.trim(),
      rdb_number: form.rdbNumber.trim(),
      address: form.address.trim(),
      role: 'merchant',
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: metadata },
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // Merchants start unapproved — create their approval record so an
    // admin can review and approve them before they're fully live.
    if (signUpData.user) {
      await supabase.from('merchant_profiles').insert({
        id: signUpData.user.id,
        business_name: form.businessName.trim(),
      })
    }

    if (signUpData.session) {
      navigate('/dashboard')
      return
    }

    setSuccessEmail(form.email)
    setSuccess(true)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm text-center space-y-3">
          <h1 className="font-display text-2xl font-semibold">Check your email</h1>
          <p className="text-muted-foreground">
            We sent a confirmation link to {successEmail}. Verify it to activate your Unipicks
            business account.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center gap-3">
          <div className="w-14 h-14 rounded-full bg-accent/20 flex items-center justify-center text-accent">
            <Logo size={28} />
          </div>
          <h1 className="font-display text-3xl font-semibold">Join Unipicks as a Business</h1>
          <p className="text-muted-foreground text-sm">
            Reach students in your area with deals they'll love.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card/60 border border-border rounded-lg p-6 space-y-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Full name</label>
              <input
                className="field-input"
                placeholder="Your name"
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Phone</label>
              <input
                className="field-input"
                placeholder="0788..."
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Email</label>
            <input
              className="field-input"
              type="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="field-label">Password</label>
              <input
                className="field-input"
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Confirm</label>
              <input
                className="field-input"
                type="password"
                value={form.confirm}
                onChange={(e) => update('confirm', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="field-label">Business name</label>
            <input
              className="field-input"
              placeholder="Kepler Bite House"
              value={form.businessName}
              onChange={(e) => update('businessName', e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">RDB number</label>
            <input
              className="field-input"
              placeholder="RDB/..."
              value={form.rdbNumber}
              onChange={(e) => update('rdbNumber', e.target.value)}
            />
          </div>

          <div>
            <label className="field-label">Address</label>
            <input
              className="field-input"
              placeholder="Street, building"
              value={form.address}
              onChange={(e) => update('address', e.target.value)}
            />
          </div>

          <label className="flex items-start gap-3 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={form.agreed}
              onChange={(e) => update('agreed', e.target.checked)}
              className="mt-1 accent-accent"
            />
            <span>
              I agree to the{' '}
              <a href="/terms" className="text-accent hover:underline">
                Terms and Conditions
              </a>{' '}
              and{' '}
              <a href="/privacy" className="text-accent hover:underline">
                Privacy Policy
              </a>
              .
            </span>
          </label>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create business account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Are you a student?{' '}
          <Link to="/register" className="text-accent hover:underline">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  )
}
