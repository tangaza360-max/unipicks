import { test, expect, logIn } from './support/fixtures'
import { SEED } from './support/fake-supabase'
import type { Page } from '@playwright/test'

// Admin → Refunds (refund plan, phase 1): the admin sends the MoMo by hand,
// then records it. The database rules are tested in supabase/tests/refunds.test.sh.

async function openRefunds(page: Page) {
  await logIn(page, SEED.admin.email, SEED.admin.password)
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: /^Refunds/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/refunds$/)
  await expect(page.getByRole('heading', { name: 'Refunds', level: 2 })).toBeVisible()
}

test("a business can't serve: the admin refunds the student, a failed MoMo, then sent", async ({ page, fake }) => {
  const order = fake.seedCantServeOrder('sold_out')
  const number = order.id.slice(0, 8).toUpperCase()
  await openRefunds(page)
  const tab = page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: /^Refunds/ })
  await expect(tab).toHaveAccessibleName('Refunds 1 refund to do')

  const waiting = page.getByRole('region', { name: /Businesses that can't serve/ })
  await expect(waiting.getByText(`Mr. Chips can't serve order ${number}`)).toBeVisible()
  await expect(waiting.getByText('Sold out')).toBeVisible()
  await expect(waiting).toContainText('Aline Uwase · paid 4,800 RWF with 250788000111')

  // Start the refund: everything filled in from the order.
  const opener = waiting.getByRole('button', { name: 'Start refund' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Start a refund' })
  await expect(dialog).toContainText(`Order ${number} · Burger Thursday · Mr. Chips`)
  await expect(dialog).toContainText('Paid 4,800 RWF with 250788000111 · UmunotaPay UMP-TEST-1')
  await expect(dialog.getByLabel('Reason')).toHaveValue('cant_serve')
  await expect(dialog.getByLabel('Reason')).toBeFocused()
  await expect(dialog.getByLabel('Amount to send back (RWF)')).toHaveValue('4800')
  await expect(dialog.getByRole('radio', { name: 'The business' })).toBeChecked()

  // More than was paid is refused before anything is sent.
  await dialog.getByLabel('Amount to send back (RWF)').fill('5000')
  await dialog.getByRole('button', { name: 'Start refund' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('The most you can refund is 4,800 RWF.')
  expect(fake.tables.refunds).toHaveLength(0)
  await dialog.getByLabel('Amount to send back (RWF)').fill('4800')
  await dialog.getByRole('button', { name: 'Start refund' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Refund started.' }))
    .toHaveText('Refund started. Now send 4,800 RWF to 250788000111 from the Unipicks MoMo number, then tap Mark as sent.')
  expect(fake.tables.refunds[0]).toMatchObject({ order_id: order.id, amount: 4800, reason: 'cant_serve', charged_to: 'business', status: 'to_send' })

  const toSend = page.getByRole('region', { name: /To send/ })
  await expect(waiting.getByText('Nothing waiting.')).toBeVisible()
  await expect(toSend.getByText('Send to 250788000111')).toBeVisible()
  await expect(toSend).toContainText("Business can't serve · paid by the business")
  await expect(tab).toHaveAccessibleName('Refunds 1 refund to do')

  // The MoMo didn't go through.
  await toSend.getByRole('button', { name: 'It failed' }).click()
  const failed = page.getByRole('dialog', { name: "The MoMo didn't go through" })
  await failed.getByLabel('What happened? (only admins see this)').fill('Number not on MoMo')
  await failed.getByRole('button', { name: 'Mark as failed' }).click()
  await expect(toSend.getByText('Failed — send again')).toBeVisible()
  await expect(toSend.getByRole('button', { name: 'It failed' })).toHaveCount(0)

  // Sent: the reference is required.
  await toSend.getByRole('button', { name: 'Mark as sent' }).click()
  const sent = page.getByRole('dialog', { name: 'Mark as sent' })
  await expect(sent).toContainText('Only after you sent 4,800 RWF to 250788000111 from the Unipicks MoMo number.')
  await sent.getByRole('button', { name: 'Mark as sent' }).click()
  await expect(sent.getByRole('alert')).toHaveText('Type the MoMo reference of the transfer.')
  await sent.getByLabel('MoMo reference').fill('MP241010.1234')
  await sent.getByRole('button', { name: 'Mark as sent' }).click()
  await expect(sent).toHaveCount(0)

  const done = page.getByRole('region', { name: 'Done' })
  await expect(done).toContainText('MoMo reference MP241010.1234')
  await expect(toSend.getByText('No refunds to send.')).toBeVisible()
  expect(order.status).toBe('refunded')
  expect(fake.tables.transactions.find((t) => t.normal_order_id === order.id)?.status).toBe('refunded')
  expect(fake.tables.activity_logs.map((l) => l.action)).toEqual(['refund_started', 'refund_failed', 'refund_sent'])
  expect(fake.tables.user_notifications.filter((n) => n.user_id === order.student_id).map((n) => n.type)).toEqual(['refund_started', 'refund_sent'])
  await page.reload()
  await expect(tab).toHaveAccessibleName('Refunds')
})

test('the admin refunds part of any order by its number, then stops it', async ({ page, fake }) => {
  const order = fake.seedCantServeOrder()
  order.cant_serve_at = null // an ordinary paid order
  await openRefunds(page)
  const opener = page.getByRole('button', { name: 'Refund an order' })
  await opener.click()
  const dialog = page.getByRole('dialog', { name: 'Start a refund' })
  await expect(dialog.getByLabel('Order number')).toBeFocused()
  await dialog.getByLabel('Order number').fill('ZZZZ')
  await dialog.getByRole('button', { name: 'Find order' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Type the 8 characters of the order number, for example AB12CD34.')

  // Escape closes it and puts focus back.
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()

  await opener.click()
  await dialog.getByLabel('Order number').fill(order.id.slice(0, 8).toUpperCase())
  await dialog.getByRole('button', { name: 'Find order' }).click()
  await expect(dialog.getByLabel('Reason')).toHaveValue('other')
  await expect(dialog.getByRole('option', { name: 'Dispute' })).toHaveCount(0) // no dispute on this order
  await dialog.getByLabel('Amount to send back (RWF)').fill('1000')
  await dialog.getByRole('radio', { name: 'Unipicks' }).check()
  await dialog.getByRole('button', { name: 'Start refund' }).click()
  await expect(dialog.getByRole('alert')).toHaveText('Add a note for the student when the reason is Other.')
  await dialog.getByLabel(/Note for the student and the business/).fill('The drink was missing')
  await dialog.getByRole('button', { name: 'Start refund' }).click()
  await expect(dialog).toHaveCount(0)
  expect(fake.tables.refunds[0]).toMatchObject({ amount: 1000, reason: 'other', charged_to: 'unipicks', note: 'The drink was missing' })

  const toSend = page.getByRole('region', { name: /To send/ })
  await expect(toSend).toContainText('“The drink was missing”')
  await toSend.getByRole('button', { name: 'Stop refund' }).click()
  const stop = page.getByRole('dialog', { name: 'Stop this refund?' })
  await stop.getByRole('button', { name: 'Stop refund' }).click()
  await expect(stop.getByRole('alert')).toHaveText('Say why the refund is stopped (the student will see it).')
  await stop.getByLabel(/Why\?/).fill('Started on the wrong order')
  await stop.getByRole('button', { name: 'Stop refund' }).click()
  await expect(page.getByRole('region', { name: 'Done' }).getByText('Stopped')).toBeVisible()
  expect(order.status).toBe('paid')
  expect(fake.tables.user_notifications.at(-1)?.message).toBe('The refund of 1,000 RWF was stopped: Started on the wrong order')
})

test('Disputes: "Resolve and refund" resolves the dispute and starts the refund', async ({ page, fake }) => {
  const order = fake.seedCantServeOrder()
  Object.assign(order, { cant_serve_at: null, dispute_status: 'open', dispute_reason: 'wrong_item', dispute_raised_at: new Date().toISOString() })
  await logIn(page, SEED.admin.email, SEED.admin.password)
  await page.goto('/dashboard/disputes')
  await page.getByRole('button', { name: 'Resolve', exact: true }).click()
  await page.getByLabel('Resolution note (optional)').fill('You got the wrong item')
  await page.getByRole('button', { name: 'Resolve and refund' }).click()
  const dialog = page.getByRole('dialog', { name: 'Start a refund' })
  await expect(dialog.getByLabel('Reason')).toHaveValue('dispute')
  await expect(dialog.getByLabel(/Note for the student and the business/)).toHaveValue('You got the wrong item')
  await expect(dialog.getByRole('radio', { name: 'The business' })).toBeChecked()
  await dialog.getByRole('button', { name: 'Start refund' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('status').filter({ hasText: 'Dispute resolved.' })).toContainText('Now send 4,800 RWF to 250788000111')
  expect(order.dispute_status).toBe('resolved')
  expect(fake.tables.refunds[0]).toMatchObject({ reason: 'dispute', amount: 4800, status: 'to_send' })
})
