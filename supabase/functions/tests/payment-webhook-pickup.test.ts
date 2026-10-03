// N1: the student must receive their pickup code when payment completes
// asynchronously via payment-webhook (not only via process-payment).
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import { buildPickupCodeMessage, sendPickupCodeMessage } from '../_shared/pickup-code-message.ts'
import { createClient } from './fakes/supabase.ts'

const SECRET = 'test-webhook-secret'
Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
Deno.env.set('UMUNOTA_WEBHOOK_SECRET', SECRET)
await import('../payment-webhook/index.ts')
const handle = serveStub.handler!

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'
const DEAL = 'deal-1'
const ORDER = 'order-1'
const REF = 'umunota-ref-1'
const MERCHANT_REF = 'tx-1'

// Columns process-payment reads and writes on production's transactions table.
const PRODUCTION_TRANSACTION_COLUMNS = [
  'id', 'redemption_id', 'student_id', 'deal_id', 'normal_order_id', 'amount', 'currency', 'payment_method',
  'merchant_reference', 'umunota_reference', 'status', 'webhook_payload', 'created_at', 'updated_at',
]

function seed() {
  resetDb()
  db.tables.orders = [{
    id: ORDER, student_id: STUDENT, merchant_id: MERCHANT, deal_id: DEAL, total_price: 1500,
    status: 'payment_processing', payment_deadline: new Date(Date.now() + 5 * 60_000).toISOString(),
    merchant_phone: '0788123456',
  }]
  // Production's transactions shape (what process-payment writes). There is no
  // phone_number, reference or provider_response column: touching one fails.
  db.columns.transactions = PRODUCTION_TRANSACTION_COLUMNS
  db.tables.transactions = [{
    id: 'tx-1', redemption_id: null, student_id: STUDENT, deal_id: DEAL, normal_order_id: ORDER, amount: 1500,
    currency: 'RWF', payment_method: 'momo', merchant_reference: MERCHANT_REF, umunota_reference: REF,
    status: 'processing', webhook_payload: {}, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }]
  db.tables.redemptions = []
  db.tables.chat_messages = []
  db.tables.notifications = []
}

async function hmac(body: string) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body))
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function deliverSuccessWebhook() {
  const body = JSON.stringify({ reference: REF, status: 'success', amount: 1500 })
  return handle(new Request('http://fake/payment-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': await hmac(body) },
    body,
  }))
}

const pickupMessages = () =>
  db.tables.chat_messages.filter((m) => m.receiver_id === STUDENT && String(m.message).includes('Pickup code:'))

Deno.test('async success webhook → order paid, redemption created, student gets exactly one pickup-code message', async () => {
  seed()
  const res = await deliverSuccessWebhook()
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].status, 'paid')
  assertEquals(db.tables.redemptions.length, 1)

  const msgs = pickupMessages()
  assertEquals(msgs.length, 1)
  const code = String(db.tables.redemptions[0].code)
  assertEquals(msgs[0].sender_id, MERCHANT)
  assertEquals(msgs[0].deal_id, DEAL)
  assertEquals(msgs[0].is_read, false)
  assertStringIncludes(String(msgs[0].message), `Pickup code: ${code}`)
  assertStringIncludes(String(msgs[0].message), '0788123456')
})

Deno.test('duplicate webhook delivery → still exactly one pickup-code message', async () => {
  seed()
  await deliverSuccessWebhook()
  const again = await deliverSuccessWebhook()
  assertEquals(again.status, 200)
  assertEquals(pickupMessages().length, 1)
})

Deno.test('chat insert fails → 500 (provider retries) → retry delivers the code', async () => {
  seed()
  db.failInserts.chat_messages = 1
  const first = await deliverSuccessWebhook()
  assertEquals(first.status, 500)
  assertEquals(db.tables.orders[0].status, 'paid') // payment is still recorded
  assertEquals(pickupMessages().length, 0)

  const retry = await deliverSuccessWebhook()
  assertEquals(retry.status, 200)
  assertEquals(pickupMessages().length, 1)
})

Deno.test('message already sent by process-payment (same shared text) → webhook does not duplicate', async () => {
  seed()
  // Simulate process-payment having created the redemption and sent the message first.
  db.tables.redemptions.push({ id: 'r-1', order_id: ORDER, deal_id: DEAL, student_id: STUDENT, code: '4821', status: 'pending' })
  const order = db.tables.orders[0] as { merchant_id: string; student_id: string; deal_id: string; merchant_phone: string }
  assertEquals(await sendPickupCodeMessage(createClient('', ''), order, '4821'), 'sent')

  const res = await deliverSuccessWebhook()
  assertEquals(res.status, 200)
  assertEquals(pickupMessages().length, 1)
  assertEquals(pickupMessages()[0].message, buildPickupCodeMessage(order, '4821'))
})

// Regression: production's transactions table has no phone_number column, so
// the old select failed every webhook with 42703 before the order was paid.
Deno.test('production transactions shape (no phone_number) → order paid, transaction paid, payload stored', async () => {
  seed()
  const res = await deliverSuccessWebhook()
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].status, 'paid')
  assertEquals(db.tables.transactions[0].status, 'paid')
  assertEquals(db.tables.transactions[0].webhook_payload.reference, REF)
  assertEquals('phone_number' in db.tables.transactions[0], false)
  assertEquals('provider_response' in db.tables.transactions[0], false)
})

Deno.test('the fake really rejects phone_number on production shape (guards the regression test)', async () => {
  seed()
  const { error } = await createClient('', '').from('transactions').select('id, phone_number').eq('id', 'tx-1').maybeSingle()
  assertEquals(error?.code, '42703')
})

Deno.test('webhook carrying only our merchant_reference still finds the transaction', async () => {
  seed()
  const body = JSON.stringify({ reference: 'unknown-provider-id', merchant_reference: MERCHANT_REF, status: 'success', amount: 1500 })
  const res = await handle(new Request('http://fake/payment-webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': await hmac(body) },
    body,
  }))
  assertEquals(res.status, 200)
  assertEquals(db.tables.orders[0].status, 'paid')
})

Deno.test('pending and failed webhooks write production statuses and webhook_payload', async () => {
  for (const [providerStatus, expected] of [['pending', 'processing'], ['failed', 'failed']]) {
    seed()
    const body = JSON.stringify({ reference: REF, status: providerStatus, amount: 1500 })
    const res = await handle(new Request('http://fake/payment-webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': await hmac(body) },
      body,
    }))
    assertEquals(res.status, 200)
    assertEquals(db.tables.transactions[0].status, expected)
    assertEquals(db.tables.transactions[0].webhook_payload.status, providerStatus)
  }
})
