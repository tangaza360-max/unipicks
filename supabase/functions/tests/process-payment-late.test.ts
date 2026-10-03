// Fix 4 (founder decision): the 5-minute window limits *starting* a payment.
// If UmunotaPay confirms the money after the window closed (a slow MoMo
// prompt), process-payment marks the order paid instead of "charged but
// expired". A failure after the window expires the order.
// fetch (UmunotaPay) is stubbed; the database is the in-memory fake.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
Deno.env.set('UMUNOTA_API_KEY', 'pk_test')
Deno.env.set('UMUNOTA_WEBHOOK_SECRET', 'whsec_test')
await import('../process-payment/index.ts')
const handle = serveStub.handler!

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'

// UmunotaPay stub: answers with `providerStatus`, after `delayMs`.
let providerStatus = 'success'
let delayMs = 0
globalThis.fetch = async () => {
  await new Promise((r) => setTimeout(r, delayMs))
  return new Response(JSON.stringify({ status: providerStatus, reference: 'UMP-TEST00000001', amount: 1500 }), { status: 200 })
}

function seed(deadlineInMs: number) {
  resetDb()
  db.users[STUDENT] = { id: STUDENT, email: 's@keplercollege.ac.rw', user_metadata: { full_name: 'S' }, app_metadata: { university: 'Kepler College' } }
  db.tokens['tok'] = STUDENT
  db.tables.orders = [{
    id: 'order-1', student_id: STUDENT, merchant_id: MERCHANT, deal_id: 'deal-1', quantity: 1, unit_price: 1500,
    total_price: 1500, status: 'confirmed', payment_deadline: new Date(Date.now() + deadlineInMs).toISOString(),
    confirmation_deadline: new Date(Date.now() - 60_000).toISOString(), merchant_phone: '0790000000',
  }]
  db.tables.redemptions = []
  db.tables.transactions = []
  db.tables.chat_messages = []
  db.tables.notifications = []
}

const pay = () =>
  handle(new Request('http://fake/process-payment', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: 'order-1', phone: '0788123456' }),
  }))

Deno.test('started in time, UmunotaPay confirms after the window closed → paid, pickup code sent', async () => {
  seed(150)          // window closes 150 ms from now
  providerStatus = 'success'
  delayMs = 400      // the provider answers after it closed
  const res = await pay()
  const body = await res.json()
  assertEquals(res.status, 200, JSON.stringify(body))
  assertEquals(body.status, 'paid')
  assertEquals(db.tables.orders[0].status, 'paid')
  assertEquals(db.tables.transactions[0].status, 'paid')
  assertEquals(db.tables.chat_messages.filter((m) => String(m.message).includes('Pickup code:')).length, 1)
})

Deno.test('payment not started in time → refused, order expired, provider never called', async () => {
  seed(-1000)
  let called = false
  const realFetch = globalThis.fetch
  globalThis.fetch = (() => { called = true; return realFetch('') }) as typeof fetch
  try {
    const res = await pay()
    assertEquals(res.status, 409)
    assertEquals(db.tables.orders[0].status, 'payment_expired')
    assertEquals(called, false)
  } finally {
    globalThis.fetch = realFetch
  }
})

Deno.test('UmunotaPay says failed after the window closed → payment_expired (no retry)', async () => {
  seed(150)
  providerStatus = 'failed'
  delayMs = 400
  await pay()
  assertEquals(db.tables.orders[0].status, 'payment_expired')
})

Deno.test('UmunotaPay says failed inside the window → back to confirmed (retry possible)', async () => {
  seed(5 * 60_000)
  providerStatus = 'failed'
  delayMs = 0
  await pay()
  assertEquals(db.tables.orders[0].status, 'confirmed')
})
