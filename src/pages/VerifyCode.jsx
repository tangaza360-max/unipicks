import { useId, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function VerifyCode() {
  const [codeInput, setCodeInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)
  const inputId = useId()

  async function handleCheck(e) {
    e.preventDefault()
    setChecking(true)
    setResult(null)

    // redeem_pickup_code checks ownership, the paid order and reuse, then marks
    // both the redemption and its parent order as redeemed in one transaction.
    const { data, error } = await supabase.rpc('redeem_pickup_code', {
      p_code: codeInput.trim().toUpperCase(),
    })

    if (error) {
      setChecking(false)
      const message = error.message || 'Could not verify this code. Please try again.'
      setResult({
        ok: false,
        message: message === 'This code is not linked to a paid order'
          ? `${message}. Do not hand over the item.`
          : message,
      })
      return
    }

    const redemptionId = Array.isArray(data) ? data[0]?.redemption_id : data?.redemption_id

    // Read-only lookup for the confirmation message.
    const { data: details } = await supabase
      .from('redemptions')
      .select('student_name, deals(title)')
      .eq('id', redemptionId)
      .maybeSingle()

    setChecking(false)
    setResult({
      ok: true,
      message: details
        ? `Confirmed — ${details.student_name} ordered "${details.deals?.title}".`
        : 'Confirmed — code redeemed.',
    })
    setCodeInput('')
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Check a student's code</h2>
      {/* A real label (a placeholder disappears and is not a name), the number
          keypad on phones (codes are 4 digits), and the result announced, so
          the person at the counter hears whether to hand over the food. */}
      <label htmlFor={inputId} className="field-label">Pickup code</label>
      <form onSubmit={handleCheck} className="flex gap-2">
        <input
          id={inputId}
          className="field-input"
          placeholder="4-digit code"
          inputMode="numeric"
          autoComplete="off"
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          maxLength={4}
        />
        <button
          type="submit"
          disabled={checking || codeInput.trim().length === 0}
          className="bg-accent hover:bg-accent-dim text-background-foreground font-semibold rounded-lg px-5 py-2.5 transition disabled:opacity-50 whitespace-nowrap"
        >
          {checking ? 'Checking…' : 'Check code'}
        </button>
      </form>

      <p role="status" aria-live="polite" className={result ? `text-sm ${result.ok ? 'text-accent' : 'text-[color:var(--status-bad-fg)]'}` : 'sr-only'}>
        {result?.message}
      </p>
    </div>
  )
}
