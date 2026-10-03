// P4: banned users can't create orders. Orders are written by Edge Functions
// with the service role (no RLS / triggers see the caller), so each function
// checks app_metadata.banned itself.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-order/index.ts')
const createOrder = serveStub.handler!
await import('../create-group-order-payment/index.ts')
const submitGroup = serveStub.handler!

const STUDENT = 'student-1'
const SUSPENDED = 'Your account is suspended. Contact support.'

function seed(banned: boolean) {
  resetDb()
  db.users[STUDENT] = {
    id: STUDENT, email: 's@keplercollege.ac.rw',
    user_metadata: { full_name: 'S', phone: '0780000000', banned: false }, // user-editable copy is ignored
    app_metadata: banned ? { banned: true } : {},
  } as typeof db.users[string]
  db.users['merchant-1'] = { id: 'merchant-1', user_metadata: { phone: '0790000000' } }
  db.tokens['tok'] = STUDENT
  db.tables.deals = [{
    id: 'deal-1', merchant_id: 'merchant-1', price: 2000, discount_percent: 0, active: true,
    expires_at: null, offer_type: 'percentage', discount_value: null, final_price: null, buy_quantity: null,
    min_participants: null,
  }]
  db.tables.orders = []
  db.tables.notifications = []
  db.tables.group_orders = [{ id: 'g-1', deal_id: 'deal-1', created_by: STUDENT, host_name: 'S', join_code: 'K7Q2', status: 'open' }]
  db.tables.group_order_members = [{ id: 'm-1', group_order_id: 'g-1', student_id: STUDENT, student_name: 'S', quantity: 1 }]
}

const post = (handler: (r: Request) => Promise<Response>, body: unknown) =>
  handler(new Request('http://fake/fn', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

Deno.test('create-order: banned → 403, no order written', async () => {
  seed(true)
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, SUSPENDED)
  assertEquals(db.tables.orders.length, 0)
})

Deno.test('create-order: not banned (user_metadata.banned ignored) → 201', async () => {
  seed(false)
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 201)
  assertEquals(db.tables.orders.length, 1)
})

Deno.test('create-group-order-payment: banned host → 403, no order, group stays open', async () => {
  seed(true)
  const res = await post(submitGroup, { group_order_id: 'g-1' })
  assertEquals(res.status, 403)
  assertEquals((await res.json()).error, SUSPENDED)
  assertEquals(db.tables.orders.length, 0)
  assertEquals(db.tables.group_orders[0].status, 'open')
})

Deno.test('create-group-order-payment: not banned → 201', async () => {
  seed(false)
  const res = await post(submitGroup, { group_order_id: 'g-1' })
  assertEquals(res.status, 201)
})
