import { useEffect, useId, useState } from 'react'
import { supabase } from '../lib/supabaseClient.js'
import { formatDateTime, formatMoney } from '../lib/format.js'
import {
  cantServeLabel, orderNumber, payerPhone, reasonLabel, refundQueue, refundStatusLabel,
} from '../lib/refunds.js'
import FormDialog from '../components/FormDialog.jsx'
import StartRefundDialog from '../components/StartRefundDialog.jsx'

// Admin → Refunds (refund plan, phase 1). The admin sends the money by hand
// from the Unipicks MoMo number, then records it here. The database checks
// and records every step (20261010140000_refunds.sql).

const PAYMENT = 'transactions(id, amount, umunota_reference, payer_phone:webhook_payload->>phone)'
const REFUND_FIELDS = `id, order_id, student_id, amount, reason, note, charged_to, status, momo_reference, created_at, updated_at, sent_at,
  orders(id, total_price, deals(title, business_name)), ${PAYMENT}`
const CANT_SERVE_FIELDS = `id, student_id, status, total_price, cant_serve_at, cant_serve_reason, cant_serve_note,
  deals(title, business_name), ${PAYMENT}`

function age(iso) {
  const hours = Math.floor((Date.now() - new Date(iso).getTime()) / 3_600_000)
  if (hours < 1) return 'less than 1 hour ago'
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  return `${Math.floor(hours / 24)} days ago`
}

const BUTTON = 'min-h-11 rounded-lg px-4 text-sm font-medium transition disabled:opacity-50'

export default function AdminRefunds() {
  const [refunds, setRefunds] = useState([])
  const [cantServe, setCantServe] = useState([])
  const [names, setNames] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [dialog, setDialog] = useState(null) // { kind: 'start' | 'sent' | 'failed' | 'stop', ... }

  useEffect(() => { load() }, [])

  async function load() {
    setError('')
    const [r, o, s] = await Promise.all([
      supabase.from('refunds').select(REFUND_FIELDS).order('created_at', { ascending: false }).limit(200),
      supabase.from('orders').select(CANT_SERVE_FIELDS).not('cant_serve_at', 'is', null).eq('status', 'paid'),
      supabase.rpc('get_all_students'),
    ])
    if (r.error || o.error) setError('We couldn\'t load refunds. Please try again.')
    else {
      setRefunds(r.data || [])
      setCantServe(o.data || [])
    }
    if (!s.error) setNames(Object.fromEntries((s.data || []).map((x) => [x.id, x.full_name || x.email])))
    setLoading(false)
  }

  function done(message) {
    setDialog(null)
    setNotice(message)
    load()
  }

  if (loading) return <p role="status" className="text-sm text-muted-foreground">Loading refunds…</p>

  const { waiting, toSend, done: history } = refundQueue({ refunds, cantServeOrders: cantServe })
  const student = (id) => names[id] || 'Student'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Refunds</h2>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">
            Send the money from the Unipicks MoMo number to the phone that paid, then tap <strong>Mark as sent</strong> and type the MoMo reference. The student and the business are told.
          </p>
        </div>
        <button type="button" onClick={() => setDialog({ kind: 'start' })} className={`${BUTTON} border border-border`}>
          Refund an order
        </button>
      </div>

      <p role="status" className="text-sm">{notice}</p>
      {error && <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>}

      <section aria-labelledby="refunds-waiting" className="space-y-3">
        <h3 id="refunds-waiting" className="font-medium">Businesses that can't serve ({waiting.length})</h3>
        {waiting.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing waiting.</p>
        ) : waiting.map((order) => {
          const payment = order.transactions?.[0]
          return (
            <article key={order.id} className="space-y-2 rounded-2xl border border-border bg-card p-4">
              <p className="font-medium">{order.deals?.business_name || 'The business'} can't serve order {orderNumber(order.id)}</p>
              <p className="text-sm text-muted-foreground">
                {order.deals?.title || 'Deal'} · {student(order.student_id)} · paid {formatMoney(payment?.amount ?? order.total_price)}
                {payerPhone(payment) ? ` with ${payerPhone(payment)}` : ''}
              </p>
              <p className="text-sm"><span className="status-wait rounded px-1.5 py-0.5 text-xs font-medium">{cantServeLabel(order.cant_serve_reason)}</span>
                {order.cant_serve_note ? ` “${order.cant_serve_note}”` : ''} <span className="text-muted-foreground">· {age(order.cant_serve_at)}</span></p>
              <button type="button" onClick={() => setDialog({ kind: 'start', orderId: order.id, reason: 'cant_serve' })}
                className={`${BUTTON} bg-primary font-semibold text-primary-foreground`}>
                Start refund
              </button>
            </article>
          )
        })}
      </section>

      <section aria-labelledby="refunds-to-send" className="space-y-3">
        <h3 id="refunds-to-send" className="font-medium">To send ({toSend.length})</h3>
        {toSend.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refunds to send.</p>
        ) : toSend.map((refund) => (
          <RefundCard key={refund.id} refund={refund} studentName={student(refund.student_id)}>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => setDialog({ kind: 'sent', refund })} className={`${BUTTON} bg-primary font-semibold text-primary-foreground`}>
                Mark as sent
              </button>
              {refund.status === 'to_send' && (
                <button type="button" onClick={() => setDialog({ kind: 'failed', refund })} className={`${BUTTON} border border-border`}>
                  It failed
                </button>
              )}
              <button type="button" onClick={() => setDialog({ kind: 'stop', refund })} className={`${BUTTON} border border-[color:var(--status-bad-fg)] text-[color:var(--status-bad-fg)]`}>
                Stop refund
              </button>
            </div>
          </RefundCard>
        ))}
      </section>

      <section aria-labelledby="refunds-done" className="space-y-3">
        <h3 id="refunds-done" className="font-medium">Done</h3>
        {history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No refunds yet.</p>
        ) : history.slice(0, 50).map((refund) => (
          <RefundCard key={refund.id} refund={refund} studentName={student(refund.student_id)} />
        ))}
      </section>

      {dialog?.kind === 'start' && (
        <StartRefundDialog orderId={dialog.orderId} presetReason={dialog.reason || 'other'} onClose={() => setDialog(null)} onStarted={done} />
      )}
      {dialog?.kind === 'sent' && <MarkSentDialog refund={dialog.refund} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'failed' && <FailedDialog refund={dialog.refund} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.kind === 'stop' && <StopDialog refund={dialog.refund} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  )
}

