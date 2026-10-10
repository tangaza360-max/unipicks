import { test, expect, logIn } from './support/fixtures'
import { SEED } from './support/fake-supabase'

// Business flow: Register → Create a deal → View stats → Check a student's code.
test('business registers, is approved, creates a deal, sees stats and checks a code', async ({ page, fake }) => {
  const email = 'mama@freshjuice.rw'
  const password = 'Mama-Kigali-2026!'

  await page.goto('/register/merchant')
  await page.getByLabel('Full name').fill('Marie Uwimana')
  await page.getByLabel('Phone').fill('0781234567')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm').fill(password)
  await page.getByLabel('Business name').fill('Mama Fresh Juice')
  await page.getByLabel('RDB number').fill('987654321')
  await page.getByLabel('Address').fill('KK 5 St, Kigali')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create business account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()
  expect(fake.tables.merchant_profiles.find((p) => p.business_name === 'Mama Fresh Juice')?.approved).toBe(false)

  fake.confirmEmail(email)
  // Unipicks' admin approves the business (Admin → Approvals).
  fake.approveBusiness(email)
  await logIn(page, email, password)

  // Create a deal.
  await page.getByRole('button', { name: 'Create deal' }).click()
  await page.getByLabel('Deal title').fill('Fresh mango juice')
  await page.getByLabel('Description').fill('Big cup, freshly pressed.')
  await page.getByLabel(/^Price/).fill('1500')
  await page.getByRole('button', { name: 'Post Deal' }).click()
  await expect(page.getByRole('button', { name: 'Post Deal' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Fresh mango juice' })).toBeVisible()
  await expect.poll(() => fake.tables.deals.find((d) => d.title === 'Fresh mango juice')).toMatchObject({ price: 1500, active: true })

  // View stats.
  await page.getByRole('button', { name: 'Stats' }).click()
  await expect(page).toHaveURL(/\/dashboard\/stats/)

  // A student paid; check their pickup code at the counter.
  const paid = fake.seedPaidOrderWithCode(email)
  await page.getByRole('button', { name: 'Deals' }).click()
  await page.getByRole('button', { name: 'Check code' }).click()
  const codeBox = page.getByLabel('Pickup code')
  await expect(codeBox).toHaveAttribute('inputmode', 'numeric')
  const result = page.getByRole('status').filter({ hasText: /linked|Confirmed/ })
  await codeBox.fill('9999')
  await codeBox.press('Enter')
  await expect(result).toHaveText(/not linked to a paid order\. Do not hand over the item\./)
  await codeBox.fill(paid.code)
  await codeBox.press('Enter')
  await expect(result).toHaveText(`Confirmed — ${paid.studentName} ordered "${paid.dealTitle}".`)
  expect(fake.tables.orders.find((o) => o.merchant_id === fake.userByEmail(email)?.id)?.status).toBe('redeemed')
})

const NOT_APPROVED = "Your business is waiting for Unipicks to approve it. You can post deals once it's approved."

test('a business that is not approved yet is told so, and cannot open Create deal', async ({ page, fake }) => {
  const business = fake.addPendingBusiness('Waiting Cafe', 'waiting@cafe.rw')
  await logIn(page, business.email, 'Pending-Kigali-2026!')
  await expect(page.getByRole('status').filter({ hasText: NOT_APPROVED })).toBeVisible()
  const create = page.getByRole('button', { name: 'Create deal' })
  await expect(create).toBeDisabled()
  await expect(create).toHaveAccessibleDescription(NOT_APPROVED)
  await expect(page.getByText('No deals yet. You can create your first deal once your business is approved.')).toBeVisible()
})

test('if approval is removed while the form is open, the business gets a plain message', async ({ page, fake }) => {
  await logIn(page, SEED.business.email, SEED.business.password)
  await page.getByRole('button', { name: 'Create deal' }).click()
  await page.getByLabel('Deal title').fill('Late deal')
  await page.getByLabel(/^Price/).fill('1000')
  // Meanwhile the admin deactivates the business.
  fake.tables.merchant_profiles.find((p) => p.business_name === SEED.business.name)!.approved = false
  await page.getByRole('button', { name: 'Post Deal' }).click()
  await expect(page.getByText(NOT_APPROVED).first()).toBeVisible()
  await expect(page.getByText(/row-level security/)).toHaveCount(0)
  expect(fake.tables.deals.find((d) => d.title === 'Late deal')).toBeUndefined()
})
