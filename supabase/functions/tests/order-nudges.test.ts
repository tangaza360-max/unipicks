// The banner at the top of Home (src/lib/orderNudges.js): what a student must
// act on now — pay (window open) or collect (food ready) — most urgent first.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { orderNudges } from '../../../src/lib/orderNudges.js'

const NOW = Date.parse('2026-10-10T12:00:00Z')
const at = (min: number) => new Date(NOW + min * 60_000).toISOString()
const kinds = (list: { kind: string; order: { id: string } }[]) => list.map((n) => `${n.kind}:${n.order.id}`)

Deno.test('pay while the window is open; nothing once it has passed', () => {
  assertEquals(kinds(orderNudges([{ id: 'a', status: 'confirmed', payment_deadline: at(3) }], NOW)), ['pay:a'])
  assertEquals(kinds(orderNudges([{ id: 'a', status: 'confirmed', payment_deadline: at(-1) }], NOW)), [])
  assertEquals(kinds(orderNudges([{ id: 'a', status: 'confirmed', payment_deadline: null }], NOW)), [])
})

Deno.test('ready only when paid and marked ready', () => {
  assertEquals(kinds(orderNudges([{ id: 'r', status: 'paid', ready_at: at(-2) }], NOW)), ['ready:r'])
  assertEquals(kinds(orderNudges([{ id: 'p', status: 'paid', ready_at: null }], NOW)), [])
  assertEquals(kinds(orderNudges([{ id: 'c', status: 'redeemed', ready_at: at(-9) }], NOW)), [])
})

Deno.test('other statuses never show', () => {
  const statuses = ['pending_confirmation', 'declined', 'confirmation_expired', 'payment_expired', 'redeemed', 'completed']
  assertEquals(kinds(orderNudges(statuses.map((status, i) => ({ id: `x${i}`, status, payment_deadline: at(3), ready_at: at(-1) })), NOW)), [])
})

Deno.test('most urgent first: payments by deadline, then ready food, oldest first', () => {
  const list = orderNudges([
    { id: 'r2', status: 'paid', ready_at: at(-1) },
    { id: 'p2', status: 'confirmed', payment_deadline: at(4) },
    { id: 'r1', status: 'paid', ready_at: at(-5) },
    { id: 'p1', status: 'confirmed', payment_deadline: at(1) },
  ], NOW)
  assertEquals(kinds(list), ['pay:p1', 'pay:p2', 'ready:r1', 'ready:r2'])
})

Deno.test('no orders, no banner', () => {
  assertEquals(orderNudges([], NOW), [])
  assertEquals(orderNudges(null, NOW), [])
})

Deno.test('no "food ready" while a refund is in progress (the code is paused)', () => {
  const ready = { id: 'r', status: 'paid', ready_at: at(-2) }
  assertEquals(kinds(orderNudges([{ ...ready, refunds: [{ status: 'to_send' }] }], NOW)), [])
  assertEquals(kinds(orderNudges([{ ...ready, refunds: [{ status: 'failed' }] }], NOW)), [])
  assertEquals(kinds(orderNudges([{ ...ready, refunds: [{ status: 'cancelled' }] }], NOW)), ['ready:r'])
  assertEquals(kinds(orderNudges([{ ...ready, refunds: [{ status: 'sent' }] }], NOW)), ['ready:r']) // a part refund: food still to collect
})
