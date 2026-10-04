// Phone alerts (Web Push): encryption (RFC 8291), VAPID (RFC 8292), sending,
// and the 4 order events (founder decision 2026-10-04).
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { createClient, db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import {
  base64UrlToBytes,
  bytesToBase64Url,
  encryptPayload,
  sendPushToUser,
  vapidAuthorization,
} from '../_shared/web-push.ts'
import { alertMerchantPaymentReceived } from '../_shared/order-alerts.ts'

const enc = new TextEncoder()
const dec = new TextDecoder()

// --- Test keys -------------------------------------------------------------------
async function p256() {
  const keys = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair
  return { keys, publicRaw: new Uint8Array(await crypto.subtle.exportKey('raw', keys.publicKey)) }
}
// A phone (user agent): its push keys.
const phone = await p256()
const phoneAuth = crypto.getRandomValues(new Uint8Array(16))
const PHONE_P256DH = bytesToBase64Url(phone.publicRaw)
const PHONE_AUTH = bytesToBase64Url(phoneAuth)
// Unipicks' VAPID keys (test only).
const vapidKeys = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair
const VAPID_PUBLIC = bytesToBase64Url(new Uint8Array(await crypto.subtle.exportKey('raw', vapidKeys.publicKey)))
const VAPID_PRIVATE = (await crypto.subtle.exportKey('jwk', vapidKeys.privateKey)).d!

// The phone's side of RFC 8291: decrypt what Unipicks sent. Written from the
// RFC independently of the sender (receiver keys, header parsing, padding).
type Bytes = Uint8Array<ArrayBuffer>
async function hkdf(salt: Bytes, ikm: Bytes, info: string | Bytes, len: number) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const infoBytes = typeof info === 'string' ? enc.encode(info) : info
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: infoBytes }, key, len * 8))
}
async function phoneDecrypt(body: Bytes) {
  const salt = body.slice(0, 16)
  const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0)
  const idlen = body[20]
  const asPublic = body.slice(21, 21 + idlen)
  const ciphertext = body.slice(21 + idlen)
  const asKey = await crypto.subtle.importKey('raw', asPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: asKey }, phone.keys.privateKey, 256))
  const info = new Uint8Array([...enc.encode('WebPush: info\0'), ...phone.publicRaw, ...asPublic])
  const ikm = await hkdf(phoneAuth, ecdh, info, 32)
  const cek = await hkdf(salt, ikm, 'Content-Encoding: aes128gcm\0', 16)
  const nonce = await hkdf(salt, ikm, 'Content-Encoding: nonce\0', 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt'])
  const padded = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, aes, ciphertext))
  let end = padded.length - 1
  while (end >= 0 && padded[end] === 0) end--
  assertEquals(padded[end], 2, 'last-record delimiter')
  return { rs, idlen, text: dec.decode(padded.slice(0, end)) }
}

// --- Fake push service -------------------------------------------------------
type Sent = { url: string; headers: Headers; body: Bytes }
let sent: Sent[] = []
let pushStatus: (url: string) => number | 'throw' = () => 201
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input)
  const status = pushStatus(url)
  if (status === 'throw') throw new TypeError('network down')
  sent.push({ url, headers: new Headers(init?.headers), body: new Uint8Array(init?.body as Uint8Array) })
  return new Response(null, { status })
}) as typeof fetch

async function alertsFor(endpointPrefix: string) {
  return await Promise.all(sent.filter((s) => s.url.startsWith(endpointPrefix)).map(async (s) => JSON.parse((await phoneDecrypt(s.body)).text)))
}

function useVapid(on = true) {
  if (on) {
    Deno.env.set('VAPID_PUBLIC_KEY', VAPID_PUBLIC)
    Deno.env.set('VAPID_PRIVATE_KEY', VAPID_PRIVATE)
    Deno.env.set('VAPID_SUBJECT', 'mailto:unipicks.team@gmail.com')
  } else {
    Deno.env.delete('VAPID_PUBLIC_KEY')
    Deno.env.delete('VAPID_PRIVATE_KEY')
  }
}

function phoneRow(userId: string, endpoint: string) {
  return { id: crypto.randomUUID(), user_id: userId, endpoint, p256dh: PHONE_P256DH, auth: PHONE_AUTH }
}

const MSG = { title: 'New order', body: 'Chips Mayai ×2. Accept or decline within 5 minutes.', url: '/dashboard/orders', tag: 't-1', ttlSeconds: 300, urgency: 'high' as const }

// --- Encryption and VAPID ----------------------------------------------------
Deno.test('RFC 8291: the phone decrypts exactly what was sent; header is salt|4096|65|server key', async () => {
  const body = await encryptPayload(enc.encode('{"title":"Hi"}'), PHONE_P256DH, PHONE_AUTH)
  const { rs, idlen, text } = await phoneDecrypt(body)
  assertEquals([rs, idlen, text], [4096, 65, '{"title":"Hi"}'])
  assertEquals(body[21], 4) // uncompressed P-256 point
})

