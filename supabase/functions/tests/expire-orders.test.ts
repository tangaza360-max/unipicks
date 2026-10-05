// expire-orders: both deadline rules, untouched states and idempotency.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
Deno.env.delete('CRON_SECRET')
await import('../expire-orders/index.ts')
const handle = serveStub.handler!

const past = () => new Date(Date.now() - 60_000).toISOString()
const future = () => new Date(Date.now() + 5 * 60_000).toISOString()

function seed() {
  resetDb()
  db.tables.orders = [
    { id: 'pending-late', status: 'pending_confirmation', confirmation_deadline: past(), payment_deadline: null },
    { id: 'pending-on-time', status: 'pending_confirmation', confirmation_deadline: future(), payment_deadline: null },
    { id: 'confirmed-late', status: 'confirmed', confirmation_deadline: past(), payment_deadline: past() },
    { id: 'confirmed-on-time', status: 'confirmed', confirmation_deadline: past(), payment_deadline: future() },
    { id: 'confirmed-no-deadline', status: 'confirmed', confirmation_deadline: past(), payment_deadline: null },
    { id: 'paid-late', status: 'paid', confirmation_deadline: past(), payment_deadline: past() },
    { id: 'processing-late', status: 'payment_processing', confirmation_deadline: past(), payment_deadline: past() },
  ]
  db.tables.group_orders = [
    { id: 'group-old', status: 'open', expires_at: past() },
    { id: 'group-fresh', status: 'open', expires_at: future() },
    { id: 'group-closed', status: 'closed', expires_at: past() },
  ]
}

const run = async () => {
  const res = await handle(new Request('http://fake/expire-orders', { method: 'POST' }))
  return { status: res.status, body: await res.json() }
}
const statusOf = (id: string) => db.tables.orders.find((o) => o.id === id)!.status

Deno.test('pending_confirmation past confirmation_deadline → confirmation_expired', async () => {
  seed()
  await run()
  assertEquals(statusOf('pending-late'), 'confirmation_expired')
  assertEquals(statusOf('pending-on-time'), 'pending_confirmation')
})

Deno.test('confirmed past payment_deadline → payment_expired', async () => {
  seed()
  await run()
  assertEquals(statusOf('confirmed-late'), 'payment_expired')
})

Deno.test('confirmed before payment_deadline (or with no deadline) → not touched', async () => {
  seed()
  await run()
  assertEquals(statusOf('confirmed-on-time'), 'confirmed')
  assertEquals(statusOf('confirmed-no-deadline'), 'confirmed')
})

Deno.test('paid and payment_processing orders → not touched, whatever their deadlines', async () => {
  seed()
  await run()
  assertEquals(statusOf('paid-late'), 'paid')
  assertEquals(statusOf('processing-late'), 'payment_processing')
})

Deno.test('response reports both counts', async () => {
  seed()
  const { status, body } = await run()
  assertEquals(status, 200)
  assertEquals(body, { success: true, expired_pending: 1, expired_confirmed: 1, expired_groups: 1, stories_cleaned: 0, expired_count: 2 })
})

Deno.test('running twice in a row has no additional effect', async () => {
  seed()
  await run()
  const after1 = JSON.stringify(db.tables.orders)
  const { body } = await run()
  assertEquals(body, { success: true, expired_pending: 0, expired_confirmed: 0, expired_groups: 0, stories_cleaned: 0, expired_count: 0 })
  assertEquals(JSON.stringify(db.tables.orders), after1)
})

Deno.test('open group past its 24 hours → cancelled; fresh and closed groups untouched', async () => {
  seed()
  await run()
  const statusOfGroup = (id: string) => db.tables.group_orders.find((g) => g.id === id)!.status
  assertEquals(statusOfGroup('group-old'), 'cancelled')
  assertEquals(statusOfGroup('group-fresh'), 'open')
  assertEquals(statusOfGroup('group-closed'), 'closed')
})

Deno.test('wrong cron secret → 401, nothing changes', async () => {
  seed()
  Deno.env.set('CRON_SECRET', 's3cret')
  try {
    const res = await handle(new Request('http://fake/expire-orders', { method: 'POST', headers: { 'x-cron-secret': 'nope' } }))
    assertEquals(res.status, 401)
    assertEquals(statusOf('confirmed-late'), 'confirmed')
  } finally {
    Deno.env.delete('CRON_SECRET')
  }
})

// Rule 4: ended student stories (photo first, then the row).
function seedStories() {
  seed()
  db.tables.student_stories = [
    { id: 'old-1', media_url: 'u1/a.jpg' },
    { id: 'old-2', media_url: 'u2/b.gif' },
    { id: 'live', media_url: 'u1/live.jpg' },
  ]
  db.storage['student-stories'] = ['u1/a.jpg', 'u2/b.gif', 'u1/live.jpg']
  // The database function decides which stories are old enough (SQL test).
  db.rpcs.student_stories_to_clean = () => ({
    data: [{ id: 'old-1', media_url: 'u1/a.jpg' }, { id: 'old-2', media_url: 'u2/b.gif' }],
    error: null,
  })
}

Deno.test('ended stories: photos and rows deleted, live story kept', async () => {
  seedStories()
  const { status, body } = await run()
  assertEquals(status, 200)
  assertEquals(body.stories_cleaned, 2)
  assertEquals(db.storage['student-stories'], ['u1/live.jpg'])
  assertEquals(db.tables.student_stories.map((s) => s.id), ['live'])
  assertEquals(db.rpcCalls.find((c) => c.name === 'student_stories_to_clean')?.args, { p_limit: 100 })
})

Deno.test('photo delete fails: rows kept for the next run, orders still expire', async () => {
  seedStories()
  db.storageFail = { 'student-stories': 'storage down' }
  const { status, body } = await run()
  assertEquals(status, 200)
  assertEquals(body.stories_cleaned, 0)
  assertEquals(db.tables.student_stories.length, 3)
  assertEquals(statusOf('pending-late'), 'confirmation_expired')
})

Deno.test('clean-up function missing: orders still expire', async () => {
  seed()
  const { status, body } = await run()
  assertEquals(status, 200)
  assertEquals(body.stories_cleaned, 0)
  assertEquals(statusOf('confirmed-late'), 'payment_expired')
})
