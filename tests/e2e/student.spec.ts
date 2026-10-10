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

test("a student can tap the order alerts in Social → Activity", async ({ page, fake }) => {
  fake.seedPaidOrderWithCode(SEED.business.email) // creates the student Eric and a paid order
  const eric = fake.userByEmail('eric@keplercollege.ac.rw')!
  // He has set up Social (otherwise Social first shows its setup steps).
  ;(fake.tables.student_profiles ??= []).push({ user_id: eric.id, username: 'eric', display_name: 'Eric M', university: 'Kepler College', campus: 'Kigali', is_18_plus: true, discoverable: true, created_at: new Date().toISOString() })
  const order = fake.tables.orders.find((o) => o.student_id === eric.id)!
  Object.assign(order, { status: 'confirmed', payment_deadline: new Date(Date.now() + 5 * 60_000).toISOString() })
  const alert = (n: number, message: string, link_path: string) =>
    fake.tables.user_notifications.push({ id: `00000000-0000-4000-8000-0000000000a${n}`, user_id: eric.id, type: 'order_update', message, link_path, is_read: false, created_at: new Date(Date.now() - n * 60_000).toISOString() })
  alert(1, 'Mr. Chips accepted your order. Pay within 5 minutes.', `/payment?order_id=${order.id}`)
  alert(2, 'Your order is ready to collect.', '/dashboard/profile?view=orders')
  alert(3, 'Win a prize', `/payment?order_id=${order.id}&next=https://evil.example`)

  await logIn(page, 'eric@keplercollege.ac.rw', 'Eric-Kigali-2026!')
  const openActivity = async () => {
    await page.goto('/dashboard/social')
    await page.getByRole('button', { name: 'Activity' }).click()
  }

  await openActivity()
  await expect(page.getByRole('link', { name: /Win a prize/ })).toHaveCount(0) // not an exact allowed page
  await page.getByRole('link', { name: /accepted your order/ }).click()
  await expect(page).toHaveURL(new RegExp(`/payment\\?order_id=${order.id}$`))
  await expect(page.getByRole('button', { name: 'Pay Now' })).toBeVisible()

  await openActivity()
  await page.getByRole('link', { name: /ready to collect/ }).click()
  await expect(page).toHaveURL(/\/dashboard\/profile\?view=orders$/)
})

test('Home shows "pay now" and "food ready" to a student who never set up Social', async ({ page, fake }) => {
  fake.seedPaidOrderWithCode(SEED.business.email) // Eric (no Social profile) and a paid order
  const eric = fake.userByEmail('eric@keplercollege.ac.rw')!
  const order = fake.tables.orders.find((o) => o.student_id === eric.id)!
  const banner = page.getByRole('region', { name: 'Your orders need you' })

  // The business accepted: pay within 5 minutes.
  Object.assign(order, { status: 'confirmed', payment_deadline: new Date(Date.now() + 4 * 60_000).toISOString() })
  await logIn(page, 'eric@keplercollege.ac.rw', 'Eric-Kigali-2026!')
  await expect(banner.getByText('Mr. Chips accepted your order', { exact: true })).toBeVisible()
  await expect(banner.getByText(/Burger Thursday · Pay within [34]:\d\d/)).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'Mr. Chips accepted your order. Pay within 5 minutes.' })).toHaveCount(1)
  await banner.getByRole('link', { name: 'Pay now' }).click()
  await expect(page).toHaveURL(new RegExp(`/payment\\?order_id=${order.id}$`))
  await page.getByLabel('Rwandan phone number').fill('0788000333') // Eric's account has no phone saved
  await page.getByRole('button', { name: 'Pay Now' }).click()
  await expect(page.getByText('Payment successful')).toBeVisible()

  // Paid, not ready yet: nothing to do, no banner.
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: 'All deals' })).toBeVisible()
  await expect(banner).toHaveCount(0)

  // The business marks it ready.
  order.ready_at = new Date().toISOString()
  await page.reload()
  await expect(banner.getByText('Your food is ready at Mr. Chips', { exact: true })).toBeVisible()
  await banner.getByRole('link', { name: 'See code' }).click()
  await expect(page).toHaveURL(/\/dashboard\/profile\?view=orders$/)
  await expect(page.getByText('4821').first()).toBeVisible()
})

test('the Home banner hides an expired payment window and groups extra orders', async ({ page, fake }) => {
  fake.seedPaidOrderWithCode(SEED.business.email)
  const eric = fake.userByEmail('eric@keplercollege.ac.rw')!
  const first = fake.tables.orders.find((o) => o.student_id === eric.id)!
  Object.assign(first, { status: 'confirmed', payment_deadline: new Date(Date.now() - 60_000).toISOString() }) // expired
  for (let i = 0; i < 3; i++) {
    fake.tables.orders.push({ ...first, id: crypto.randomUUID(), status: 'confirmed', payment_deadline: new Date(Date.now() + (i + 2) * 60_000).toISOString() })
  }
  await logIn(page, 'eric@keplercollege.ac.rw', 'Eric-Kigali-2026!')
  const banner = page.getByRole('region', { name: 'Your orders need you' })
  await expect(banner.getByRole('link', { name: 'Pay now' })).toHaveCount(2) // 3 open windows: 2 shown
  await expect(banner.getByRole('link', { name: 'and 1 more in My orders' })).toBeVisible()
  await expect(banner.getByText(/Pay within 1:\d\d/)).toBeVisible() // the most urgent (2 min) first
})
