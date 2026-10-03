// Fix 6 (ecosystem audit J2/J8): banned, deactivated or deleted merchants
// can't receive orders or accept them; declining stays possible.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import { MERCHANT_UNAVAILABLE_ERROR } from '../_shared/merchant-standing.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-order/index.ts')
const createOrder = serveStub.handler!
await import('../create-group-order-payment/index.ts')
const submitGroup = serveStub.handler!

// update-order-status uses Deno.serve: capture its handler.
let updateOrderStatus: ((r: Request) => Promise<Response>) | null = null
const realServe = Deno.serve
;(Deno as unknown as { serve: unknown }).serve = (handler: (r: Request) => Promise<Response>) => {
  updateOrderStatus = handler
  return {} as Deno.HttpServer
}
await import('../update-order-status/index.ts')
;(Deno as unknown as { serve: unknown }).serve = realServe

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'

type Standing = 'ok' | 'not_approved' | 'banned' | 'deleted'

function seed(standing: Standing) {
  resetDb()
  db.users[STUDENT] = {
    id: STUDENT, email: 's@keplercollege.ac.rw', user_metadata: { full_name: 'S', phone: '0780000000' },
    app_metadata: { university: 'Kepler College' },
  }
  db.users[MERCHANT] = {
    id: MERCHANT, email: 'm@shop.rw', user_metadata: { phone: '0790000000' },
    app_metadata: standing === 'banned' ? { banned: true } : standing === 'deleted' ? { deleted_at: '2026-10-03', banned: true } : {},
  }
  db.tokens['student-tok'] = STUDENT
  db.tokens['merchant-tok'] = MERCHANT
  db.tables.user_roles = [{ user_id: STUDENT, role: 'student' }, { user_id: MERCHANT, role: 'merchant' }]
  db.tables.merchant_profiles = [{ id: MERCHANT, approved: standing !== 'not_approved' }]
  db.tables.deals = [{
    id: 'deal-1', merchant_id: MERCHANT, title: 'Wrap', price: 2000, discount_percent: 0, active: true,
    expires_at: null, offer_type: 'percentage', discount_value: null, final_price: null, buy_quantity: null,
    min_participants: null,
  }]
  db.tables.orders = [{
    id: 'order-1', student_id: STUDENT, merchant_id: MERCHANT, deal_id: 'deal-1', quantity: 1, unit_price: 2000,
    total_price: 2000, status: 'pending_confirmation', confirmation_deadline: new Date(Date.now() + 60_000).toISOString(),
  }]
  db.tables.notifications = []
  db.tables.chat_messages = []
  db.tables.group_orders = [{ id: 'g-1', deal_id: 'deal-1', created_by: STUDENT, host_name: 'S', join_code: 'K7Q2', status: 'open' }]
  db.tables.group_order_members = [{ id: 'm-1', group_order_id: 'g-1', student_id: STUDENT, student_name: 'S', quantity: 1 }]
}

const post = (handler: (r: Request) => Promise<Response>, token: string, body: unknown) =>
  handler(new Request('http://fake/fn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

for (const standing of ['not_approved', 'banned', 'deleted'] as Standing[]) {
  Deno.test(`create-order: merchant ${standing} → 409, no order`, async () => {
    seed(standing)
    const res = await post(createOrder, 'student-tok', { deal_id: 'deal-1', quantity: 1 })
    assertEquals(res.status, 409)
    assertEquals((await res.json()).error, MERCHANT_UNAVAILABLE_ERROR)
    assertEquals(db.tables.orders.length, 1) // only the seeded one
  })

  Deno.test(`create-group-order-payment: merchant ${standing} → 409, group stays open`, async () => {
    seed(standing)
    const res = await post(submitGroup, 'student-tok', { group_order_id: 'g-1' })
    assertEquals(res.status, 409)
    assertEquals(db.tables.group_orders[0].status, 'open')
  })
}

Deno.test('create-order: merchant in good standing → 201', async () => {
  seed('ok')
  const res = await post(createOrder, 'student-tok', { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 201)
})

Deno.test('update-order-status: banned merchant can\'t accept → 403, order unchanged', async () => {
  seed('banned')
  const res = await post(updateOrderStatus!, 'merchant-tok', { order_id: 'order-1', action: 'accept' })
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, 'Your account is suspended. Contact support.')
  assertEquals(db.tables.orders[0].status, 'pending_confirmation')
})

Deno.test('update-order-status: deactivated merchant can\'t accept → 403', async () => {
  seed('not_approved')
  const res = await post(updateOrderStatus!, 'merchant-tok', { order_id: 'order-1', action: 'accept' })
  assertEquals(res.status, 403)
  assertEquals(db.tables.orders[0].status, 'pending_confirmation')
})

Deno.test('update-order-status: banned merchant can still decline (releases the student)', async () => {
  seed('banned')
  const res = await post(updateOrderStatus!, 'merchant-tok', { order_id: 'order-1', action: 'decline', decline_reason: 'closed' })
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].status, 'declined')
})

Deno.test('update-order-status: merchant in good standing accepts → confirmed', async () => {
  seed('ok')
  const res = await post(updateOrderStatus!, 'merchant-tok', { order_id: 'order-1', action: 'accept' })
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].status, 'confirmed')
})
