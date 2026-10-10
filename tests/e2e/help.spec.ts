import { test, expect, logIn } from './support/fixtures'
import { SEED } from './support/fake-supabase'

// Help: how to reach Unipicks, from the log-in page (for people who can't log
// in) and from both profiles.
test("someone who can't log in finds Help from the log-in page", async ({ page, fake }) => {
  void fake
  await page.goto('/login')
  await page.getByRole('link', { name: 'Help' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page).toHaveTitle('Help | Unipicks')
  await expect(page.getByRole('heading', { name: 'Help', level: 1 })).toBeVisible()

  const contact = page.getByRole('region', { name: 'Contact us' })
  await expect(contact.getByRole('link', { name: 'Email unipicks.team@gmail.com' }))
    .toHaveAttribute('href', 'mailto:unipicks.team@gmail.com?subject=Unipicks%20help')
  const whatsapp = contact.getByRole('link', { name: 'WhatsApp +250 788 000 999' })
  await expect(whatsapp).toHaveAttribute('href', 'https://wa.me/250788000999')
  await expect(whatsapp).toHaveAttribute('target', '_blank')
  await expect(whatsapp).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(contact).toContainText('within 24 hours')
  await expect(contact).toContainText('the same day')
  await expect(contact).toContainText('Never send your MoMo PIN, password or pickup code')

  // Quick answers open one by one.
  const answer = page.getByText('Not in the app. If the business can')
  await expect(answer).toBeHidden()
  await page.getByText('Can I cancel a paid order?').click()
  await expect(answer).toBeVisible()

  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/login$/)
})

test('a student opens Help from Profile and comes back', async ({ page, fake }) => {
  fake.seedPaidOrderWithCode(SEED.business.email) // creates the student Eric
  await logIn(page, 'eric@keplercollege.ac.rw', 'Eric-Kigali-2026!')
  await page.goto('/dashboard/profile')
  await page.getByRole('button', { name: /^Help/ }).click()
  await expect(page).toHaveURL(/\/help$/)
  await expect(page.getByRole('region', { name: 'Contact us' })).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/dashboard\/profile$/)
})

test('a business opens Help from its profile', async ({ page, fake }) => {
  void fake
  await logIn(page, SEED.business.email, SEED.business.password)
  await page.goto('/dashboard/profile')
  await page.getByRole('link', { name: 'Help and contact' }).click()
  await expect(page).toHaveURL(/\/help$/)
  await page.getByText("Business: why can't I post deals yet?").click()
  await expect(page.getByText('Every new business is checked by Unipicks')).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await expect(page).toHaveURL(/\/dashboard\/profile$/)
})
