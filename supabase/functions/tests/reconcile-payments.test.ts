// reconcile-payments: polls UmunotaPay for payments whose webhook never came.
// fetch is stubbed; the database is the in-memory fake.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
Deno.env.set('UMUNOTA_API_KEY', 'api-key')
Deno.env.set('UMUNOTA_WEBHOOK_SECRET', 'hmac-secret')
Deno.env.delete('CRON_SECRET')
await import('../reconcile-payments/index.ts')
const handle = serveStub.handler!

const STUDENT = 'student-1'
const MERCHANT = 'merchant-1'
const DEAL = 'deal-1'
const ago = (ms: number) => new Date(Date.now() - ms).toISOString()
const MIN = 60_000
const HOUR = 60 * MIN

// Production transactions columns (see f4ae10f): anything else fails with 42703.
const TRANSACTION_COLUMNS = [
  'id', 'redemption_id', 'student_id', 'deal_id', 'amount', 'currency', 'payment_method', 'status',
  'umunota_reference', 'merchant_reference', 'webhook_payload', 'created_at', 'updated_at', 'normal_order_id', 'group_order_id',
]

function addOrder(id: string, age: number, txAge = age) {
  db.tables.orders.push({
    id, student_id: STUDENT, merchant_id: MERCHANT, deal_id: DEAL, status: 'payment_processing',
    merchant_phone: '0788123456', student_phone: '0781112223', total_price: 1500,
    created_at: ago(age), updated_at: ago(age),
  })
  db.tables.transactions.push({
    id: `tx-${id}`, redemption_id: null, student_id: STUDENT, deal_id: DEAL, amount: 1500, currency: 'RWF',
    payment_method: 'momo', status: 'processing', umunota_reference: `umu-${id}`, merchant_reference: `tx-${id}`,
    webhook_payload: {}, created_at: ago(txAge), updated_at: ago(txAge), normal_order_id: id, group_order_id: null,
  })
}

function seed() {
  resetDb()
  db.columns.transactions = TRANSACTION_COLUMNS
  db.tables.orders = []
  db.tables.transactions = []
  db.tables.redemptions = []
  db.tables.chat_messages = []
  db.tables.notifications = []
  db.tables.user_notifications = []
  Deno.env.set('RECONCILE_ENABLED', 'true')
  Deno.env.set('UMUNOTA_STATUS_ENDPOINT', 'https://api.umunotapay.test/api/v1/payments/{ref}')
  Deno.env.delete('UMUNOTA_STATUS_METHOD')
  Deno.env.delete('UMUNOTA_STATUS_AUTH_STYLE')
}

// Provider stub: ref -> [http status, body]. Records requests.
let provider: Record<string, [number, unknown]> = {}
let requests: { url: string; method: string; headers: Headers }[] = []
globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
  const url = String(input)
  requests.push({ url, method: init?.method ?? 'GET', headers: new Headers(init?.headers) })
  const ref = decodeURIComponent(url.split('/').pop() ?? '')
  const [status, body] = provider[ref] ?? [404, { error: 'not found' }]
  return Promise.resolve(new Response(JSON.stringify(body), { status }))
}

const run = async () => {
  const res = await handle(new Request('http://fake/reconcile-payments', { method: 'POST' }))
  return { status: res.status, body: await res.json() }
}
const order = (id: string) => db.tables.orders.find((o) => o.id === id)!
const tx = (id: string) => db.tables.transactions.find((t) => t.normal_order_id === id)!
const pickupMessages = () => db.tables.chat_messages.filter((m) => String(m.message).includes('Pickup code:'))

async function captureLogs(fn: () => Promise<void>) {
  const lines: string[] = []
  const [log, error] = [console.log, console.error]
  console.log = (...a: unknown[]) => lines.push(a.map(String).join(' '))
  console.error = (...a: unknown[]) => lines.push(a.map(String).join(' '))
  try { await fn() } finally { [console.log, console.error] = [log, error] }
  return lines
}

