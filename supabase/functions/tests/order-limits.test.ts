// Spam guard: at most 3 waiting orders per student (OWASP API6:2023).
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import { TOO_MANY_WAITING_ORDERS_ERROR } from '../_shared/order-limits.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-order/index.ts')
const createOrder = serveStub.handler!
await import('../create-group-order-payment/index.ts')
const submitGroup = serveStub.handler!

const USER = 'user-1'
const OTHER = 'user-2'

function seed(existingOrders: { student_id: string; status: string }[]) {
  resetDb()
  db.users[USER] = {
    id: USER, email: 'x@keplercollege.ac.rw',
    user_metadata: { full_name: 'X', phone: '0780000000' },
    app_metadata: { university: 'Kepler College' },
  } as typeof db.users[string]
  db.users['merchant-1'] = { id: 'merchant-1', user_metadata: { phone: '0790000000' } }
  db.tokens['tok'] = USER
  db.tables.user_roles = [{ user_id: USER, role: 'student' }]
  db.tables.deals = [{
    id: 'deal-1', merchant_id: 'merchant-1', price: 2000, discount_percent: 0, active: true,
    expires_at: null, offer_type: 'percentage', discount_value: null, final_price: null, buy_quantity: null,
    min_participants: null,
  }]
  db.tables.merchant_profiles = [{ id: 'merchant-1', approved: true }]
  db.tables.orders = existingOrders.map((o, i) => ({ id: `old-${i}`, deal_id: 'deal-1', merchant_id: 'merchant-1', ...o }))
  db.tables.notifications = []
  db.tables.group_orders = [{ id: 'g-1', deal_id: 'deal-1', created_by: USER, host_name: 'X', join_code: 'K7Q2', status: 'open' }]
  db.tables.group_order_members = [{ id: 'm-1', group_order_id: 'g-1', student_id: USER, student_name: 'X', quantity: 1 }]
}

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('http://fake/fn', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

const waiting = (n: number, student = USER) =>
  Array.from({ length: n }, (_, i) => ({ student_id: student, status: i % 2 ? 'confirmed' : 'pending_confirmation' }))

Deno.test('create-order: 2 waiting orders → new order allowed (201)', async () => {
  seed(waiting(2))
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 201)
  assertEquals(db.tables.orders.length, 3)
})

Deno.test('create-order: 3 waiting orders → 429, nothing saved', async () => {
  seed(waiting(3))
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 429)
  assertEquals((await res.json()).error, TOO_MANY_WAITING_ORDERS_ERROR)
  assertEquals(db.tables.orders.length, 3)
})

Deno.test('create-order: finished or in-payment orders do not count', async () => {
  seed(['paid', 'redeemed', 'declined', 'confirmation_expired', 'payment_expired', 'payment_processing', 'cancelled']
    .map((status) => ({ student_id: USER, status })))
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 201)
})

Deno.test("create-order: other students' waiting orders do not count", async () => {
  seed(waiting(5, OTHER))
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 201)
})

Deno.test('create-order: a large quantity in one order is still allowed', async () => {
  seed(waiting(2))
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 25 })
  assertEquals(res.status, 201)
})

Deno.test('create-group-order-payment: host with 3 waiting orders → 429, group stays open', async () => {
  seed(waiting(3))
  const res = await post(submitGroup, { group_order_id: 'g-1' })
  assertEquals(res.status, 429)
  assertEquals((await res.json()).error, TOO_MANY_WAITING_ORDERS_ERROR)
  assertEquals(db.tables.orders.length, 3)
  assertEquals(db.tables.group_orders[0].status, 'open')
})

Deno.test('create-group-order-payment: host with 2 waiting orders → group sent', async () => {
  seed(waiting(2))
  const res = await post(submitGroup, { group_order_id: 'g-1' })
  assertEquals(db.tables.orders.length, 3)
  assertEquals(db.tables.orders[2].group_order_id, 'g-1')
  assertEquals(res.status < 400, true)
})
