// The business gets a "Payment received" phone alert when the payment is
// confirmed by process-payment (instant MoMo success), not only by
// payment-webhook. Exactly one alert per order, whichever path is first.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import { bytesToBase64Url } from '../_shared/web-push.ts'

const WEBHOOK_SECRET = 'whsec_test'
Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
Deno.env.set('UMUNOTA_API_KEY', 'pk_test')
Deno.env.set('UMUNOTA_WEBHOOK_SECRET', WEBHOOK_SECRET)

// Test VAPID keys and a test phone (only the push service call is checked here;
// encryption itself is covered by web-push.test.ts).
const vapid = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign']) as CryptoKeyPair
Deno.env.set('VAPID_PUBLIC_KEY', bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', vapid.publicKey))))
Deno.env.set('VAPID_PRIVATE_KEY', (await crypto.subtle.exportKey('jwk', vapid.privateKey)).d!)
const phone = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
const PHONE_KEY = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', phone.publicKey)))

await import('../process-payment/index.ts')
const processPayment = serveStub.handler!
await import('../payment-webhook/index.ts')
const paymentWebhook = serveStub.handler!

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'
const MERCHANT_PHONE = 'https://fcm.googleapis.com/fcm/send/merchant'

// Fake network: the push service records alerts; anything else is UmunotaPay.
let providerStatus = 'success'
let pushes: string[] = []
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input instanceof Request ? input.url : input)
  if (url.startsWith('https://fcm.googleapis.com/')) {
    pushes.push(url)
    return new Response(null, { status: 201 })
  }
  return new Response(JSON.stringify({ status: providerStatus, reference: 'UMP-TEST00000001', amount: 1500 }), { status: 200 })
}) as typeof fetch

function seed() {
  resetDb()
  pushes = []
  providerStatus = 'success'
  db.users[STUDENT] = { id: STUDENT, email: 's@keplercollege.ac.rw', user_metadata: { full_name: 'S' }, app_metadata: { university: 'Kepler College' } }
  db.tokens['tok'] = STUDENT
  db.tables.deals = [{ id: 'deal-1', merchant_id: MERCHANT, title: 'Tacos Tuesday' }]
  db.tables.orders = [{
    id: 'order-1', student_id: STUDENT, merchant_id: MERCHANT, deal_id: 'deal-1', quantity: 1, unit_price: 1500,
    total_price: 1500, status: 'confirmed', payment_deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    confirmation_deadline: new Date(Date.now() - 60_000).toISOString(), merchant_phone: '0790000000',
  }]
  db.tables.redemptions = []
  db.tables.transactions = []
  db.tables.chat_messages = []
  db.tables.notifications = []
  db.tables.push_subscriptions = [{ id: 'p-1', user_id: MERCHANT, endpoint: MERCHANT_PHONE, p256dh: PHONE_KEY, auth: bytesToBase64Url(new Uint8Array(16).fill(7)) }]
}

const pay = () =>
  processPayment(new Request('http://fake/process-payment', {
    method: 'POST',
    headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json' },
    body: JSON.stringify({ order_id: 'order-1', phone: '0788123456' }),
  }))

async function hmac(body: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('')
}
async function webhook() {
  const tx = db.tables.transactions[0]
  const body = JSON.stringify({ reference: tx.umunota_reference, status: 'success', amount: 1500 })
  return paymentWebhook(new Request('http://fake/payment-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': await hmac(body) },
    body,
  }))
}

Deno.test('instant MoMo success in process-payment → the business phone gets one "Payment received" alert', async () => {
  seed()
  const res = await pay()
  assertEquals((await res.json()).status, 'paid')
  assertEquals(db.tables.orders[0].status, 'paid')
  assertEquals(pushes, [MERCHANT_PHONE])
})

Deno.test('the webhook for the same payment arrives later → no second alert', async () => {
  seed()
  await pay()
  assertEquals((await webhook()).status, 200)
  assertEquals(pushes.length, 1)
})

Deno.test('student taps "Pay" again on a paid order → no second alert', async () => {
  seed()
  await pay()
  const again = await pay()
  assertEquals((await again.json()).status, 'paid')
  assertEquals(pushes.length, 1)
})

Deno.test('payment failed → no "Payment received" alert', async () => {
  seed()
  providerStatus = 'failed'
  await pay()
  assertEquals(db.tables.orders[0].status, 'confirmed')
  assertEquals(pushes.length, 0)
})

Deno.test('provider still processing, then the webhook confirms → exactly one alert (from the webhook)', async () => {
  seed()
  providerStatus = 'pending'
  await pay()
  assertEquals(db.tables.orders[0].status, 'payment_processing')
  assertEquals(pushes.length, 0)
  assertEquals((await webhook()).status, 200)
  assertEquals(db.tables.orders[0].status, 'paid')
  assertEquals(pushes.length, 1)
})
