// What a student must act on now, for the banner at the top of Home:
// - "pay": the business accepted and the 5-minute payment window is open;
// - "ready": paid, and the business marked the food ready (show the code).
// Most urgent first: payments by deadline, then ready food, oldest first.
export function orderNudges(orders, now = Date.now()) {
  const pay = (orders || [])
    .filter((o) => o.status === 'confirmed' && o.payment_deadline && new Date(o.payment_deadline).getTime() > now)
    .sort((a, b) => new Date(a.payment_deadline) - new Date(b.payment_deadline))
    .map((order) => ({ kind: 'pay', order }))
  const ready = (orders || [])
    .filter((o) => o.status === 'paid' && o.ready_at)
    .sort((a, b) => new Date(a.ready_at) - new Date(b.ready_at))
    .map((order) => ({ kind: 'ready', order }))
  return [...pay, ...ready]
}
