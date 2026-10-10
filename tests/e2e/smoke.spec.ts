import { test, expect } from './support/fixtures'

// The public pages open for visitors.
for (const path of ['/register', '/register/merchant', '/login', '/privacy', '/terms']) {
  test(`visitor can open ${path}`, async ({ page, fake }) => {
    void fake
    await page.goto(path)
    await expect(page).toHaveURL(new RegExp(`${path}$`))
    await expect(page.locator('h1, h2').first()).toBeVisible()
  })
}

// The safety net: a request to a real Supabase project never leaves the
// browser, and it is recorded (the fixture then fails any test that made one).
test('requests to a real Supabase project are blocked', async ({ page, fake }) => {
  await page.goto('/login')
  const reached = await page.evaluate(() =>
    fetch('https://dylgephsnywowxxasifs.supabase.co/rest/v1/deals').then(() => true, () => false),
  )
  expect(reached).toBe(false)
  expect(fake.blocked).toEqual(['https://dylgephsnywowxxasifs.supabase.co/rest/v1/deals'])
  fake.blocked.length = 0 // expected here; any other test with a blocked request fails
})
