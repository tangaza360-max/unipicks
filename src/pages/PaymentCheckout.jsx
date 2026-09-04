import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { createPendingTransaction, initiatePayment } from '../lib/payment.js'

const phonePattern = /^(078|079|072|073)\d{7}$/

export default function PaymentCheckout() {
  const [searchParams] = useSearchParams()
  const [phoneNumber, setPhoneNumber] = useState('')
  const [transaction, setTransaction] = useState(null)
  const [payment, setPayment] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const amount = Number(searchParams.get('amount'))
  const dealId = searchParams.get('deal_id') || null
  const orderId = searchParams.get('order_id') || null
  const description = searchParams.get('description') || 'Unipicks payment'

  useEffect(() => {
    if (!Number.isInteger(amount) || amount <= 0 || (!dealId && !orderId)) {
      setError('This payment link is missing a valid amount or order reference.')
    }
  }, [amount, dealId, orderId])

  async function handleSubmit(event) {
    event.preventDefault()
    const normalizedPhone = phoneNumber.replace(/\s+/g, '')
    if (!phonePattern.test(normalizedPhone)) {
      setError('Enter a valid Rwanda number, for example 0788123456.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const pending = await createPendingTransaction({ amount, dealId, orderId, description })
      setTransaction(pending)
      const result = await initiatePayment({
        transactionId: pending.id,
        amount,
        phoneNumber: normalizedPhone,
        reference: pending.reference,
        description,
      })
      setPayment(result)
    } catch (paymentError) {
      setError(paymentError.message || 'Unable to start payment.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-10 text-foreground">
      <div className="mx-auto max-w-md space-y-6">
        <Link to="/dashboard" className="text-sm text-primary hover:underline">← Back to dashboard</Link>
        <div>
          <h1 className="font-display text-2xl font-semibold">Pay with Mobile Money</h1>
          <p className="text-muted-foreground text-sm mt-1">MTN MoMo and Airtel Money sandbox checkout.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-4">
            <span className="text-muted-foreground">Amount</span>
            <span className="font-display text-xl font-semibold">{Number.isFinite(amount) ? amount.toLocaleString() : '—'} RWF</span>
          </div>
          <div>
            <label htmlFor="phone-number" className="field-label">Rwandan phone number</label>
            <input
              id="phone-number"
              className="field-input"
              inputMode="tel"
              placeholder="0788123456"
              value={phoneNumber}
              onChange={(event) => setPhoneNumber(event.target.value)}
              disabled={loading || Boolean(payment)}
            />
            <p className="text-muted-foreground text-xs mt-1">Use a sandbox number in the format 0788XXXXXX, 0728XXXXXX, or 0738XXXXXX.</p>
          </div>
          {error && <p className="text-destructive text-sm" role="alert">{error}</p>}
          {payment ? (
            <div className="rounded-lg bg-primary/10 border border-primary/30 p-4 space-y-2">
              <p className="font-semibold text-primary">Payment request sent</p>
              <p className="text-muted-foreground text-sm">Status: {payment.status || 'pending'}. Check your phone to approve the sandbox payment.</p>
              {payment.payment_url && <a className="text-primary text-sm underline" href={payment.payment_url}>Open payment page</a>}
              <p className="text-muted-foreground text-xs">Reference: {transaction?.reference}</p>
            </div>
          ) : (
            <button type="submit" disabled={loading || Boolean(error && !Number.isFinite(amount))} className="w-full bg-primary text-primary-foreground font-semibold rounded-lg py-3 transition disabled:opacity-50">
              {loading ? 'Starting payment...' : 'Pay Now'}
            </button>
          )}
        </form>
      </div>
    </main>
  )
}
