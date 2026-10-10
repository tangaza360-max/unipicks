import { useEffect, useState } from 'react'
import { BellRing } from 'lucide-react'
import {
  PHONE_ALERTS,
  getPhoneAlertsState,
  turnOffPhoneAlerts,
  turnOnPhoneAlerts,
} from '../lib/pushNotifications.js'

// "Turn on phone alerts". variant="settings": always shown (profile pages).
// variant="prompt": shown on the merchant dashboard only while alerts are off,
// until dismissed with "Not now" (remembered on this device).

const PROMPT_DISMISSED_KEY = 'unipicks:phone-alerts-prompt-dismissed'

function readDismissed() {
  try {
    return localStorage.getItem(PROMPT_DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

const TEXT = {
  [PHONE_ALERTS.install]:
    'On iPhone: tap Share, then "Add to Home Screen". Open Unipicks from the Home Screen and turn on alerts there.',
  [PHONE_ALERTS.unsupported]: 'This browser cannot show phone alerts. Try Chrome on Android, or the Home Screen app on iPhone.',
  [PHONE_ALERTS.blocked]: 'Alerts are blocked for Unipicks. Allow notifications for this site in your browser or phone settings.',
  [PHONE_ALERTS.off]: 'Get an alert on this phone when something needs you, even when Unipicks is closed.',
  [PHONE_ALERTS.on]: 'Alerts are on for this phone.',
}

export default function PhoneAlertsCard({ variant = 'settings', audience = 'student' }) {
  const [state, setState] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [dismissed, setDismissed] = useState(readDismissed)

  useEffect(() => {
    let active = true
    getPhoneAlertsState()
      .then((next) => active && setState(next))
      .catch(() => active && setState(PHONE_ALERTS.unsupported))
    return () => {
      active = false
    }
  }, [])

  if (!state || state === PHONE_ALERTS.unavailable) return null
  if (variant === 'prompt' && (dismissed || ![PHONE_ALERTS.off, PHONE_ALERTS.install].includes(state))) return null

  async function run(action) {
    setBusy(true)
    setError('')
    try {
      setState(await action())
    } catch (err) {
      console.error('[push] change failed:', err)
      setError('Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function dismiss() {
    setDismissed(true)
    try {
      localStorage.setItem(PROMPT_DISMISSED_KEY, '1')
    } catch {
      // Private mode: the prompt comes back next visit; that is fine.
    }
  }

  const why =
    audience === 'merchant'
      ? 'New orders must be answered within 5 minutes.'
      : 'After a business accepts your order, you have 5 minutes to pay.'

  return (
    <div className="rounded-2xl border border-border bg-card p-4 space-y-3" data-testid="phone-alerts">
      <div className="flex items-start gap-3">
        <BellRing size={18} className="text-accent mt-0.5 shrink-0" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium">Phone alerts</p>
          <p className="text-xs text-muted-foreground mt-1">
            {TEXT[state]}
            {state === PHONE_ALERTS.off && ` ${why}`}
          </p>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <div className="flex items-center gap-3">
        {state === PHONE_ALERTS.off && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(turnOnPhoneAlerts)}
            className="min-h-11 text-sm bg-accent hover:bg-accent-dim text-background-foreground font-medium rounded-lg px-4 py-2 transition disabled:opacity-60"
          >
            {busy ? 'Turning on…' : 'Turn on phone alerts'}
          </button>
        )}
        {state === PHONE_ALERTS.on && variant === 'settings' && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(turnOffPhoneAlerts)}
            className="min-h-11 text-sm text-muted-foreground hover:text-foreground font-medium transition disabled:opacity-60"
          >
            {busy ? 'Turning off…' : 'Turn off'}
          </button>
        )}
        {variant === 'prompt' && (
          <button
            type="button"
            onClick={dismiss}
            className="min-h-11 text-sm text-muted-foreground hover:text-foreground font-medium transition"
          >
            Not now
          </button>
        )}
      </div>
    </div>
  )
}
