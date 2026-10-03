// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-group-order-payment/index.ts')
const handle = serveStub.handler!

const HOST = 'host-user'
const GROUP = 'group-1'
const DEAL = 'deal-1'

function seed({ members, minParticipants }: { members: number; minParticipants: number | null }) {
  resetDb()
  db.users[HOST] = {
    id: HOST, email: 'host@keplercollege.ac.rw', user_metadata: { full_name: 'Host', phone: '0780000000' },
    app_metadata: { university: 'Kepler College' },
  }
  db.tables.user_roles = [{ user_id: HOST, role: 'student' }]
  db.users['merchant-1'] = { id: 'merchant-1', user_metadata: { phone: '0790000000' } }
  db.tokens['host-token'] = HOST
  db.tables.group_orders = [{ id: GROUP, deal_id: DEAL, created_by: HOST, host_name: 'Host', join_code: 'K7Q2', status: 'open' }]
  db.tables.deals = [{
    id: DEAL, merchant_id: 'merchant-1', price: 2500, discount_percent: 20, active: true,
    expires_at: null, min_participants: minParticipants,
  }]
  db.tables.group_order_members = Array.from({ length: members }, (_, i) => ({
    id: `m${i}`, group_order_id: GROUP, student_id: i === 0 ? HOST : `student-${i}`, student_name: `S${i}`, quantity: 1,
  }))
  db.tables.merchant_profiles = [{ id: 'merchant-1', approved: true }]
  db.tables.orders = []
  db.tables.notifications = []
}

const submit = () =>
  handle(new Request('http://fake/create-group-order-payment', {
    method: 'POST',
    headers: { Authorization: 'Bearer host-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ group_order_id: GROUP }),
  }))

Deno.test('3 members with min_participants 5 → 409, no order created, group stays open', async () => {
  seed({ members: 3, minParticipants: 5 })
  const res = await submit()
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, 'This group needs 2 more members before it can be submitted')
  assertEquals(db.tables.orders.length, 0)
  assertEquals(db.tables.group_orders[0].status, 'open')
  assertEquals(db.tables.notifications.length, 0)
})

Deno.test('4 members with min_participants 5 → singular "1 more member"', async () => {
  seed({ members: 4, minParticipants: 5 })
  const res = await submit()
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, 'This group needs 1 more member before it can be submitted')
})

Deno.test('5 members with min_participants 5 → 201, one merchant order, group closed', async () => {
  seed({ members: 5, minParticipants: 5 })
  const res = await submit()
  assertEquals(res.status, 201)
  const { order } = await res.json()
  assertEquals(order.group_order_id, GROUP)
  assertEquals(order.quantity, 5)
  // Price calculation unchanged: 2500 × (1 − 20%) = 2000 per unit.
  assertEquals(order.unit_price, 2000)
  assertEquals(order.total_price, 10000)
  assertEquals(db.tables.orders.length, 1)
  assertEquals(db.tables.group_orders[0].status, 'closed')
})

Deno.test('duplicate student rows count once (distinct student_id)', async () => {
  seed({ members: 4, minParticipants: 5 })
  db.tables.group_order_members.push({ id: 'dup', group_order_id: GROUP, student_id: 'student-1', student_name: 'S1', quantity: 1 })
  const res = await submit()
  assertEquals(res.status, 409)
})

Deno.test('min_participants null → allowed as before', async () => {
  seed({ members: 1, minParticipants: null })
  const res = await submit()
  assertEquals(res.status, 201)
})

// Fix 7: 24-hour groups, deal expiry, resubmission after a dead order.
Deno.test('group past its 24 hours → 409, no order', async () => {
  seed({ members: 3, minParticipants: null })
  db.tables.group_orders[0].expires_at = new Date(Date.now() - 60_000).toISOString()
  const res = await submit()
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, 'This group closed after 24 hours. Start a new group to order.')
  assertEquals(db.tables.orders.length, 0)
})

Deno.test('expired deal → 409, no order, group stays open', async () => {
  seed({ members: 3, minParticipants: null })
  db.tables.deals[0].expires_at = new Date(Date.now() - 60_000).toISOString()
  const res = await submit()
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, 'This deal has ended')
  assertEquals(db.tables.group_orders[0].status, 'open')
})

Deno.test('previous order declined (group reopened) → host can submit again → 201', async () => {
  seed({ members: 3, minParticipants: null })
  db.tables.orders.push({ id: 'dead', group_order_id: GROUP, status: 'declined' })
  const res = await submit()
  assertEquals(res.status, 201)
  assertEquals(db.tables.orders.filter((o) => o.group_order_id === GROUP).length, 2)
})

Deno.test('a live order for the group already exists → 409', async () => {
  seed({ members: 3, minParticipants: null })
  db.tables.orders.push({ id: 'live', group_order_id: GROUP, status: 'pending_confirmation' })
  const res = await submit()
  assertEquals(res.status, 409)
  assertEquals((await res.json()).order_id, 'live')
})
