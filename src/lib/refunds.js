// Refunds, in plain words, and the admin's to-do list (Admin → Refunds).
// The database decides everything (20261010140000_refunds.sql); this only
// sorts and labels what it returns.

export const REFUND_REASONS = [
  ['cant_serve', "Business can't serve"],
  ['dispute', 'Dispute'],
  ['double_payment', 'Charged twice'],
  ['other', 'Other'],
]
export const reasonLabel = (reason) => REFUND_REASONS.find(([value]) => value === reason)?.[1] || 'Other'

export const CHARGED_TO = [
  ['business', 'The business'],
  ['unipicks', 'Unipicks'],
]
export const chargedToLabel = (who) => CHARGED_TO.find(([value]) => value === who)?.[1] || '—'

const STATUS = { to_send: 'To send', failed: 'Failed — send again', sent: 'Sent', cancelled: 'Stopped' }
export const refundStatusLabel = (status) => STATUS[status] || status

const CANT_SERVE = { sold_out: 'Sold out', closed: 'Closed', other: 'Other reason' }
export const cantServeLabel = (reason) => CANT_SERVE[reason] || 'Other reason'

// "AB12CD34", as on receipts and alerts.
export const orderNumber = (orderId) => String(orderId || '').slice(0, 8).toUpperCase()

// An order number typed by the admin → the range of order ids it can be.
// ("ab12cd34" → ids from ab12cd34-0000-… to ab12cd34-ffff-…). Null if not 8
// hex characters.
export function orderNumberRange(text) {
  const n = String(text || '').trim().replace(/^no\.?\s*/i, '').toLowerCase()
  if (!/^[0-9a-f]{8}$/.test(n)) return null
  return { from: `${n}-0000-0000-0000-000000000000`, to: `${n}-ffff-ffff-ffff-ffffffffffff` }
}

const counts = (refund) => refund.status !== 'cancelled'

// Money still refundable on a payment. A refunded double charge is counted on
// its own (the database does the same), so it never reduces what can be
// returned for the order itself.
/** @param {number|string} paid @param {Array<any>} [refunds] @param {string} [reason] */
export function amountLeft(paid, refunds = [], reason = 'cant_serve') {
  const double = reason === 'double_payment'
  const used = refunds
    .filter((r) => counts(r) && (r.reason === 'double_payment') === double)
    .reduce((sum, r) => sum + Number(r.amount || 0), 0)
  return Math.max(0, Math.round(Number(paid || 0) - used))
}

// The phone the student paid with: from the payment company's reply, or null.
export function payerPhone(transaction) {
  const phone = transaction?.payer_phone ?? transaction?.webhook_payload?.phone
  return phone ? String(phone) : null
}

// What the admin must do, oldest first:
//   waiting — a business can't serve a paid order and no refund was started
//   toSend  — refunds to send ("to send" first, then "failed")
//   done    — sent and stopped refunds, newest first
/** @param {{ refunds?: Array<any>, cantServeOrders?: Array<any> }} lists */
export function refundQueue({ refunds = [], cantServeOrders = [] }) {
  const byAge = (a, b) => String(a.created_at).localeCompare(String(b.created_at))
  const handled = new Set(refunds.filter(counts).map((r) => r.order_id))
  const waiting = cantServeOrders
    .filter((o) => o.status === 'paid' && o.cant_serve_at && !handled.has(o.id))
    .sort((a, b) => String(a.cant_serve_at).localeCompare(String(b.cant_serve_at)))
  const toSend = [
    ...refunds.filter((r) => r.status === 'to_send').sort(byAge),
    ...refunds.filter((r) => r.status === 'failed').sort(byAge),
  ]
  const done = refunds.filter((r) => r.status === 'sent' || r.status === 'cancelled')
    .sort((a, b) => String(b.sent_at || b.updated_at || b.created_at).localeCompare(String(a.sent_at || a.updated_at || a.created_at)))
  return { waiting, toSend, done, count: waiting.length + toSend.length }
}