Deno.test('RFC 8291: each message uses a fresh salt and server key', async () => {
  const a = await encryptPayload(enc.encode('same'), PHONE_P256DH, PHONE_AUTH)
  const b = await encryptPayload(enc.encode('same'), PHONE_P256DH, PHONE_AUTH)
  assert(bytesToBase64Url(a.slice(0, 86)) !== bytesToBase64Url(b.slice(0, 86)))
})

Deno.test('RFC 8291: a bad phone key is refused', async () => {
  let error = ''
  try {
    await encryptPayload(enc.encode('x'), bytesToBase64Url(new Uint8Array(10)), PHONE_AUTH)
  } catch (e) {
    error = (e as Error).message
  }
  assertEquals(error, 'bad p256dh key')
})

Deno.test('RFC 8292: VAPID token is signed by our key, for the push service origin, 12 h, with our contact', async () => {
  const now = 1_790_000_000
  const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', VAPID_PUBLIC, VAPID_PRIVATE, 'mailto:unipicks.team@gmail.com', now)
  const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!
  assert(m, header)
  assertEquals(JSON.parse(dec.decode(base64UrlToBytes(m[1]))), { typ: 'JWT', alg: 'ES256' })
  assertEquals(JSON.parse(dec.decode(base64UrlToBytes(m[2]))), { aud: 'https://fcm.googleapis.com', exp: now + 43200, sub: 'mailto:unipicks.team@gmail.com' })
  assertEquals(m[4], VAPID_PUBLIC)
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapidKeys.publicKey, base64UrlToBytes(m[3]), enc.encode(`${m[1]}.${m[2]}`))
  assert(ok, 'signature verifies with the VAPID public key')
})

// --- sendPushToUser ----------------------------------------------------------
Deno.test('send: every phone of the user gets the alert with the right headers; other users get nothing', async () => {
  resetDb(); sent = []; pushStatus = () => 201; useVapid()
  db.tables.push_subscriptions = [phoneRow('u1', 'https://fcm.googleapis.com/a'), phoneRow('u1', 'https://web.push.apple.com/b'), phoneRow('u2', 'https://fcm.googleapis.com/c')]
  const result = await sendPushToUser(createClient('', ''), 'u1', MSG)
  assertEquals(result, { sent: 2, removed: 0, failed: 0 })
  assertEquals(sent.map((s) => s.url).sort(), ['https://fcm.googleapis.com/a', 'https://web.push.apple.com/b'])
  const h = sent[0].headers
  assertEquals([h.get('content-encoding'), h.get('content-type'), h.get('ttl'), h.get('urgency')], ['aes128gcm', 'application/octet-stream', '300', 'high'])
  assertStringIncludes(h.get('authorization')!, 'vapid t=')
  assertEquals(JSON.parse((await phoneDecrypt(sent[0].body)).text), { title: MSG.title, body: MSG.body, url: MSG.url, tag: 't-1' })
})

Deno.test('send: 404/410 from the push service → that phone is forgotten; 500 or network error → kept, no throw', async () => {
  resetDb(); sent = []; useVapid()
  db.tables.push_subscriptions = [phoneRow('u1', 'https://x.test/gone'), phoneRow('u1', 'https://x.test/missing'), phoneRow('u1', 'https://x.test/err'), phoneRow('u1', 'https://x.test/down'), phoneRow('u1', 'https://x.test/ok')]
  pushStatus = (url) => url.endsWith('gone') ? 410 : url.endsWith('missing') ? 404 : url.endsWith('err') ? 500 : url.endsWith('down') ? 'throw' : 201
  const result = await sendPushToUser(createClient('', ''), 'u1', MSG)
  assertEquals(result, { sent: 1, removed: 2, failed: 2 })
  assertEquals(db.tables.push_subscriptions.map((r: { endpoint: string }) => r.endpoint).sort(), ['https://x.test/down', 'https://x.test/err', 'https://x.test/ok'])
})

Deno.test('send: no VAPID secrets → skipped, nothing sent', async () => {
  resetDb(); sent = []; pushStatus = () => 201; useVapid(false)
  db.tables.push_subscriptions = [phoneRow('u1', 'https://x.test/a')]
  assertEquals((await sendPushToUser(createClient('', ''), 'u1', MSG)).skipped, 'not configured')
  assertEquals(sent.length, 0)
})

Deno.test('send: user without phones, or no user → skipped', async () => {
  resetDb(); sent = []; useVapid()
  db.tables.push_subscriptions = []
  assertEquals((await sendPushToUser(createClient('', ''), 'u1', MSG)).skipped, 'no phones')
  assertEquals((await sendPushToUser(createClient('', ''), null, MSG)).skipped, 'no user')
  assertEquals(sent.length, 0)
})