Deno.test('RECONCILE_ENABLED not "true" → skipped, no database queries, no provider calls', async () => {
  for (const value of [undefined, 'false', 'TRUE', '1']) {
    seed()
    addOrder('o1', 6 * MIN)
    if (value === undefined) Deno.env.delete('RECONCILE_ENABLED')
    else Deno.env.set('RECONCILE_ENABLED', value)
    db.queryLog = []
    requests = []
    const { status, body } = await run()
    assertEquals(status, 200)
    assertEquals(body, { skipped: true, reason: 'reconcile disabled' })
    assertEquals(db.queryLog, [])
    assertEquals(requests.length, 0)
  }
})

Deno.test('provider PAID → order paid, transaction paid, pickup code sent, merchant notified', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  provider = { 'umu-o1': [200, { status: 'COMPLETED', reference: 'umu-o1' }] }
  requests = []
  const { body } = await run()
  assertEquals(body, { success: true, checked: 1, confirmed: 1, failed: 0, still_pending: 0, abandoned: 0, errored: 0 })
  assertEquals(order('o1').status, 'paid')
  assertEquals(tx('o1').status, 'paid')
  assertEquals(tx('o1').webhook_payload.status, 'COMPLETED')
  assertEquals(db.tables.redemptions.length, 1)
  assertEquals(pickupMessages().length, 1)
  assertStringIncludes(String(pickupMessages()[0].message), `Pickup code: ${db.tables.redemptions[0].code}`)
  assertEquals(db.tables.notifications.map((n) => n.type), ['payment_received'])
  // Default config: GET, umunota_reference in the URL, HMAC headers like process-payment.
  assertEquals(requests[0].method, 'GET')
  assertEquals(requests[0].url, 'https://api.umunotapay.test/api/v1/payments/umu-o1')
  assertEquals(requests[0].headers.get('X-API-Key'), 'api-key')
  assertEquals(/^[0-9a-f]{64}$/.test(requests[0].headers.get('X-Signature') ?? ''), true)
})

Deno.test('provider FAILED → order back to confirmed, transaction failed, student notified', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  provider = { 'umu-o1': [200, { data: { status: 'declined' } }] }
  const { body } = await run()
  assertEquals(body.failed, 1)
  assertEquals(order('o1').status, 'confirmed')
  assertEquals(tx('o1').status, 'failed')
  assertEquals(db.tables.user_notifications.length, 1)
  assertEquals(db.tables.user_notifications[0].user_id, STUDENT)
  assertEquals(db.tables.user_notifications[0].type, 'payment_failed')
  assertEquals(pickupMessages().length, 0)
})

Deno.test('provider PENDING → no change', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  provider = { 'umu-o1': [200, { payment_status: 'pending' }] }
  const before = JSON.stringify([db.tables.orders, db.tables.transactions])
  const { body } = await run()
  assertEquals(body.still_pending, 1)
  assertEquals(JSON.stringify([db.tables.orders, db.tables.transactions]), before)
})

Deno.test('order 25h old and still PENDING → payment_expired, transaction failed (abandoned)', async () => {
  seed()
  addOrder('o1', 25 * HOUR)
  provider = { 'umu-o1': [200, { status: 'processing' }] }
  const { body } = await run()
  assertEquals(body.abandoned, 1)
  assertEquals(order('o1').status, 'payment_expired')
  assertEquals(tx('o1').status, 'failed')
})

Deno.test('provider 500 / malformed / unknown status → order unchanged, counted as errored, run continues', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  addOrder('o2', 7 * MIN)
  addOrder('o3', 8 * MIN)
  addOrder('o4', 9 * MIN)
  provider = {
    'umu-o1': [500, { error: 'boom' }],
    'umu-o2': [200, 'not an object'],
    'umu-o3': [200, { status: 'on_hold' }],
    'umu-o4': [200, { status: 'success' }],
  }
  const { status, body } = await run()
  assertEquals(status, 200)
  assertEquals(body, { success: true, checked: 4, confirmed: 1, failed: 0, still_pending: 0, abandoned: 0, errored: 3 })
  for (const id of ['o1', 'o2', 'o3']) {
    assertEquals(order(id).status, 'payment_processing')
    assertEquals(tx(id).status, 'processing')
  }
  assertEquals(order('o4').status, 'paid')
})

