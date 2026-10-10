// The price shown before ordering (src/lib/orderPricing.js) must match what
// create-order charges. Cases follow priceOrder() in create-order/index.ts.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { priceOrder } from '../../../src/lib/orderPricing.js'

const base = { price: 6000, expires_at: null }
const pick = (r: Record<string, unknown>) => (r.error ? { error: r.error } : { unitPrice: r.unitPrice, total: r.total })

Deno.test('percentage and group buy: price minus percent, times quantity', () => {
  assertEquals(pick(priceOrder({ ...base, offer_type: 'percentage', discount_percent: 20 }, 3)), { unitPrice: 4800, total: 14400 })
  assertEquals(pick(priceOrder({ ...base, offer_type: 'group_buy', discount_percent: 10 }, 1)), { unitPrice: 5400, total: 5400 })
  assertEquals(pick(priceOrder({ ...base, offer_type: null, discount_percent: null }, 2)), { unitPrice: 6000, total: 12000 })
})

Deno.test('fixed amount off; invalid discounts refused', () => {
  assertEquals(pick(priceOrder({ ...base, offer_type: 'fixed_amount', discount_value: 1500 }, 2)), { unitPrice: 4500, total: 9000 })
  assertEquals(pick(priceOrder({ ...base, offer_type: 'fixed_amount', discount_value: 6000 }, 1)), { error: 'This deal has an invalid discount.' })
})

Deno.test('bundle (fixed price): one at a time', () => {
  assertEquals(pick(priceOrder({ ...base, offer_type: 'fixed_price', final_price: 8000 }, 1)), { unitPrice: 8000, total: 8000 })
  assertEquals(priceOrder({ ...base, offer_type: 'fixed_price', final_price: 8000 }, 1).maxQuantity, 1)
  assertEquals(pick(priceOrder({ ...base, offer_type: 'fixed_price', final_price: 8000 }, 2)), { error: 'Bundle deals can only be ordered one at a time.' })
})

Deno.test('buy one get one: pay for the bought items', () => {
  const r = priceOrder({ price: 2000, offer_type: 'bogo', buy_quantity: 2, get_quantity: 1 }, 2)
  assertEquals(pick(r), { unitPrice: 4000, total: 8000 })
  assertEquals(r.itemsReceived, 6)
})

Deno.test('not orderable: no price, tiered, free shipping, expired', () => {
  assertEquals(pick(priceOrder({ price: null, offer_type: 'percentage' }, 1)), { error: 'This deal does not have a valid price.' })
  assertEquals(pick(priceOrder({ ...base, offer_type: 'tiered' }, 1)), { error: 'Tiered deals are not yet supported at checkout.' })
  assertEquals(pick(priceOrder({ ...base, offer_type: 'free_shipping' }, 1)), { error: 'This deal cannot be ordered yet.' })
  assertEquals(pick(priceOrder({ ...base, offer_type: 'percentage', expires_at: '2000-01-01T00:00:00Z' }, 1)), { error: 'This deal has expired.' })
})