Deno.test('send: long texts are shortened', async () => {
  resetDb(); sent = []; pushStatus = () => 201; useVapid()
  db.tables.push_subscriptions = [phoneRow('u1', 'https://x.test/a')]
  await sendPushToUser(createClient('', ''), 'u1', { ...MSG, title: 'T'.repeat(200), body: 'B'.repeat(500) })
  const alert = JSON.parse((await phoneDecrypt(sent[0].body)).text)
  assertEquals([alert.title.length, alert.body.length, alert.body.endsWith('…')], [80, 200, true])
})

// --- The 4 order events ------------------------------------------------------
Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
const WEBHOOK_SECRET = 'test-webhook-secret'
Deno.env.set('UMUNOTA_WEBHOOK_SECRET', WEBHOOK_SECRET)
await import('../create-order/index.ts')
const createOrder = serveStub.handler!
await import('../create-group-order-payment/index.ts')
const submitGroup = serveStub.handler!
await import('../payment-webhook/index.ts')
const paymentWebhook = serveStub.handler!
let updateOrderStatus: (req: Request) => Promise<Response> = () => Promise.reject(new Error('not loaded'))
const realServe = Deno.serve
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = (handler: (req: Request) => Promise<Response>) => {
  updateOrderStatus = handler
  return {}
}
await import('../update-order-status/index.ts')
// deno-lint-ignore no-explicit-any
;(Deno as any).serve = realServe

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'
const STUDENT_PHONE = 'https://fcm.googleapis.com/fcm/send/student'
const MERCHANT_PHONE = 'https://web.push.apple.com/merchant'

function seedShop() {
  resetDb(); sent = []; pushStatus = () => 201; useVapid()
  db.users[STUDENT] = {
    id: STUDENT, email: 'aline@keplercollege.ac.rw',
    user_metadata: { full_name: 'Aline Uwase', phone: '0788123456' },
    app_metadata: { university: 'Kepler College' },
  } as typeof db.users[string]
  db.users[MERCHANT] = { id: MERCHANT, email: 'chips@gmail.com', user_metadata: { phone: '0790000000' }, app_metadata: {} }
  db.tokens['student-token'] = STUDENT
  db.tokens['merchant-token'] = MERCHANT
  db.tables.user_roles = [{ user_id: STUDENT, role: 'student' }, { user_id: MERCHANT, role: 'merchant' }]
  db.tables.deals = [{
    id: 'deal-1', merchant_id: MERCHANT, title: 'Chips Mayai', price: 2000, discount_percent: 0, active: true,
    expires_at: null, offer_type: 'percentage', discount_value: null, final_price: null, buy_quantity: null, min_participants: null,
  }]
  db.tables.merchant_profiles = [{ id: MERCHANT, approved: true }]
  db.tables.orders = []
  db.tables.notifications = []
  db.tables.chat_messages = []
  db.tables.push_subscriptions = [phoneRow(STUDENT, STUDENT_PHONE), phoneRow(MERCHANT, MERCHANT_PHONE)]
}

const post = (handler: (r: Request) => Promise<Response>, token: string, body: unknown) =>
  handler(new Request('http://fake/fn', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))

function pendingOrder() {
  db.tables.orders.push({
    id: 'a1b2c3d4-0000-0000-0000-000000000001', student_id: STUDENT, merchant_id: MERCHANT, deal_id: 'deal-1', quantity: 2,
    status: 'pending_confirmation', confirmation_deadline: new Date(Date.now() + 4 * 60_000).toISOString(),
  })
  return db.tables.orders[db.tables.orders.length - 1]
}

const NO_SECRETS = /\b\d{4}\b|0788123456|0790000000|Aline|Uwase|aline@/

Deno.test('event 1: new order → the business phone gets "New order" with the deal name; the student gets nothing', async () => {
  seedShop()
  const res = await post(createOrder, 'student-token', { deal_id: 'deal-1', quantity: 2 })
  assertEquals(res.status, 201)
  const [alert] = await alertsFor(MERCHANT_PHONE)
  assertEquals(alert.title, 'New order')
  assertEquals(alert.body, 'Chips Mayai ×2. Accept or decline within 5 minutes.')
  assertEquals(alert.url, '/dashboard/orders')
  assertEquals(sent[0].headers.get('ttl'), '300')
  assertEquals((await alertsFor(STUDENT_PHONE)).length, 0)
  assert(!NO_SECRETS.test(JSON.stringify(alert)), 'no name, phone or code in the alert')
})

