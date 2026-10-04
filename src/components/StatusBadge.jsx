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
  paid: 'Paid · ready for pickup',
  redeemed: 'Collected',
  completed: 'Collected',
  declined: 'Declined',
  confirmation_expired: 'Expired · no answer',
  payment_expired: 'Expired · not paid',
  refunded: 'Refunded',
  cancelled: 'Cancelled',
}

const statusStyles = {
  open: 'bg-green-100/20 text-green-400',
  closed: 'bg-blue-100/20 text-blue-400',
  cancelled: 'bg-red-100/20 text-red-400',
  pending: 'bg-amber-100/20 text-amber-400',
  ordered: 'bg-primary/20 text-primary',
  // Normal order statuses
  pending_confirmation: 'bg-amber-100/20 text-amber-400',
  confirmed: 'bg-blue-100/20 text-blue-400',
  payment_processing: 'bg-blue-100/20 text-blue-400',
  paid: 'bg-green-100/20 text-green-400',
  redeemed: 'bg-green-100/20 text-green-400',
  completed: 'bg-green-100/20 text-green-400',
  declined: 'bg-red-100/20 text-red-400',
  confirmation_expired: 'bg-red-100/20 text-red-400',
  payment_expired: 'bg-red-100/20 text-red-400',
  refunded: 'bg-muted text-muted-foreground',
}

export function statusLabel(status, audience = 'student') {
  const labels = audience === 'business' ? { ...statusLabels, ...businessLabels } : statusLabels
  return labels[status] || 'Unknown'
}

export default function StatusBadge({ status, audience = 'student' }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusStyles[status] || 'bg-muted text-muted-foreground'}`}>
      {statusLabel(status, audience)}
    </span>
  )
}
