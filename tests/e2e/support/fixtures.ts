import { test as base, expect, type Page } from '@playwright/test'
import { FakeSupabase } from './fake-supabase'

// Every test gets its own fresh fake Supabase. After the test: no request may
// have tried to reach a real Supabase project, and the page may not have
// thrown an error.
export const test = base.extend<{ fake: FakeSupabase }>({
  fake: async ({ page }, use) => {
    const fake = new FakeSupabase()
    await fake.install(page)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await use(fake)
    expect(fake.blocked, 'requests to a real Supabase project').toEqual([])
    expect(errors, 'errors thrown by the page').toEqual([])
  },
})

export { expect }

export async function logIn(page: Page, email: string, password: string) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await expect(page).toHaveURL(/\/dashboard/)
}
