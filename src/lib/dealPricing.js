// One place for how a deal's price and discount are shown (founder decision
// 2026-10-04: a deal does not have to be a discount, but it must have a
// price). The database enforces the price (constraint deals_have_student_price);
// the server charges with priceOrder() in create-order.
//
//   * A discount is shown only when it is real (more than 0): no "0% off",
//     no struck-out price equal to the price paid.
//   * A deal without a price shows "Price not set" and cannot be ordered.

const num = (value) => (value === null || value === undefined || value === '' ? null : Number(value))

// Percentage discount that is actually applied, or null.
export function realDiscountPercent(deal) {
  const type = deal?.offer_type || 'percentage'
  if (type !== 'percentage' && type !== 'group_buy') return null
  const pct = num(deal.discount_percent ?? (type === 'percentage' ? deal.discount_value : null))
  return Number.isFinite(pct) && pct > 0 && pct <= 100 ? pct : null
}

// Price the student pays for one item (or one bundle), or null if not set.
export function studentPrice(deal) {
  if (!deal) return null
  const type = deal.offer_type || 'percentage'
  if (type === 'fixed_price') {
    const bundle = num(deal.final_price ?? deal.discount_value)
    return Number.isFinite(bundle) && bundle > 0 ? bundle : null
  }
  const price = num(deal.price)
  if (!Number.isFinite(price) || price <= 0) return null
  if (type === 'fixed_amount') {
    const saving = num(deal.discount_value)
    return Number.isFinite(saving) && saving > 0 && saving < price ? Math.round(price - saving) : price
  }
  const pct = realDiscountPercent(deal)
  return pct ? Math.round(price * (1 - pct / 100)) : price
}

// The original price to strike out, only when the student really pays less.
export function struckOutPrice(deal) {
  const paid = studentPrice(deal)
  const price = num(deal?.price)
  return paid !== null && Number.isFinite(price) && price > paid ? price : null
}

export function hasStudentPrice(deal) {
  return deal?.offer_type === 'free_shipping' ? false : studentPrice(deal) !== null
}

// Badge on the deal photo, or null when there is nothing honest to say.
export function offerBadge(deal) {
  const type = deal?.offer_type || 'percentage'
  if (type === 'percentage') {
    const pct = realDiscountPercent(deal)
    return pct ? `${pct}% OFF` : null
  }
  if (type === 'fixed_amount') {
    const saving = num(deal.discount_value)
    return Number.isFinite(saving) && saving > 0 ? `SAVE ${saving.toLocaleString('en-US')} RWF` : null
  }
  if (type === 'bogo') return `BUY ${deal.buy_quantity ?? 1} GET ${deal.get_quantity ?? 1}`
  if (type === 'fixed_price') {
    const bundle = studentPrice(deal)
    return bundle ? `BUNDLE ${bundle.toLocaleString('en-US')} RWF` : null
  }
  if (type === 'free_shipping') return 'FREE DELIVERY'
  if (type === 'group_buy') return `GROUP BUY · ${deal.min_participants ?? 5} NEEDED`
  return 'TIERED DEAL'
}