function RefundCard({ refund, studentName, children }) {
  const phone = payerPhone(refund.transactions)
  const tone = refund.status === 'sent' ? 'status-good' : refund.status === 'cancelled' ? 'status-bad' : 'status-wait'
  return (
    <article className="space-y-2 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-lg font-semibold">{formatMoney(refund.amount)}</p>
        <span className={`${tone} rounded-full px-2 py-0.5 text-xs font-medium`}>{refundStatusLabel(refund.status)}</span>
      </div>
      {refund.status === 'to_send' || refund.status === 'failed' ? (
        <p className="text-sm">
          Send to <span className="font-semibold">{phone || 'the phone that paid (not recorded — check UmunotaPay)'}</span>
          {refund.transactions?.umunota_reference ? <span className="text-muted-foreground"> · paid with UmunotaPay {refund.transactions.umunota_reference}</span> : ''}
        </p>
      ) : refund.status === 'sent' ? (
        <p className="text-sm">Sent {formatDateTime(refund.sent_at)} · MoMo reference <span className="font-medium">{refund.momo_reference}</span></p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        {studentName} · order {orderNumber(refund.order_id)} · {refund.orders?.deals?.title || 'Deal'} · {refund.orders?.deals?.business_name || 'Business'}
      </p>
      <p className="text-sm text-muted-foreground">
        {reasonLabel(refund.reason)} · paid by {refund.charged_to === 'unipicks' ? 'Unipicks' : 'the business'} · started {age(refund.created_at)}
      </p>
      {refund.note && <p className="text-sm">“{refund.note}”</p>}
      {children}
    </article>
  )
}

function DialogButtons({ busy, onClose, submitLabel, busyLabel, danger = false }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={busy} className={`${BUTTON} border border-border`}>Cancel</button>
      <button type="submit" disabled={busy}
        className={`${BUTTON} font-semibold ${danger ? 'bg-red-600 text-white' : 'bg-primary text-primary-foreground'}`}>
        {busy ? busyLabel : submitLabel}
      </button>
    </div>
  )
}

function useAction(onDone) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function run(fn, args, message) {
    setError('')
    setBusy(true)
    const { error: rpcError } = await supabase.rpc(fn, args)
    setBusy(false)
    if (rpcError) setError(rpcError.message || 'That didn\'t work. Please try again.')
    else onDone(message)
  }
  return { busy, error, setError, run }
}

