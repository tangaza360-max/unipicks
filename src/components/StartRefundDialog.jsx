import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { formatMoney } from '../lib/format.js'
import { CHARGED_TO, REFUND_REASONS, amountLeft, orderNumber, orderNumberRange, payerPhone } from '../lib/refunds.js'
import FormDialog from './FormDialog.jsx'

const ORDER_FIELDS = 'id, status, total_price, dispute_status, deals(title, business_name), transactions(id, amount, status, umunota_reference, payer_phone:webhook_payload->>phone)'
const DEFAULT_PAYER = { cant_serve: 'business', dispute: 'business', double_payment: 'unipicks', other: '' }

// Admin: start a refund (admin_start_refund). Opened from a business that
// can't serve, from a dispute ("Resolve and refund"), or for any order by
// its number. The database checks everything again.
export default function StartRefundDialog({ orderId: givenOrderId = null, presetReason = 'other', presetNote = '', onClose, onStarted }) {
  const ids = { number: useId(), amount: useId(), reason: useId(), note: useId(), hint: useId() }
  const [orderId, setOrderId] = useState(givenOrderId)
  const [number, setNumber] = useState('')
  const [order, setOrder] = useState(null)
  const [refunds, setRefunds] = useState([])
  const [loading, setLoading] = useState(Boolean(givenOrderId))
  const [reason, setReason] = useState(presetReason)
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [chargedTo, setChargedTo] = useState(DEFAULT_PAYER[presetReason] ?? '')
  const [note, setNote] = useState(presetNote)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const payment = (order?.transactions || []).find((t) => t.status === 'paid' || t.status === 'refunded') || null
  const left = payment ? amountLeft(payment.amount, refunds, reason) : 0

  useEffect(() => {
    if (!orderId) return
    let active = true
    async function load() {
      setLoading(true)
      setError('')
      const [{ data: o, error: orderError }, { data: r, error: refundError }] = await Promise.all([
        supabase.from('orders').select(ORDER_FIELDS).eq('id', orderId).maybeSingle(),
        supabase.from('refunds').select('amount, reason, status').eq('order_id', orderId),
      ])
      if (!active) return
      if (orderError || refundError) setError('We couldn\'t load this order. Please try again.')
      else if (!o) setError('Order not found.')
      else {
        setOrder(o)
        setRefunds(r || [])
      }
      setLoading(false)
    }
    load()
    return () => { active = false }
  }, [orderId])

  // The amount follows the reason until the admin types one.
  useEffect(() => {
    if (payment && !amountTouched) setAmount(String(left))
  }, [payment?.id, left, amountTouched]) // eslint-disable-line react-hooks/exhaustive-deps

  async function findOrder(event) {
    event.preventDefault()
    setError('')
    const range = orderNumberRange(number)
    if (!range) {
      setError('Type the 8 characters of the order number, for example AB12CD34.')
      return
    }
    setBusy(true)
    const { data, error: findError } = await supabase.from('orders').select('id').gte('id', range.from).lte('id', range.to).limit(2)
    setBusy(false)
    if (findError) setError('We couldn\'t search. Please try again.')
    else if (!data?.length) setError(`No order with the number ${number.trim().toUpperCase()}.`)
    else if (data.length > 1) setError('Two orders start with this number. Open the order from Disputes instead.')
    else setOrderId(data[0].id)
  }

  function changeReason(next) {
    setReason(next)
    if (!chargedTo || chargedTo === DEFAULT_PAYER[reason]) setChargedTo(DEFAULT_PAYER[next] ?? '')
  }

  async function submit(event) {
    event.preventDefault()
    setError('')
    const value = Number(amount)
    if (!Number.isInteger(value) || value <= 0) return setError('Type the amount in RWF, a whole number more than 0.')
    if (value > left) return setError(`The most you can refund is ${formatMoney(left)}.`)
    if (!chargedTo) return setError('Choose who pays for this refund.')
    if (reason === 'other' && !note.trim()) return setError('Add a note for the student when the reason is Other.')
    setBusy(true)
    const { error: rpcError } = await supabase.rpc('admin_start_refund', {
      p_order_id: order.id,
      p_amount: value,
      p_reason: reason,
      p_charged_to: chargedTo,
      p_note: note.trim() || null,
      p_transaction_id: payment.id,
    })
    setBusy(false)
    if (rpcError) return setError(rpcError.message || 'We couldn\'t start the refund. Please try again.')
    const phone = payerPhone(payment)
    onStarted?.(`Refund started. Now send ${formatMoney(value)} to ${phone || 'the phone that paid'} from the Unipicks MoMo number, then tap Mark as sent.`)
  }

  const reasons = REFUND_REASONS.filter(([value]) => value !== 'dispute' || order?.dispute_status || reason === 'dispute')
  const phone = payerPhone(payment)

  return (
    <FormDialog title="Start a refund" onClose={onClose} busy={busy} focusKey={`${orderId}:${loading}:${Boolean(order)}`}>
      {!orderId && (
        <form onSubmit={findOrder} className="space-y-3">
          <div>
            <label htmlFor={ids.number} className="field-label">Order number</label>
            <input id={ids.number} className="field-input" value={number} onChange={(e) => setNumber(e.target.value)}
              autoComplete="off" placeholder="AB12CD34" aria-describedby={ids.hint} />
            <p id={ids.hint} className="mt-1 text-xs text-muted-foreground">On the student's receipt ("No. …") and in dispute alerts.</p>
          </div>
          {error && <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm">Cancel</button>
            <button type="submit" disabled={busy} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? 'Finding…' : 'Find order'}
            </button>
          </div>
        </form>
      )}

      {orderId && loading && <p role="status" className="text-sm text-muted-foreground">Loading the order…</p>}

      {orderId && !loading && order && !payment && (
        <>
          <p role="alert" className="text-sm">Order {orderNumber(order.id)} has no payment to refund.</p>
          <div className="flex justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm">Close</button></div>
        </>
      )}

      {orderId && !loading && order && payment && (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
            <p className="font-medium">Order {orderNumber(order.id)} · {order.deals?.title || 'Deal'} · {order.deals?.business_name || 'Business'}</p>
            <p className="mt-1 text-muted-foreground">
              Paid {formatMoney(payment.amount)}
              {phone ? <> with <span className="font-medium text-foreground">{phone}</span></> : ''}
              {payment.umunota_reference ? ` · UmunotaPay ${payment.umunota_reference}` : ''}
            </p>
            {!phone && <p className="mt-1 text-muted-foreground">The phone that paid isn't recorded: find the payment in UmunotaPay first.</p>}
          </div>

          <div>
            <label htmlFor={ids.reason} className="field-label">Reason</label>
            <select id={ids.reason} className="field-input" value={reason} onChange={(e) => changeReason(e.target.value)}>
              {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor={ids.amount} className="field-label">Amount to send back (RWF)</label>
            <input id={ids.amount} className="field-input" inputMode="numeric" value={amount}
              onChange={(e) => { setAmountTouched(true); setAmount(e.target.value.replace(/[^\d]/g, '')) }}
              aria-describedby={`${ids.amount}-left`} />
            <p id={`${ids.amount}-left`} className="mt-1 text-xs text-muted-foreground">
              {reason === 'double_payment' ? 'The extra charge can be up to ' : 'Left to refund: '}{formatMoney(left)}
            </p>
          </div>

          <fieldset>
            <legend className="field-label">Who pays for this refund?</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {CHARGED_TO.map(([value, label]) => (
                <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${chargedTo === value ? 'border-primary' : 'border-border'}`}>
                  <input type="radio" name="charged-to" value={value} checked={chargedTo === value} onChange={() => setChargedTo(value)} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor={ids.note} className="field-label">Note for the student and the business {reason === 'other' ? '(required)' : '(optional)'}</label>
            <textarea id={ids.note} className="field-input min-h-[80px] resize-y" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </div>

          {error && <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="min-h-11 rounded-lg border border-border px-4 text-sm disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={busy || left <= 0} className="min-h-11 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? 'Starting…' : 'Start refund'}
            </button>
          </div>
        </form>
      )}

      {orderId && !loading && !order && error && (
        <>
          <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>
          <div className="flex justify-end"><button type="button" onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 text-sm">Close</button></div>
        </>
      )}
    </FormDialog>
  )
}
