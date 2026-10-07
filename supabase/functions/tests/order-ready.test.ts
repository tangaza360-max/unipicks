// "Food ready" (founder decision 2026-10-07): the business marks a paid order
// ready; the student gets one message and one phone alert. Status stays paid.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import { bytesToBase64Url } from '../_shared/web-push.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair
Deno.env.set('VAPID_PUBLIC_KEY', bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey))))
Deno.env.set('VAPID_PRIVATE_KEY', (await crypto.subtle.exportKey('jwk', vapid.privateKey)).d!)
const phone = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
const PHONE_KEY = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', phone.publicKey)))

// update-order-status uses the built-in Deno.serve: catch its handler.
let updateOrder: (req: Request) => Promise<Response> = () => Promise.reject(new Error('not loaded'))
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = (h: (req: Request) => Promise<Response>) => {
  updateOrder = h
}
await import('../update-order-status/index.ts')

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'
const STUDENT_PHONE = 'https://fcm.googleapis.com/fcm/send/student'

let pushes: string[] = []
globalThis.fetch = (async (input: string | URL | Request) => {
  pushes.push(String(input instanceof Request ? input.url : input))
  return new Response(null, { status: 201 })
}) as typeof fetch

function seed(status = 'paid') {
  resetDb()
  pushes = []
  // Real columns of public.orders in production (2026-10-07) plus ready_at.
  db.columns.orders = ['id', 'student_id', 'merchant_id', 'deal_id', 'quantity', 'unit_price', 'total_price', 'status',
    'confirmation_deadline', 'created_at', 'updated_at', 'payment_deadline', 'student_phone', 'merchant_phone',
    'decline_reason', 'decline_reason_note', 'dispute_status', 'dispute_reason', 'dispute_raised_by', 'dispute_raised_at',
    'dispute_resolution_note', 'group_order_id', 'ready_at']
  db.users[MERCHANT] = { id: MERCHANT, email: 'm@test', user_metadata: { role: 'merchant' }, app_metadata: {} }
  db.users['merchant-2'] = { id: 'merchant-2', email: 'm2@test', user_metadata: { role: 'merchant' }, app_metadata: {} }
  db.users[STUDENT] = { id: STUDENT, email: 's@keplercollege.ac.rw', user_metadata: { role: 'student' }, app_metadata: {} }
  db.tokens['m'] = MERCHANT
  db.tokens['m2'] = 'merchant-2'
  db.tokens['s'] = STUDENT
  db.tables.deals = [{ id: 'deal-1', merchant_id: MERCHANT, title: 'Tacos Tuesday' }]
  db.tables.orders = [{
    id: 'order-1', student_id: STUDENT, merchant_id: MERCHANT, deal_id: 'deal-1', quantity: 1, unit_price: 1500,
    total_price: 1500, status, confirmation_deadline: new Date().toISOString(), ready_at: null,
  }]
  db.tables.chat_messages = []
  db.tables.push_subscriptions = [{ id: 'p-1', user_id: STUDENT, endpoint: STUDENT_PHONE, p256dh: PHONE_KEY, auth: bytesToBase64Url(new Uint8Array(16).fill(7)) }]
}

const ready = (token = 'm') =>
  updateOrder(new Request('http://fake/update-order-status', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: 'order-1', action: 'ready' }),
  }))

Deno.test('paid order: marked ready, status stays paid, one message and one alert', async () => {
  seed()
  const res = await ready()
  assertEquals(res.status, 200)
  const body = await res.json()
  const order = db.tables.orders[0]
  assertEquals(order.status, 'paid')
  assertEquals(typeof order.ready_at, 'string')
  assertEquals(body.order.ready_at, order.ready_at)
  assertEquals(db.tables.chat_messages.length, 1)
  const msg = db.tables.chat_messages[0]
  assertEquals([msg.sender_id, msg.receiver_id, msg.link_path, msg.link_label], [MERCHANT, STUDENT, '/dashboard/profile?view=orders', 'Show my code'])
  assertEquals(msg.message.startsWith('Your food is ready.'), true)
  assertEquals(pushes, [STUDENT_PHONE])
})

Deno.test('tapping Food ready twice: no second message or alert', async () => {
  seed()
  await ready()
  const first = db.tables.orders[0].ready_at
  const res = await ready()
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].ready_at, first)
  assertEquals(db.tables.chat_messages.length, 1)
  assertEquals(pushes.length, 1)
})

Deno.test('not paid yet: refused, nothing sent', async () => {
  for (const status of ['pending_confirmation', 'confirmed', 'payment_processing', 'redeemed', 'declined']) {
    seed(status)
    const res = await ready()
    assertEquals(res.status, 409, status)
    assertEquals((await res.json()).error, 'Only paid orders can be marked ready')
    assertEquals(db.tables.orders[0].ready_at, null)
    assertEquals(db.tables.chat_messages.length + pushes.length, 0)
  }
})

Deno.test('another business or the student cannot mark it ready', async () => {
  for (const token of ['m2', 's']) {
    seed()
    const res = await ready(token)
    assertEquals(res.status, 403, token)
    assertEquals(db.tables.orders[0].ready_at, null)
    assertEquals(pushes.length, 0)
  }
})