function MarkSentDialog({ refund, onClose, onDone }) {
  const id = useId()
  const [reference, setReference] = useState('')
  const { busy, error, setError, run } = useAction(onDone)
  const phone = payerPhone(refund.transactions)
  return (
    <FormDialog title="Mark as sent" onClose={onClose} busy={busy}
      description={<>Only after you sent <strong>{formatMoney(refund.amount)}</strong> to <strong>{phone || 'the phone that paid'}</strong> from the Unipicks MoMo number. The student gets the reference.</>}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        if (!reference.trim()) return setError('Type the MoMo reference of the transfer.')
        run('admin_mark_refund_sent', { p_refund_id: refund.id, p_momo_reference: reference.trim() },
          `Refund of ${formatMoney(refund.amount)} marked as sent. The student was told.`)
      }}>
        <div>
          <label htmlFor={id} className="field-label">MoMo reference</label>
          <input id={id} className="field-input" value={reference} onChange={(e) => setReference(e.target.value)} maxLength={100} autoComplete="off" />
        </div>
        {error && <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>}
        <DialogButtons busy={busy} onClose={onClose} submitLabel="Mark as sent" busyLabel="Saving…" />
      </form>
    </FormDialog>
  )
}

function FailedDialog({ refund, onClose, onDone }) {
  const id = useId()
  const [note, setNote] = useState('')
  const { busy, error, run } = useAction(onDone)
  return (
    <FormDialog title="The MoMo didn't go through" onClose={onClose} busy={busy}
      description="The refund stays on the list so you can send it again. The student isn't told.">
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        run('admin_mark_refund_failed', { p_refund_id: refund.id, p_note: note.trim() || null }, 'Marked as failed. Send it again when you can.')
      }}>
        <div>
          <label htmlFor={id} className="field-label">What happened? (only admins see this)</label>
          <textarea id={id} className="field-input min-h-[80px] resize-y" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>}
        <DialogButtons busy={busy} onClose={onClose} submitLabel="Mark as failed" busyLabel="Saving…" />
      </form>
    </FormDialog>
  )
}

function StopDialog({ refund, onClose, onDone }) {
  const id = useId()
  const [note, setNote] = useState('')
  const { busy, error, setError, run } = useAction(onDone)
  return (
    <FormDialog title="Stop this refund?" onClose={onClose} busy={busy}
      description={<>No money is sent. The student and the business are told, with your reason. Only stop it if you haven't sent the {formatMoney(refund.amount)}.</>}>
      <form className="space-y-4" noValidate onSubmit={(e) => {
        e.preventDefault()
        if (!note.trim()) return setError('Say why the refund is stopped (the student will see it).')
        run('admin_cancel_refund', { p_refund_id: refund.id, p_note: note.trim() }, 'Refund stopped. The student and the business were told.')
      }}>
        <div>
          <label htmlFor={id} className="field-label">Why? (the student and the business see this)</label>
          <textarea id={id} className="field-input min-h-[80px] resize-y" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p role="alert" className="text-sm text-[color:var(--status-bad-fg)]">{error}</p>}
        <DialogButtons busy={busy} onClose={onClose} submitLabel="Stop refund" busyLabel="Stopping…" danger />
      </form>
    </FormDialog>
  )
}
