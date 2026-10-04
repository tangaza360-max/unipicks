// Deal days and hours (Kigali time, UTC+2) are enforced when ordering.
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import {
  dealClosedMessage,
  dealHoursLabel,
  hasDealHours,
  isDealOpenNow,
} from '../_shared/deal-availability.ts'

// Kigali wall-clock time -> the UTC instant (Kigali = UTC+2).
const kigali = (iso: string) => new Date(`${iso}+02:00`)

const WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
const lunch = { available_days: WEEKDAYS, available_from: '11:00:00', available_until: '14:00:00' }
// Friday night only, past midnight.
const lateFriday = { available_days: ['friday'], available_from: '18:00', available_until: '02:00' }

// 2026-10-05 is a Monday, 2026-10-09 a Friday, 2026-10-10 a Saturday.
const unitCases: [string, Parameters<typeof isDealOpenNow>[0], string, boolean][] = [
  ['lunch, Monday 12:30', lunch, '2026-10-05T12:30:00', true],
  ['lunch, Monday 11:00 (start counts)', lunch, '2026-10-05T11:00:00', true],
  ['lunch, Monday 10:59', lunch, '2026-10-05T10:59:00', false],
  ['lunch, Monday 14:00 (end is closed)', lunch, '2026-10-05T14:00:00', false],
  ['lunch, Saturday 12:30 (wrong day)', lunch, '2026-10-10T12:30:00', false],
  // 23:30 UTC Sunday is 01:30 Monday in Kigali: the day must come from Kigali time.
  ['days only, Monday 01:30 Kigali = Sunday UTC', { available_days: ['monday'] }, '2026-10-05T01:30:00', true],
  ['overnight, Friday 23:59', lateFriday, '2026-10-09T23:59:00', true],
  ['overnight, Saturday 01:30 (Friday window)', lateFriday, '2026-10-10T01:30:00', true],
  ['overnight, Saturday 02:00 (ended)', lateFriday, '2026-10-10T02:00:00', false],
  ['overnight, Friday 17:59', lateFriday, '2026-10-09T17:59:00', false],
  ['overnight, Saturday 18:30 (Saturday not allowed)', lateFriday, '2026-10-10T18:30:00', false],
  ['no days or hours set (old deals)', {}, '2026-10-10T03:00:00', true],
  ['empty day list treated as every day', { available_days: [] }, '2026-10-10T03:00:00', true],
  ['same start and end = no hour limit', { available_from: '09:00', available_until: '09:00' }, '2026-10-10T03:00:00', true],
]

for (const [label, deal, at, expected] of unitCases) {
  Deno.test(`isDealOpenNow: ${label} → ${expected}`, () => {
    assertEquals(isDealOpenNow(deal, kigali(at)), expected)
  })
}

Deno.test('dealHoursLabel / hasDealHours', () => {
  assertEquals(dealHoursLabel(lunch), 'Mon–Fri, 11:00–14:00')
  assertEquals(dealHoursLabel(lateFriday), 'Fri, 18:00–02:00')
  assertEquals(dealHoursLabel({ available_days: ['saturday', 'sunday'] }), 'Sat, Sun')
  assertEquals(dealHoursLabel({ available_days: ['monday', 'wednesday', 'friday'] }), 'Mon, Wed, Fri')
  assertEquals(dealHoursLabel({}), 'every day')
  assertEquals(hasDealHours({}), false)
  assertEquals(hasDealHours(lunch), true)
  assertEquals(hasDealHours({ available_days: ['monday'] }), true)
  assertEquals(dealClosedMessage(lunch), 'This deal is available Mon–Fri, 11:00–14:00 (Kigali time). Please order during those hours.')
})

// --- The order functions refuse outside the hours ---

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-order/index.ts')
const createOrder = serveStub.handler!
await import('../create-group-order-payment/index.ts')
const submitGroup = serveStub.handler!

const USER = 'user-1'
const KIGALI_DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const todayInKigali = KIGALI_DAYS[new Date(Date.now() + 2 * 3600_000).getUTCDay()]
const notToday = KIGALI_DAYS.find((d) => d !== todayInKigali)!

function seed(availableDays: string[]) {
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
    min_participants: null, available_days: availableDays, available_from: null, available_until: null,
  }]
  db.tables.merchant_profiles = [{ id: 'merchant-1', approved: true }]
  db.tables.orders = []
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

Deno.test('create-order: deal open today → 201', async () => {
  seed([todayInKigali])
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 201)
  assertEquals(db.tables.orders.length, 1)
})

Deno.test('create-order: deal not available today → 409, no order', async () => {
  seed([notToday])
  const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, dealClosedMessage({ available_days: [notToday] }))
  assertEquals(db.tables.orders.length, 0)
})

Deno.test('create-group-order-payment: deal not available today → 409, group stays open', async () => {
  seed([notToday])
  const res = await post(submitGroup, { group_order_id: 'g-1' })
  assertEquals(res.status, 409)
  assertEquals((await res.json()).error, dealClosedMessage({ available_days: [notToday] }))
  assertEquals(db.tables.orders.length, 0)
  assertEquals(db.tables.group_orders[0].status, 'open')
})

Deno.test('create-group-order-payment: deal open today → same result as a deal with no hour limits', async () => {
  seed([])
  const unlimited = await post(submitGroup, { group_order_id: 'g-1' })
  seed([todayInKigali])
  const openToday = await post(submitGroup, { group_order_id: 'g-1' })
  assertEquals(openToday.status, unlimited.status)
  assertEquals(db.tables.orders.length, 1)
  assertEquals(db.tables.orders[0].group_order_id, 'g-1')
})