Deno.test('event 1b: group order sent → "New group order" with deal, items and students', async () => {
  seedShop()
  db.tables.group_orders = [{ id: 'g-1', deal_id: 'deal-1', created_by: STUDENT, host_name: 'Aline', join_code: 'K7Q2', status: 'open', expires_at: new Date(Date.now() + 3600_000).toISOString() }]
  db.tables.group_order_members = [
    { id: 'm-1', group_order_id: 'g-1', student_id: STUDENT, student_name: 'Aline', quantity: 2 },
    { id: 'm-2', group_order_id: 'g-1', student_id: 'student-2', student_name: 'Kevin', quantity: 1 },
  ]
  const res = await post(submitGroup, 'student-token', { group_order_id: 'g-1' })
  assert(res.status < 400, `status ${res.status}`)
  const [alert] = await alertsFor(MERCHANT_PHONE)
  assertEquals([alert.title, alert.body], ['New group order', 'Chips Mayai ×3 for 2 students. Accept or decline within 5 minutes.'])
})

Deno.test('event 2: business accepts → the student phone gets "pay now", opening the payment page', async () => {
  seedShop()
  const order = pendingOrder()
  const res = await post(updateOrderStatus, 'merchant-token', { order_id: order.id, action: 'accept' })
  assertEquals(res.status, 200)
  const [alert] = await alertsFor(STUDENT_PHONE)
  assertEquals(alert.title, 'Order accepted: pay now')
  assertEquals(alert.body, 'Chips Mayai: pay within 5 minutes to confirm your order.')
  assertEquals(alert.url, `/payment?order_id=${order.id}`)
  assertEquals(sent[0].headers.get('urgency'), 'high')
  assertEquals((await alertsFor(MERCHANT_PHONE)).length, 0)
})

Deno.test('event 3: business declines → the student phone gets "Order declined"', async () => {
  seedShop()
  const order = pendingOrder()
  const res = await post(updateOrderStatus, 'merchant-token', { order_id: order.id, action: 'decline', decline_reason: 'other', decline_reason_note: 'Closed early' })
  assertEquals(res.status, 200)
  const [alert] = await alertsFor(STUDENT_PHONE)
  assertEquals([alert.title, alert.body, alert.url], ['Order declined', 'Chips Mayai: the business declined your order. You were not charged.', '/dashboard/profile?view=orders'])
})

Deno.test('event 2/3: push service down → the order change still succeeds', async () => {
  seedShop()
  pushStatus = () => 'throw'
  const order = pendingOrder()
  const res = await post(updateOrderStatus, 'merchant-token', { order_id: order.id, action: 'accept' })
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].status, 'confirmed')
})

async function hmac(body: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(WEBHOOK_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(body)))
  return Array.from(sig).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.test('event 4: payment webhook success → the business phone gets "Payment received" (once, even if the webhook repeats)', async () => {
  seedShop()
  const orderId = 'a1b2c3d4-0000-0000-0000-000000000009'
  db.tables.orders = [{ id: orderId, student_id: STUDENT, merchant_id: MERCHANT, deal_id: 'deal-1', total_price: 1500, status: 'payment_processing', payment_deadline: new Date(Date.now() + 5 * 60_000).toISOString(), merchant_phone: '0790000000' }]
  db.tables.transactions = [{ id: 'tx-1', redemption_id: null, student_id: STUDENT, deal_id: 'deal-1', normal_order_id: orderId, amount: 1500, currency: 'RWF', payment_method: 'momo', merchant_reference: 'tx-1', umunota_reference: 'ref-1', status: 'processing', webhook_payload: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]
  db.tables.redemptions = []
  const body = JSON.stringify({ reference: 'ref-1', status: 'success', amount: 1500 })
  const deliver = async () => paymentWebhook(new Request('http://fake/payment-webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': await hmac(body) }, body }))
  assertEquals((await deliver()).status, 200)
  assertEquals((await deliver()).status, 200)
  const alerts = await alertsFor(MERCHANT_PHONE)
  assertEquals(alerts.length, 1)
  assertEquals([alerts[0].title, alerts[0].body, alerts[0].url], ['Payment received', 'Chips Mayai: order A1B2C3D4 is paid.', '/dashboard/orders'])
  assert(!JSON.stringify(alerts[0]).includes(String(db.tables.redemptions[0].code)), 'pickup code never in the alert')
  assertEquals((await alertsFor(STUDENT_PHONE)).length, 0)
})

Deno.test('event 4: unknown deal title → generic wording', async () => {
  seedShop()
  db.tables.deals = []
  await alertMerchantPaymentReceived(createClient('', ''), { id: 'abcdef12-0000', merchant_id: MERCHANT, deal_id: 'gone' })
  const [alert] = await alertsFor(MERCHANT_PHONE)
  assertEquals(alert.body, 'Your deal: order ABCDEF12 is paid.')
})

Deno.test('cleanup: restore fetch', () => {
  globalThis.fetch = realFetch
  useVapid(false)
})
