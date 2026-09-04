const statusLabels = {
  open: 'Open',
  closed: 'Closed',
  cancelled: 'Cancelled',
  pending: 'Pending',
  ordered: 'Ordered',
}

const statusStyles = {
  open: 'bg-green-100/20 text-green-400',
  closed: 'bg-blue-100/20 text-blue-400',
  cancelled: 'bg-red-100/20 text-red-400',
  pending: 'bg-amber-100/20 text-amber-400',
  ordered: 'bg-primary/20 text-primary',
}

export default function StatusBadge({ status }) {
  return (
    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${statusStyles[status] || 'bg-muted text-muted-foreground'}`}>
      {statusLabels[status] || status}
    </span>
  )
}
