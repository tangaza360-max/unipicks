import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabaseClient.js'

// Self-service account deletion (P3 / B2). Step 1 explains what is deleted
// and what is kept; step 2 re-checks the password (decision D2) and calls the
// delete-my-account Edge Function, which runs the pre-checks and the tombstone
// in one transaction. On success the session is gone server-side, so we clear
// it locally and land on the public /delete-account page.
export default function DeleteAccountDialog({ role, onClose }) {
  const navigate = useNavigate()
  const [step, setStep] = useState('explain')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const passwordRef = useRef(null)

  useEffect(() => {
    if (step === 'confirm') passwordRef.current?.focus()
  }, [step])

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === 'Escape' && !submitting) onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose, submitting])

  async function handleDelete(e) {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('Please enter your password to confirm.')
      return
    }

    setSubmitting(true)
    const { error: invokeError } = await supabase.functions.invoke('delete-my-account', {
      body: { password },
    })

    if (invokeError) {
      // 401 wrong password, 409 active orders / open dispute / open group,
      // 403 admin: the function's message is written for the user.
      let message = 'Your account could not be deleted. Nothing was changed; please try again.'
      if (invokeError.context && typeof invokeError.context.json === 'function') {
        try {
          const body = await invokeError.context.json()
          if (body?.error) message = body.error
        } catch {
          // keep the generic message
        }
      }
      setSubmitting(false)
      setError(message)
      return
    }

    // Sessions were revoked by the server; clear this device's copy.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    navigate('/delete-account?deleted=1', { replace: true })
  }

  const isMerchant = role === 'merchant'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose()
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-account-title"
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl bg-card border border-border p-5 shadow-2xl"
      >
        <div className="flex items-center gap-2 text-red-400">
          <AlertTriangle size={18} aria-hidden="true" />
          <h2 id="delete-account-title" className="font-display text-lg font-semibold text-foreground">
            Delete your account
          </h2>
        </div>

        {step === 'explain' ? (
          <div className="mt-4 space-y-4 text-sm">
            <p className="text-muted-foreground">
              This is permanent and happens immediately. You can't undo it or recover the account.
            </p>

            <div>
              <p className="font-medium">Deleted</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground space-y-0.5">
                {isMerchant ? (
                  <>
                    <li>Your business profile, logo and stories</li>
                    <li>Your deal images (deals are switched off)</li>
                  </>
                ) : (
                  <>
                    <li>Your profile, student ID and university details</li>
                    <li>Friends, requests, stories, follows and saved deals</li>
                  </>
                )}
                <li>Your notifications and activity history</li>
                <li>Your login: email, password and every signed-in device</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">Kept, without your name or contact details</p>
              <ul className="mt-1 list-disc pl-5 text-muted-foreground space-y-0.5">
                <li>Order and payment records, for accounting (minimum 5 years)</li>
                <li>Chat messages, for the other person, shown as “Deleted user”</li>
                <li>Rating scores (review text is removed) and safety reports</li>
              </ul>
            </div>

            <p className="text-muted-foreground">
              You can't delete your account while you have active orders, an open dispute
              {isMerchant ? '' : ' or a group order you are hosting'}.{' '}
              <Link to="/delete-account" className="text-primary underline underline-offset-2 hover:decoration-2">
                Full details
              </Link>
            </p>

            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2.5 transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => setStep('confirm')}
                className="text-sm font-semibold rounded-lg px-4 py-2.5 border border-red-400/40 text-red-400 hover:border-red-400/70 hover:text-red-300 transition"
              >
                Continue
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleDelete} className="mt-4 space-y-4">
            <div>
              <label htmlFor="delete-account-password" className="field-label">
                Enter your password to confirm
              </label>
              <input
                id="delete-account-password"
                ref={passwordRef}
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="field-input"
                disabled={submitting}
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-red-400">
                {error}
              </p>
            )}

            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg px-4 py-2.5 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="text-sm font-semibold rounded-lg px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white transition disabled:opacity-50"
              >
                {submitting ? 'Deleting…' : 'Delete my account'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
