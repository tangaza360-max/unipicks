import { test, expect } from "@playwright/test";

test.describe("Unipicks smoke tests", () => {
  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page).toHaveURL(/\/register/);
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/privacy");
    await expect(page).toHaveURL(/\/privacy/);
  });
});
