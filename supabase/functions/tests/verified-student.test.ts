// Fix 1 (ecosystem audit U1): only verified students can order at student
// prices. Verified = role 'student' (user_roles) + app_metadata.university
// (server-derived from the email domain, P1).
// Run from the repo root:
//   deno test --import-map=supabase/functions/tests/import_map.json --allow-env --allow-read supabase/functions/tests/
import { assertEquals } from 'jsr:@std/assert@1'
import { db, resetDb } from './fakes/supabase.ts'
import * as serveStub from './fakes/serve.ts'
import { NOT_VERIFIED_STUDENT_ERROR } from '../_shared/verified-student.ts'

Deno.env.set('SUPABASE_URL', 'http://fake')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'fake')
await import('../create-order/index.ts')
const createOrder = serveStub.handler!
await import('../create-group-order-payment/index.ts')
const submitGroup = serveStub.handler!

const USER = 'user-1'

function seed({ role, university }: { role: string | null; university?: string }) {
  resetDb()
  db.users[USER] = {
    id: USER, email: university ? 'x@keplercollege.ac.rw' : 'x@gmail.com',
    // A self-written user_metadata university must not count.
    user_metadata: { full_name: 'X', phone: '0780000000', university: 'Kepler College', role: 'student' },
    app_metadata: university ? { university } : {},
  } as typeof db.users[string]
  db.users['merchant-1'] = { id: 'merchant-1', user_metadata: { phone: '0790000000' } }
  db.tokens['tok'] = USER
  db.tables.user_roles = role ? [{ user_id: USER, role }] : []
  db.tables.deals = [{
    id: 'deal-1', merchant_id: 'merchant-1', price: 2000, discount_percent: 0, active: true,
    expires_at: null, offer_type: 'percentage', discount_value: null, final_price: null, buy_quantity: null,
    min_participants: null,
  }]
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

const cases: [string, { role: string | null; university?: string }, number][] = [
  ['verified student', { role: 'student', university: 'Kepler College' }, 201],
  ['student without a verified university (non-university email)', { role: 'student' }, 403],
  ['merchant with a university email', { role: 'merchant', university: 'Kepler College' }, 403],
  ['admin with a university email', { role: 'admin', university: 'Kepler College' }, 403],
  ['no role row', { role: null, university: 'Kepler College' }, 403],
]

for (const [label, account, expected] of cases) {
  Deno.test(`create-order: ${label} → ${expected}`, async () => {
    seed(account)
    const res = await post(createOrder, { deal_id: 'deal-1', quantity: 1 })
    assertEquals(res.status, expected)
    if (expected === 403) {
      assertEquals((await res.json()).error, NOT_VERIFIED_STUDENT_ERROR)
      assertEquals(db.tables.orders.length, 0)
    } else {
      assertEquals(db.tables.orders.length, 1)
    }
  })

  Deno.test(`create-group-order-payment: ${label} → ${expected}`, async () => {
    seed(account)
    const res = await post(submitGroup, { group_order_id: 'g-1' })
    assertEquals(res.status, expected)
    if (expected === 403) {
      assertEquals(db.tables.orders.length, 0)
      assertEquals(db.tables.group_orders[0].status, 'open')
    }
  })
}
