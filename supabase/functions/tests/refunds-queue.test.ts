// Admin → Refunds: the to-do list, the amount left, and the order-number search.
import { assertEquals } from 'jsr:@std/assert@1'
// @ts-ignore: plain JS module from the web app
import { amountLeft, orderNumber, orderNumberRange, payerPhone, reasonLabel, refundQueue, refundStatusLabel } from '../../../src/lib/refunds.js'

Deno.test('the to-do list: waiting businesses, then refunds to send, oldest first', () => {
  const refunds = [
    { id: 'r1', order_id: 'o1', status: 'failed', created_at: '2026-10-10T08:00:00Z' },
    { id: 'r2', order_id: 'o2', status: 'to_send', created_at: '2026-10-10T09:00:00Z' },
    { id: 'r3', order_id: 'o3', status: 'to_send', created_at: '2026-10-10T07:00:00Z' },
    { id: 'r4', order_id: 'o4', status: 'sent', created_at: '2026-10-09T07:00:00Z', sent_at: '2026-10-10T10:00:00Z' },
    { id: 'r5', order_id: 'o5', status: 'cancelled', created_at: '2026-10-09T08:00:00Z', updated_at: '2026-10-10T11:00:00Z' },
  ]
  const cantServeOrders = [
    { id: 'o9', status: 'paid', cant_serve_at: '2026-10-10T12:00:00Z' },
    { id: 'o8', status: 'paid', cant_serve_at: '2026-10-10T06:00:00Z' },
    { id: 'o2', status: 'paid', cant_serve_at: '2026-10-10T05:00:00Z' }, // a refund already started
    { id: 'o5', status: 'paid', cant_serve_at: '2026-10-10T05:00:00Z' }, // its refund was stopped: decide again
    { id: 'o7', status: 'redeemed', cant_serve_at: '2026-10-10T05:00:00Z' }, // collected after all
  ]
  const q = refundQueue({ refunds, cantServeOrders })
  assertEquals(q.waiting.map((o: { id: string }) => o.id), ['o5', 'o8', 'o9'])
  assertEquals(q.toSend.map((r: { id: string }) => r.id), ['r3', 'r2', 'r1'])
  assertEquals(q.done.map((r: { id: string }) => r.id), ['r5', 'r4'])
  assertEquals(q.count, 6)
  assertEquals(refundQueue({}).count, 0)
})

Deno.test('amount left: stopped refunds give money back; a double charge counts on its own', () => {
  const refunds = [
    { amount: 1000, reason: 'other', status: 'sent' },
    { amount: 500, reason: 'dispute', status: 'to_send' },
    { amount: 4000, reason: 'other', status: 'cancelled' },
    { amount: 4800, reason: 'double_payment', status: 'sent' },
  ]
  assertEquals(amountLeft(4800, refunds), 3300)
  assertEquals(amountLeft(4800, refunds, 'double_payment'), 0)
  assertEquals(amountLeft(4800, []), 4800)
  assertEquals(amountLeft(1000, [{ amount: 5000, reason: 'other', status: 'sent' }]), 0)
})

Deno.test('order numbers: 8 characters, as on receipts', () => {
  assertEquals(orderNumber('ab12cd34-1111-4111-8111-111111111111'), 'AB12CD34')
  assertEquals(orderNumberRange('AB12CD34'), { from: 'ab12cd34-0000-0000-0000-000000000000', to: 'ab12cd34-ffff-ffff-ffff-ffffffffffff' })
  assertEquals(orderNumberRange(' No. ab12cd34 ')?.from, 'ab12cd34-0000-0000-0000-000000000000')
  for (const bad of ['', 'AB12CD3', 'AB12CD345', 'ZZ12CD34', 'ab12cd34-1111', null]) assertEquals(orderNumberRange(bad), null, String(bad))
})

Deno.test('plain words and the phone that paid', () => {
  assertEquals(reasonLabel('cant_serve'), "Business can't serve")
  assertEquals(reasonLabel('double_payment'), 'Charged twice')
  assertEquals(refundStatusLabel('failed'), 'Failed — send again')
  assertEquals(refundStatusLabel('cancelled'), 'Stopped')
  assertEquals(payerPhone({ payer_phone: '250788000111' }), '250788000111')
  assertEquals(payerPhone({ webhook_payload: { phone: '0788000222' } }), '0788000222')
  assertEquals(payerPhone({ webhook_payload: {} }), null)
  assertEquals(payerPhone(null), null)
})