Deno.test('not yet 5 minutes old, or transaction not processing, or order already paid → not checked', async () => {
  seed()
  addOrder('fresh', 2 * MIN)
  addOrder('tx-failed', 10 * MIN)
  tx('tx-failed').status = 'failed'
  addOrder('already-paid', 10 * MIN)
  order('already-paid').status = 'paid'
  tx('already-paid').status = 'paid'
  provider = { 'umu-fresh': [200, { status: 'paid' }], 'umu-tx-failed': [200, { status: 'paid' }], 'umu-already-paid': [200, { status: 'paid' }] }
  requests = []
  const { body } = await run()
  assertEquals(body.checked, 0)
  assertEquals(requests.length, 0)
  assertEquals(pickupMessages().length, 0)
  assertEquals(order('fresh').status, 'payment_processing')
})

Deno.test('running twice in a row has no additional effect', async () => {
  seed()
  addOrder('paid', 6 * MIN)
  addOrder('failed', 6 * MIN)
  addOrder('old', 25 * HOUR)
  provider = { 'umu-paid': [200, { status: 'paid' }], 'umu-failed': [200, { status: 'failed' }], 'umu-old': [200, { status: 'pending' }] }
  await run()
  const after1 = JSON.stringify(db.tables)
  requests = []
  const { body } = await run()
  assertEquals(body, { success: true, checked: 0, confirmed: 0, failed: 0, still_pending: 0, abandoned: 0, errored: 0 })
  assertEquals(JSON.stringify(db.tables), after1)
  assertEquals(requests.length, 0)
  assertEquals(pickupMessages().length, 1)
  assertEquals(db.tables.user_notifications.length, 1)
})

Deno.test('batch cap: 25 eligible orders → 20 checked (oldest first), 5 left for the next run', async () => {
  seed()
  provider = {}
  for (let i = 0; i < 25; i += 1) {
    const id = `o${String(i).padStart(2, '0')}`
    addOrder(id, (100 - i) * MIN) // o00 is the oldest
    provider[`umu-${id}`] = [200, { status: 'paid' }]
  }
  const first = await run()
  assertEquals(first.body.checked, 20)
  assertEquals(first.body.confirmed, 20)
  assertEquals(db.tables.orders.filter((o) => o.status === 'payment_processing').map((o) => o.id), ['o20', 'o21', 'o22', 'o23', 'o24'])
  const second = await run()
  assertEquals(second.body.checked, 5)
})

Deno.test('merchant_reference is used when umunota_reference is null; POST + bearer config honoured', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  tx('o1').umunota_reference = null
  Deno.env.set('UMUNOTA_STATUS_METHOD', 'POST')
  Deno.env.set('UMUNOTA_STATUS_AUTH_STYLE', 'bearer')
  provider = { 'tx-o1': [200, { status: 'paid' }] }
  requests = []
  await run()
  assertEquals(requests[0].url, 'https://api.umunotapay.test/api/v1/payments/tx-o1')
  assertEquals(requests[0].method, 'POST')
  assertEquals(requests[0].headers.get('Authorization'), 'Bearer api-key')
  assertEquals(order('o1').status, 'paid')
})

Deno.test('logs: one summary line and one line per order; no phone, name or email', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  provider = { 'umu-o1': [200, { status: 'paid', phone: '0781112223', wallet_name: 'Aline Uwase', email: 'a@b.rw' }] }
  const lines = await captureLogs(async () => { await run() })
  assertEquals(lines.some((l) => l === '[reconcile-payments] order=o1 tx=tx-o1 provider_status=paid action=confirmed'), true)
  assertEquals(lines.some((l) => l === '[reconcile-payments] checked=1 confirmed=1 failed=0 pending=0 abandoned=0 errored=0'), true)
  const all = lines.join('\n')
  for (const secret of ['0781112223', '0788123456', 'Aline', 'a@b.rw', 'hmac-secret', 'api-key']) {
    assertEquals(all.includes(secret), false, `log contains ${secret}`)
  }
})

Deno.test('missing endpoint config while enabled → 500, nothing touched', async () => {
  seed()
  addOrder('o1', 6 * MIN)
  Deno.env.set('UMUNOTA_STATUS_ENDPOINT', 'https://api.umunotapay.test/api/v1/payments')
  const lines = await captureLogs(async () => {
    const { status } = await run()
    assertEquals(status, 500)
  })
  assertEquals(lines.length, 1)
  assertEquals(order('o1').status, 'payment_processing')
})
