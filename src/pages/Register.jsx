import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { appUrl } from '../lib/authRedirect.js'
import { UNIVERSITIES, domainForUniversity } from '../lib/universities.js'
import Logo from '../components/Logo.jsx'

const initialForm = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  confirm: '',
  university: UNIVERSITIES[0].name,
  studentId: '',
  agreed: false,
}

export default function Register() {
  const navigate = useNavigate()
  const [form, setForm] = useState(initialForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successEmail, setSuccessEmail] = useState('')
  const [alreadyRegistered, setAlreadyRegistered] = useState(false)

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function validate() {
    if (!form.fullName.trim()) return 'Enter your full name.'
    if (!form.phone.trim()) return 'Enter your phone number.'
    if (!form.email.trim()) return 'Enter your school email.'
    if (form.password.length < 8) return 'Password must be at least 8 characters.'
    if (form.password !== form.confirm) return 'Passwords do not match.'
    if (!form.studentId.trim()) return 'Enter your student ID number.'
    if (!form.agreed) return 'You need to agree to the Terms and Privacy Policy.'

    const domain = domainForUniversity(form.university)
    if (!domain) {
      return `${form.university} isn't open for sign-ups yet — check back soon.`
    }
    const emailDomain = form.email.trim().toLowerCase().split('@')[1]
    if (emailDomain !== domain) {
      return `Use your ${form.university} email (must end in @${domain}).`
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setAlreadyRegistered(false)

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)

    const metadata = {
      full_name: form.fullName.trim(),
      phone: form.phone.trim(),
      university: form.university,
      student_id: form.studentId.trim(),
      role: 'student',
    }

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: form.email.trim().toLowerCase(),
      password: form.password,
      options: { data: metadata, emailRedirectTo: appUrl('/dashboard') },
    })
    setLoading(false)

    if (signUpError) {
      setError(signUpError.message)
      return
    }

    // With email confirmation on, Supabase answers a signup for an address
    // that already has an account with a user that has no identities and
    // sends no email, so "Check your email" would be wrong here.
    if (signUpData.user && signUpData.user.identities?.length === 0) {
      setAlreadyRegistered(true)
      return
    }

    // If Supabase's "Confirm email" setting is off, signUp already returns a
    // live session — the account is active immediately, so skip straight to
    // the dashboard instead of telling them to check an email that was never
    // required.
    if (signUpData.session) {
      navigate('/dashboard/deals', { replace: true })
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
            account.
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
          <h1 className="font-display text-3xl font-semibold">Join Unipicks</h1>
          <p className="text-muted-foreground text-sm">Affordable campus meals, student deals</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card/60 border border-border rounded-lg p-6 space-y-6"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="register-fullname" className="field-label">Full name</label>
              <input
                id="register-fullname"
                className="field-input"
                placeholder="Your name"
                value={form.fullName}
                onChange={(e) => update('fullName', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="register-phone" className="field-label">Phone</label>
              <input
                id="register-phone"
                className="field-input"
                placeholder="0788..."
                value={form.phone}
                onChange={(e) => update('phone', e.target.value)}
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="field-label">Student email</label>
            <input
              id="register-email"
              className="field-input"
              type="email"
              placeholder="Enter your student email"
              value={form.email}
              onChange={(e) => update('email', e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="register-password" className="field-label">Password</label>
              <input
                id="register-password"
                className="field-input"
                type="password"
                value={form.password}
                onChange={(e) => update('password', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="register-confirm" className="field-label">Confirm</label>
              <input
                id="register-confirm"
                className="field-input"
                type="password"
                value={form.confirm}
                onChange={(e) => update('confirm', e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="register-university" className="field-label">University</label>
              <select
                id="register-university"
                className="field-input"
                value={form.university}
                onChange={(e) => update('university', e.target.value)}
              >
                {UNIVERSITIES.map((u) => (
                  <option key={u.name} value={u.name}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="register-studentid" className="field-label">Student ID number</label>
              <input
                id="register-studentid"
                className="field-input"
                placeholder="UR12345"
                value={form.studentId}
                onChange={(e) => update('studentId', e.target.value)}
              />
            </div>
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
          {alreadyRegistered && (
            <p role="alert" className="text-sm text-red-400">
              This email already has a Unipicks account.{' '}
              <Link to="/login" className="text-accent hover:underline">
                Log in instead
              </Link>
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link to="/login" className="text-accent hover:underline">
            Log in
          </Link>
        </p>

        <p className="text-center text-xs text-muted-foreground">
          Are you a business?{' '}
          <Link to="/register/merchant" className="text-accent hover:underline">
            Sign up here
          </Link>
        </p>
      </div>
    </div>
  )
}
