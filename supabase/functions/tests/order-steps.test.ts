// Student order steps: Ordered → Accepted → Paid → Ready → Collected.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { ORDER_STEPS, nowText, reachedStep, stepStates } from '../../../src/lib/orderSteps.js'

const NOW = Date.parse('2026-10-07T10:00:00Z')
const later = new Date(NOW + 3 * 60_000).toISOString()
const earlier = new Date(NOW - 60_000).toISOString()

Deno.test('each status lands on the right step', () => {
  assertEquals(ORDER_STEPS, ['Ordered', 'Accepted', 'Paid', 'Ready', 'Collected'])
  assertEquals(reachedStep({ status: 'pending_confirmation' }, NOW), 0)
  assertEquals(reachedStep({ status: 'confirmed', payment_deadline: later }, NOW), 1)
  assertEquals(reachedStep({ status: 'payment_processing' }, NOW), 1)
  assertEquals(reachedStep({ status: 'paid', ready_at: null }, NOW), 2)
  assertEquals(reachedStep({ status: 'paid', ready_at: earlier }, NOW), 3)
  assertEquals(reachedStep({ status: 'redeemed', ready_at: null }, NOW), 4, 'collected even if never marked ready')
})

Deno.test('orders that ended without food show no steps', () => {
  for (const status of ['declined', 'confirmation_expired', 'payment_expired', 'refunded', 'cancelled', undefined]) {
    assertEquals(reachedStep({ status }, NOW), null, String(status))
  }
  assertEquals(reachedStep({ status: 'confirmed', payment_deadline: earlier }, NOW), null, '5 minutes to pay are over')
  assertEquals(reachedStep({ status: 'confirmed', payment_deadline: null }, NOW), null)
})

Deno.test('done, now and next', () => {
  assertEquals(stepStates(2).map((s: { state: string }) => s.state), ['done', 'done', 'done', 'now', 'next'])
  assertEquals(stepStates(0).map((s: { state: string }) => s.state), ['done', 'now', 'next', 'next', 'next'])
  assertEquals(stepStates(4).map((s: { state: string }) => s.state), ['done', 'done', 'done', 'done', 'done'])
})

Deno.test('the sentence tells the student what to do', () => {
  assertEquals(nowText({ status: 'paid' }, 'Mr. Chips'), "Paid. Mr. Chips is preparing your food. We'll tell you when it's ready. Don't go yet.")
  assertEquals(nowText({ status: 'paid', ready_at: earlier }, 'Mr. Chips'), 'Your food is ready. Go to Mr. Chips and show your pickup code.')
  assertEquals(nowText({ status: 'payment_processing' }), 'Confirm the payment on your phone (MoMo).')
  assertEquals(nowText({ status: 'pending_confirmation' }), 'Waiting for the business to accept. This takes up to 5 minutes.')
  assertEquals(nowText({ status: 'declined' }), '')
})
