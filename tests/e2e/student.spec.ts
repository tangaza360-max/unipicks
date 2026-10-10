import { test, expect, logIn } from './support/fixtures'
import { SEED } from './support/fake-supabase'

// Student flow: Register → Browse deals → Order a deal → See the pickup code.
test('student registers, orders a deal, pays and sees the pickup code', async ({ page, fake }) => {
  const email = 'aline@keplercollege.ac.rw'
  const password = 'Aline-Kigali-2026!'

  // Register with a Kepler email.
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Aline Uwase')
  await page.getByLabel('Phone').fill('0788000111')
  await page.getByLabel('Student email').fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Confirm').fill(password)
  await page.getByLabel('University').selectOption('Kepler College')
  await page.getByLabel('Student ID number').fill('KC2026001')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible()

  // She clicks the link in the email, then logs in.
  fake.confirmEmail(email)
  await logIn(page, email, password)

  // Browse: the deal is on Home; open it.
  await page.getByRole('link', { name: new RegExp(SEED.dealTitle) }).first().click()
  await expect(page.getByRole('heading', { name: SEED.dealTitle })).toBeVisible()

  // Order: one tap on the deal page.
  await page.getByRole('button', { name: /Place order/ }).click()
  await expect(page).toHaveURL(/\/payment\?order_id=/)
  await expect(page.getByText(/accept/i).first()).toBeVisible()

  // The business accepts (in its Orders screen); the page updates.
  fake.businessAcceptsLatestOrder()
  await page.reload()
  await page.getByRole('button', { name: 'Pay Now' }).click()
  await expect(page.getByText('Payment successful')).toBeVisible()

  // The pickup code is in My orders.
  await page.goto('/dashboard/profile?view=orders')
  await expect(page.getByText('Pickup code')).toBeVisible()
  await expect(page.getByText('4821')).toBeVisible()
})

test('a student with a non-Kepler email cannot register', async ({ page, fake }) => {
  await page.goto('/register')
  await page.getByLabel('Full name').fill('Test Person')
  await page.getByLabel('Phone').fill('0788000222')
  await page.getByLabel('Student email').fill('test@gmail.com')
  await page.getByLabel('Password', { exact: true }).fill('Some-Long-Pass-2026')
  await page.getByLabel('Confirm').fill('Some-Long-Pass-2026')
  await page.getByLabel('Student ID number').fill('X1')
  await page.getByRole('checkbox').check()
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page.getByText('must end in @keplercollege.ac.rw')).toBeVisible()
  expect(fake.userByEmail('test@gmail.com')).toBeUndefined()
})
