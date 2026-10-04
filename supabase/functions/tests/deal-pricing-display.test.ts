// The price students SEE (src/lib/dealPricing.js) must equal the price they are
// CHARGED (create-order), and a discount is only shown when it is real
// (founder decision 2026-10-04: a deal does not have to be a discount).
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
// @ts-ignore: plain JS module from the web app
import { hasStudentPrice, offerBadge, realDiscountPercent, struckOutPrice, studentPrice } from '../../../src/lib/dealPricing.js'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-order/index.ts')
const createOrder = serveStub.handler!

const base = {
  id: 'deal-1', merchant_id: 'merchant-1', title: 'Deal', active: true, expires_at: null,
  discount_percent: null, discount_value: null, final_price: null, buy_quantity: null, get_quantity: null, min_participants: null,
}
type Case = [string, Record<string, unknown>, { shown: number | null; struck: number | null; badge: string | null; pct: number | null }]
const cases: Case[] = [
  ['20% off 6000', { offer_type: 'percentage', price: 6000, discount_percent: 20 }, { shown: 4800, struck: 6000, badge: '20% OFF', pct: 20 }],
  ['no discount (empty)', { offer_type: 'percentage', price: 8000 }, { shown: 8000, struck: null, badge: null, pct: null }],
  ['no discount (0%)', { offer_type: 'percentage', price: 8000, discount_percent: 0 }, { shown: 8000, struck: null, badge: null, pct: null }],
  ['group buy, no discount', { offer_type: 'group_buy', price: 10000, discount_percent: 0, min_participants: 5 }, { shown: 10000, struck: null, badge: 'GROUP BUY · 5 NEEDED', pct: null }],
  ['save 500 RWF', { offer_type: 'fixed_amount', price: 3000, discount_value: 500 }, { shown: 2500, struck: 3000, badge: 'SAVE 500 RWF', pct: null }],
  ['bundle 7000', { offer_type: 'fixed_price', price: 9000, final_price: 7000 }, { shown: 7000, struck: 9000, badge: 'BUNDLE 7,000 RWF', pct: null }],
]

for (const [label, deal, want] of cases) {
  Deno.test(`display: ${label}`, () => {
    const d = { ...base, ...deal }
    assertEquals(
      { shown: studentPrice(d), struck: struckOutPrice(d), badge: offerBadge(d), pct: realDiscountPercent(d) },
      want,
    )
  })
}

for (const [label, deal, want] of cases.filter(([, d]) => d.offer_type !== 'group_buy')) {
  Deno.test(`charged = shown: ${label}`, async () => {
    resetDb()
    db.users['student-1'] = { id: 'student-1', email: 's@keplercollege.ac.rw', user_metadata: { full_name: 'S', phone: '0780000000' }, app_metadata: { university: 'Kepler College' } } as typeof db.users[string]
    db.users['merchant-1'] = { id: 'merchant-1', user_metadata: { phone: '0790000000' } }
    db.tokens['tok'] = 'student-1'
    db.tables.user_roles = [{ user_id: 'student-1', role: 'student' }]
    db.tables.merchant_profiles = [{ id: 'merchant-1', approved: true }]
    db.tables.deals = [{ ...base, ...deal }]
    db.tables.orders = []
    db.tables.notifications = []
    const res = await createOrder(new Request('http://fake/create-order', {
      method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
      body: JSON.stringify({ deal_id: 'deal-1', quantity: 1 }),
    }))
    assertEquals(res.status, 201)
    assertEquals(Number(db.tables.orders[0].unit_price), want.shown)
  })
}

Deno.test('no price → "Price not set", cannot be ordered, and the server refuses too', async () => {
  const d = { ...base, offer_type: 'percentage', price: null }
  assertEquals([studentPrice(d), hasStudentPrice(d), offerBadge(d)], [null, false, null])
  resetDb()
  db.users['student-1'] = { id: 'student-1', email: 's@keplercollege.ac.rw', user_metadata: { full_name: 'S', phone: '0780000000' }, app_metadata: { university: 'Kepler College' } } as typeof db.users[string]
  db.users['merchant-1'] = { id: 'merchant-1', user_metadata: { phone: '0790000000' } }
  db.tokens['tok'] = 'student-1'
  db.tables.user_roles = [{ user_id: 'student-1', role: 'student' }]
  db.tables.merchant_profiles = [{ id: 'merchant-1', approved: true }]
  db.tables.deals = [d]
  db.tables.orders = []
  const res = await createOrder(new Request('http://fake/create-order', {
    method: 'POST', headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: JSON.stringify({ deal_id: 'deal-1', quantity: 1 }),
  }))
  assertEquals(res.status, 409)
})
