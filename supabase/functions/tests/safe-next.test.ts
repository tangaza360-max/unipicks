// After log in, go back only to Unipicks pages a shared link can point to.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { HOME, safeNext, withNext } from '../../../src/lib/safeNext.js'

const DEAL = '/deal/286bcf79-0ab4-49d4-851b-283aae1a3499'

Deno.test('a shared deal and dashboard pages are allowed', () => {
  assertEquals(safeNext(DEAL), DEAL)
  assertEquals(safeNext('/dashboard/orders'), '/dashboard/orders')
  assertEquals(safeNext('/dashboard'), '/dashboard')
})

Deno.test('anything else goes Home (no open redirect)', () => {
  for (const bad of [null, undefined, '', 'https://evil.com', '//evil.com', '/\\evil.com', '/deal/x', `${DEAL}/confirm`,
    `${DEAL}?x=1`, '/deal/../login', 'javascript:alert(1)', '/payment?order_id=1', '/dashboard/deals/../../x']) {
    assertEquals(safeNext(bad), HOME, String(bad))
  }
})

Deno.test("students' order alerts: My orders and paying for one order are allowed, exactly", () => {
  const ORDER = '44d338de-8cc9-4b13-8966-ace76d8b7c4f'
  assertEquals(safeNext('/dashboard/profile?view=orders'), '/dashboard/profile?view=orders')
  assertEquals(safeNext(`/payment?order_id=${ORDER}`), `/payment?order_id=${ORDER}`)
  for (const bad of [`/payment?order_id=${ORDER}&next=https://evil.com`, `/payment?order_id=${ORDER}#x`, '/payment',
    '/payment?order_id=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx', '/dashboard/profile?view=orders&x=1', '/dashboard/profile?view=settings',
    `//evil.com/payment?order_id=${ORDER}`, '/deal/------------------------------------']) {
    assertEquals(safeNext(bad), HOME, bad)
  }
})

Deno.test('withNext keeps the deal between log in and sign up', () => {
  assertEquals(withNext('/login', DEAL), `/login?next=${encodeURIComponent(DEAL)}`)
  assertEquals(withNext('/register', 'https://evil.com'), '/register')
  assertEquals(withNext('/login', null), '/login')
})
