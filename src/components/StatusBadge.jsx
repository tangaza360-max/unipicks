// Plain words for every status (NN/g heuristic 2: speak the user's language,
// never show codes). Students and businesses see the same order from
// different sides, so businesses get their own wording.
const statusLabels = {
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
  pending: 'Pending',
  ordered: 'Ordered',
  // Normal order statuses
  pending_confirmation: 'Awaiting confirmation',
  confirmed: 'Confirmed',
  payment_processing: 'Processing payment',
  paid: 'Paid',
  redeemed: 'Collected',
  completed: 'Completed',
  declined: 'Declined',
  confirmation_expired: 'Expired',
  payment_expired: 'Payment expired',
  refunded: 'Refunded',
}

const businessLabels = {
  pending: 'Not collected yet',
  pending_confirmation: 'Waiting for you',
  confirmed: 'Waiting for payment',
  payment_processing: 'Payment in progress',
  paid: 'Paid · prepare it',
  redeemed: 'Collected',
  completed: 'Collected',
  declined: 'Declined',
  confirmation_expired: 'Expired · no answer',
  payment_expired: 'Expired · not paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

// Color by meaning (style guide §5): someone must act = wait (amber),
// in progress = neutral, done = good (green), ended badly = bad (red).
const statusMeaning = {
  pending: 'wait',
  pending_confirmation: 'wait',
  confirmed: 'wait',
  open: 'neutral',
  ordered: 'neutral',
  closed: 'neutral',
  payment_processing: 'neutral',
  refunded: 'neutral',
  paid: 'good',
  redeemed: 'good',
  completed: 'good',
  declined: 'bad',
  cancelled: 'bad',
  confirmation_expired: 'bad',
  payment_expired: 'bad',
}

// ready: the business tapped Food ready (orders.ready_at). The status stays
// 'paid', so only the label changes.
export function statusLabel(status, audience = 'student', ready = false) {
  if (status === 'paid' && ready) return audience === 'business' ? 'Ready · waiting for pickup' : 'Ready for pickup'
  const labels = audience === 'business' ? { ...statusLabels, ...businessLabels } : statusLabels
  return labels[status] || 'Unknown'
}

export default function StatusBadge({ status, audience = 'student', ready = false }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap status-${statusMeaning[status] || 'neutral'}`}>
      {statusLabel(status, audience, ready)}
    </span>
  )
}
