// Where an order is, as 5 steps the student can follow (founder decision
// 2026-10-07): Ordered → Accepted → Paid → Ready → Collected, plus one line
// saying what happens now. Ready comes from orders.ready_at (the business's
// Food ready tap); the status stays 'paid'.

export const ORDER_STEPS = ['Ordered', 'Accepted', 'Paid', 'Ready', 'Collected']

// Index of the last step reached, or null when the order ended without food
// (declined, expired, refunded…). Then no steps are shown.
export function reachedStep(order, now = Date.now()) {
  switch (order?.status) {
    case 'pending_confirmation':
      return 0
    case 'confirmed':
      // Accepted, but the 5 minutes to pay are over: the order is dead.
      return order.payment_deadline && new Date(order.payment_deadline).getTime() > now ? 1 : null
    case 'payment_processing':
      return 1
    case 'paid':
      return order.ready_at ? 3 : 2
    case 'redeemed':
    case 'completed':
      return 4
    default:
      return null
  }
}

// Each step is 'done', 'now' (what we are waiting for) or 'next'.
export function stepStates(reached) {
  return ORDER_STEPS.map((label, index) => ({
    label,
    state: index <= reached ? 'done' : index === reached + 1 ? 'now' : 'next',
  }))
}

// One plain sentence: what is happening and what the student should do.
export function nowText(order, business = 'the business') {
  switch (reachedStep(order)) {
    case 0:
      return `Waiting for ${business} to accept. This takes up to 5 minutes.`
    case 1:
      return order.status === 'payment_processing'
        ? 'Confirm the payment on your phone (MoMo).'
        : 'Accepted. Pay within 5 minutes to keep your order.'
    case 2:
      return `Paid. ${business} is preparing your food. We'll tell you when it's ready. Don't go yet.`
    case 3:
      return `Your food is ready. Go to ${business} and show your pickup code.`
    case 4:
      return 'Collected. Enjoy your meal!'
    default:
      return ''
  }
}
