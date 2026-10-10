import { test, expect, logIn } from './support/fixtures'
import { SEED } from './support/fake-supabase'

// Admin flow: Log in → Approve a business → View users → View activity logs.
test('admin approves a business, sees users and the activity log', async ({ page, fake }) => {
  fake.addPendingBusiness('Mama Fresh Juice', 'mama@freshjuice.rw')
  await logIn(page, SEED.admin.email, SEED.admin.password)

  // Approvals: the pending business with its details.
  await expect(page.getByRole('heading', { name: 'Pending businesses' })).toBeVisible()
  const card = page.locator('div.border').filter({ hasText: 'Mama Fresh Juice' }).filter({ has: page.getByRole('button', { name: 'Approve' }) })
  await expect(card.getByText('RDB number: 987654321')).toBeVisible()
  await card.getByRole('button', { name: 'Approve' }).click()
  await expect(page.locator('div.border').filter({ hasText: 'Mama Fresh Juice' }).getByRole('button', { name: 'Deactivate' })).toBeVisible()
  expect(fake.tables.merchant_profiles.find((p) => p.business_name === 'Mama Fresh Juice')?.approved).toBe(true)

  // Users.
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Users' }).click()
  await expect(page).toHaveURL(/\/dashboard\/users/)
  await page.getByRole('button', { name: /^Businesses/ }).click()
  await expect(page.getByText('mama@freshjuice.rw')).toBeVisible()

  // Activity logs: the approval was recorded.
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('button', { name: 'Activity logs' }).click()
  await expect(page).toHaveURL(/\/dashboard\/activity-logs/)
  await expect(page.getByText('Mama Fresh Juice')).toBeVisible()
  expect(fake.tables.activity_logs.map((l) => l.action)).toContain('approve_merchant')
})

test('a student cannot open the admin pages', async ({ page, fake }) => {
  fake.seedPaidOrderWithCode(SEED.business.email) // creates the student Eric
  await logIn(page, 'eric@keplercollege.ac.rw', 'Eric-Kigali-2026!')
  await page.goto('/dashboard/approvals')
  await expect(page.getByRole('heading', { name: 'Pending businesses' })).toHaveCount(0)
  await expect(page.getByText('mama@freshjuice.rw')).toHaveCount(0)
})
