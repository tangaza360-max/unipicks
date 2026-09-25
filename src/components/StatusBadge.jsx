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
  redeemed: 'Redeemed',
  completed: 'Completed',
  declined: 'Declined',
  confirmation_expired: 'Expired',
  payment_expired: 'Payment expired',
  refunded: 'Refunded',
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

export default function StatusBadge({ status }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyles[status] || 'bg-muted text-muted-foreground'}`}>
      {statusLabels[status] || status}
    </span>
  )
}
