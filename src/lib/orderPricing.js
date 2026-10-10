// What the student will pay for a deal and a quantity, shown before ordering.
const roundMoney = (value) => Math.round(value * 100) / 100

// Mirrors priceOrder() in supabase/functions/create-order/index.ts, which is
// the source of truth for what the student is charged. Keep the two in sync
// (supabase/functions/tests/order-pricing.test.ts checks the cases).
export function priceOrder(deal, quantity) {
  const offerType = deal.offer_type || 'percentage'
  const price = deal.price == null ? null : Number(deal.price)

  if (deal.expires_at && new Date(deal.expires_at) <= new Date()) {
    return { error: 'This deal has expired.' }
  }

  if (offerType === 'tiered') {
    return { error: 'Tiered deals are not yet supported at checkout.' }
  }

  if (offerType === 'free_shipping') {
    return { error: 'This deal cannot be ordered yet.' }
  }

  if (offerType === 'fixed_price') {
    const bundlePrice = Number(deal.final_price ?? deal.discount_value)
    if (!Number.isFinite(bundlePrice) || bundlePrice <= 0) {
      return { error: 'This deal does not have a valid price.' }
    }
    if (quantity > 1) {
      return { error: 'Bundle deals can only be ordered one at a time.', maxQuantity: 1 }
    }
    return {
      unitPrice: roundMoney(bundlePrice),
      total: roundMoney(bundlePrice),
      unitLabel: 'Bundle price',
      maxQuantity: 1,
    }
  }

  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { error: 'This deal does not have a valid price.' }
  }

  if (offerType === 'percentage' || offerType === 'group_buy') {
    const unitPrice = roundMoney(price * (1 - Number(deal.discount_percent ?? 0) / 100))
    return { unitPrice, total: roundMoney(unitPrice * quantity), unitLabel: 'Price each' }
  }

  if (offerType === 'fixed_amount') {
    const discountValue = Number(deal.discount_value)
    if (!Number.isFinite(discountValue) || discountValue <= 0 || discountValue >= price) {
      return { error: 'This deal has an invalid discount.' }
    }
    const unitPrice = roundMoney(price - discountValue)
    return { unitPrice, total: roundMoney(unitPrice * quantity), unitLabel: 'Price each' }
  }

  if (offerType === 'bogo') {
    const buyQuantity = Number(deal.buy_quantity ?? 1)
    const getQuantity = Number(deal.get_quantity ?? 1)
    if (!Number.isInteger(buyQuantity) || buyQuantity < 1) {
      return { error: 'This deal has an invalid offer.' }
    }
    const unitPrice = roundMoney(price * buyQuantity)
    return {
      unitPrice,
      total: roundMoney(unitPrice * quantity),
      unitLabel: `Price per deal (pay ${buyQuantity}, get ${getQuantity} free)`,
      itemsReceived: (buyQuantity + getQuantity) * quantity,
    }
  }

  return { error: 'This deal cannot be ordered yet.' }
}
