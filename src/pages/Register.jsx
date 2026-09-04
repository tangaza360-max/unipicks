import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient.js'
import { UNIVERSITIES, domainForUniversity } from '../lib/universities.js'

const initialStudentForm = {
  fullName: '',
  phone: '',
  email: '',
  password: '',
  confirm: '',
  university: UNIVERSITIES[0].name,
  studentId: '',
  agreed: false,
}

const initialMerchantForm = {
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

export default function Register() {
  const navigate = useNavigate()
  const [accountType, setAccountType] = useState('student') // 'student' | 'merchant'
  const [studentForm, setStudentForm] = useState(initialStudentForm)
  const [merchantForm, setMerchantForm] = useState(initialMerchantForm)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [successEmail, setSuccessEmail] = useState('')

  const form = accountType === 'student' ? studentForm : merchantForm
  const setForm = accountType === 'student' ? setStudentForm : setMerchantForm

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }))
  }

  function validateStudent() {
    if (!studentForm.fullName.trim()) return 'Enter your full name.'
    if (!studentForm.phone.trim()) return 'Enter your phone number.'
    if (!studentForm.email.trim()) return 'Enter your school email.'
    if (studentForm.password.length < 8) return 'Password must be at least 8 characters.'
    if (studentForm.password !== studentForm.confirm) return 'Passwords do not match.'
    if (!studentForm.studentId.trim()) return 'Enter your student ID number.'
    if (!studentForm.agreed) return 'You need to agree to the Terms and Privacy Policy.'

    const domain = domainForUniversity(studentForm.university)
    if (!domain) {
      return `${studentForm.university} isn't open for sign-ups yet — check back soon.`
    }
    const emailDomain = studentForm.email.trim().toLowerCase().split('@')[1]
    if (emailDomain !== domain) {
      return `Use your ${studentForm.university} email (must end in @${domain}).`
    }
    return ''
  }

  function validateMerchant() {
    if (!merchantForm.fullName.trim()) return 'Enter your full name.'
    if (!merchantForm.phone.trim()) return 'Enter your phone number.'
    if (!merchantForm.email.trim()) return 'Enter your email.'
    if (merchantForm.password.length < 8) return 'Password must be at least 8 characters.'
    if (merchantForm.password !== merchantForm.confirm) return 'Passwords do not match.'
    if (!merchantForm.businessName.trim()) return 'Enter your business name.'
    if (!merchantForm.rdbNumber.trim()) return 'Enter your RDB number.'
    if (!merchantForm.address.trim()) return 'Enter your business address.'
    if (!merchantForm.agreed) return 'You need to agree to the Terms and Privacy Policy.'
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    const validationError = accountType === 'student' ? validateStudent() : validateMerchant()
    if (validationError) {
      setError(validationError)
      return
    }

    setLoading(true)
    const metadata =
      accountType === 'student'
        ? {
            full_name: studentForm.fullName.trim(),
            phone: studentForm.phone.trim(),
            university: studentForm.university,
            student_id: studentForm.studentId.trim(),
            role: 'student',
          }
        : {
            full_name: merchantForm.fullName.trim(),
            phone: merchantForm.phone.trim(),
            business_name: merchantForm.businessName.trim(),
            rdb_number: merchantForm.rdbNumber.trim(),
            address: merchantForm.address.trim(),
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
    if (accountType === 'merchant' && signUpData.user) {
      await supabase.from('merchant_profiles').insert({
        id: signUpData.user.id,
        business_name: merchantForm.businessName.trim(),
      })
    }

    // If Supabase's "Confirm email" setting is off, signUp already returns a
    // live session — the account is active immediately, so skip straight to
    // the dashboard instead of telling them to check an email that was never
    // required.
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
            <PersonAddIcon />
          </div>
          <h1 className="font-display text-3xl font-semibold">Join Unipicks</h1>
          <p className="text-muted-foreground text-sm">Affordable campus meals, student deals</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-card/60 border border-border rounded-lg p-6 space-y-6"
        >
          {/* Account type toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setAccountType('student')}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border py-6 transition ${
                accountType === 'student'
                  ? 'border-accent text-accent'
                  : 'border-border text-muted-foreground hover:border-border/80'
              }`}
            >
              <GradCapIcon />
              <span className="font-medium">Student</span>
            </button>
            <button
              type="button"
              onClick={() => setAccountType('merchant')}
              className={`flex flex-col items-center justify-center gap-2 rounded-lg border py-6 transition ${
                accountType === 'merchant'
                  ? 'border-accent text-accent'
                  : 'border-border text-muted-foreground hover:border-border/80'
              }`}
            >
              <StoreIcon />
              <span className="font-medium">Merchant</span>
            </button>
          </div>

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

          {accountType === 'student' ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">University</label>
                <select
                  className="field-input"
                  value={studentForm.university}
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
                <label className="field-label">Student ID number</label>
                <input
                  className="field-input"
                  placeholder="UR12345"
                  value={studentForm.studentId}
                  onChange={(e) => update('studentId', e.target.value)}
                />
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="field-label">Business name</label>
                <input
                  className="field-input"
                  placeholder="Kepler Bite House"
                  value={merchantForm.businessName}
                  onChange={(e) => update('businessName', e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">RDB number</label>
                <input
                  className="field-input"
                  placeholder="RDB/..."
                  value={merchantForm.rdbNumber}
                  onChange={(e) => update('rdbNumber', e.target.value)}
                />
              </div>

              <div>
                <label className="field-label">Address</label>
                <input
                  className="field-input"
                  placeholder="Street, building"
                  value={merchantForm.address}
                  onChange={(e) => update('address', e.target.value)}
                />
              </div>
            </>
          )}

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
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <a href="/login" className="text-accent hover:underline">
            Log in
          </a>
        </p>
      </div>
    </div>
  )
}

function PersonAddIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <circle cx="10" cy="8" r="3.5" />
      <path d="M3.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M18 8v6M15 11h6" />
    </svg>
  )
}

function GradCapIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 3 1 8l11 5 9-4.09V17h2V8L12 3Z" />
      <path d="M5 10.5V15c0 1.5 3 3 7 3s7-1.5 7-3v-4.5" />
    </svg>
  )
}

function StoreIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M3 9l1.5-5h15L21 9" />
      <path d="M3 9h18v11H3V9Z" />
      <path d="M9 20v-6h6v6" />
    </svg>
  )
}
