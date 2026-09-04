import { useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'

export default function VerifyCode() {
  const [codeInput, setCodeInput] = useState('')
  const [checking, setChecking] = useState(false)
  const [result, setResult] = useState(null)

  async function handleCheck(e) {
    e.preventDefault()
    setChecking(true)
    setResult(null)

    const { data, error } = await supabase
      .from('redemptions')
      .select('id, status, student_name, deal_id, deals(title)')
      .eq('code', codeInput.trim())
      .maybeSingle()

    if (error || !data) {
      setChecking(false)
      setResult({ ok: false, message: 'No deal found with that code.' })
      return
    }

    if (data.status === 'redeemed') {
      setChecking(false)
      setResult({ ok: false, message: 'This code was already used.' })
      return
    }

    const { error: updateError } = await supabase
      .from('redemptions')
      .update({ status: 'redeemed', redeemed_at: new Date().toISOString() })
      .eq('id', data.id)

    setChecking(false)

    if (updateError) {
      setResult({ ok: false, message: updateError.message })
      return
    }

    setResult({
      ok: true,
      message: `Confirmed — ${data.student_name} ordered "${data.deals?.title}".`,
    })
    setCodeInput('')
  }

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-semibold">Check a student's code</h2>
      <form onSubmit={handleCheck} className="flex gap-2">
        <input
          className="field-input"
          placeholder="4-digit code"
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

      {result && (
        <p className={`text-sm ${result.ok ? 'text-accent' : 'text-red-400'}`}>
          {result.message}
        </p>
      )}
    </div>
  )
}
