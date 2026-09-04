import { test, expect } from '@playwright/test';

// Helper to generate unique emails
function generateEmail(prefix: string): string {
  const timestamp = Date.now();
  return `${prefix}+${timestamp}@test.com`;
}

test.describe('Unipicks End-to-End Tests', () => {
  
  test.describe('Student Flow', () => {
    const studentEmail = generateEmail('student');
    const studentName = 'Test Student';
    const studentPassword = 'Password123!';

    test('1. Student registers and logs in', async ({ page }) => {
      // Go to register page
      await page.goto('http://localhost:4000/register');
      
      // Fill registration form
      await page.getByRole('button', { name: 'Student' }).click();
      await page.getByLabel('Full name').fill(studentName);
      await page.getByLabel('Phone').fill('0788000000');
      await page.getByLabel('Email').fill(studentEmail);
      await page.getByLabel('Password').fill(studentPassword);
      await page.getByLabel('Confirm').fill(studentPassword);
      await page.getByLabel('Student ID number').fill('12345');
      await page.getByLabel('I agree to the').check();
      
      // Submit
      await page.getByRole('button', { name: 'Create account' }).click();
      
      // Verify redirect to dashboard
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.getByText(`Hi, ${studentName}`)).toBeVisible();
    });

    test('2. Student sees deals feed', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(studentEmail);
      await page.getByLabel('Password').fill(studentPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.getByText('Your deals feed')).toBeVisible();
      
      // Check search bar exists
      await expect(page.getByPlaceholder('Search deals or restaurants...')).toBeVisible();
      
      // Check category filters exist
      await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    });

    test('3. Student navigates to Orders tab', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(studentEmail);
      await page.getByLabel('Password').fill(studentPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      // Click Orders tab
      await page.getByRole('button', { name: 'Orders' }).click();
      await expect(page.getByText('No orders yet')).toBeVisible();
    });

    test('4. Student navigates to Profile tab', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(studentEmail);
      await page.getByLabel('Password').fill(studentPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      // Click Profile tab
      await page.getByRole('button', { name: 'Profile' }).click();
      await expect(page.getByText('Profile')).toBeVisible();
      
      // Toggle theme
      const themeToggle = page.getByRole('button', { name: /Light mode|Dark mode/ });
      await themeToggle.click();
      await expect(page).toHaveClass(/light/);
    });
  });

  test.describe('Merchant Flow', () => {
    const merchantEmail = generateEmail('merchant');
    const merchantName = 'Test Merchant';
    const merchantPassword = 'Password123!';
    const businessName = 'Test Business';
    const dealTitle = 'Test Deal';

    test('1. Merchant registers', async ({ page }) => {
      await page.goto('http://localhost:4000/register');
      
      // Fill merchant registration
      await page.getByRole('button', { name: 'Merchant' }).click();
      await page.getByLabel('Full name').fill(merchantName);
      await page.getByLabel('Phone').fill('0788000000');
      await page.getByLabel('Email').fill(merchantEmail);
      await page.getByLabel('Password').fill(merchantPassword);
      await page.getByLabel('Confirm').fill(merchantPassword);
      await page.getByLabel('Business name').fill(businessName);
      await page.getByLabel('RDB number').fill('RDB/12345');
      await page.getByLabel('Address').fill('123 Test St');
      await page.getByLabel('I agree to the').check();
      
      await page.getByRole('button', { name: 'Create account' }).click();
      
      // Verify merchant sees dashboard
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.getByText(`Hi, ${merchantName}`)).toBeVisible();
    });

    test('2. Merchant creates a deal', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(merchantEmail);
      await page.getByLabel('Password').fill(merchantPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      // Fill deal form
      await page.getByLabel('Business name').fill(businessName);
      await page.getByLabel('Deal title').fill(dealTitle);
      await page.getByLabel('Description').fill('20% off all items');
      await page.getByLabel('Original price (RWF)').fill('1000');
      await page.getByLabel('Discount %').fill('20');
      
      await page.getByRole('button', { name: 'Post deal' }).click();
      
      // Verify deal appears in list
      await expect(page.getByText(dealTitle)).toBeVisible();
    });

    test('3. Merchant pauses a deal', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(merchantEmail);
      await page.getByLabel('Password').fill(merchantPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      // Find and click Pause
      const pauseButton = page.getByRole('button', { name: 'Pause' }).first();
      await pauseButton.click();
      
      // Verify status changed to Paused
      await expect(page.getByText('Paused')).toBeVisible();
    });

    test('4. Merchant views Analytics', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(merchantEmail);
      await page.getByLabel('Password').fill(merchantPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      // Click Analytics tab
      await page.getByRole('button', { name: '📊 Analytics' }).click();
      await expect(page.getByText('Total Redemptions')).toBeVisible();
    });
  });

  test.describe('Admin Flow', () => {
    const adminEmail = 'admin@unipicks.com';
    const adminPassword = 'Admin123!';

    test('1. Admin logs in', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(adminEmail);
      await page.getByLabel('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      await expect(page).toHaveURL(/dashboard/);
      await expect(page.getByText('Admin Account')).toBeVisible();
    });

    test('2. Admin approves pending merchant', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(adminEmail);
      await page.getByLabel('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      // Click Merchant Approvals tab
      await page.getByRole('button', { name: 'Merchant Approvals' }).click();
      
      // Click Approve on first pending merchant
      const approveButton = page.getByRole('button', { name: 'Approve' }).first();
      if (await approveButton.isVisible()) {
        await approveButton.click();
      }
    });

    test('3. Admin views Analytics', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(adminEmail);
      await page.getByLabel('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      await page.getByRole('button', { name: '📊 Analytics' }).click();
      await expect(page.getByText('Platform Analytics')).toBeVisible();
    });

    test('4. Admin views User Management', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(adminEmail);
      await page.getByLabel('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      await page.getByRole('button', { name: '👥 Users' }).click();
      await expect(page.getByText('User Management')).toBeVisible();
    });

    test('5. Admin views Activity Logs', async ({ page }) => {
      await page.goto('http://localhost:4000/login');
      await page.getByLabel('Email').fill(adminEmail);
      await page.getByLabel('Password').fill(adminPassword);
      await page.getByRole('button', { name: 'Log in' }).click();
      
      await page.getByRole('button', { name: '📋 Activity Logs' }).click();
      await expect(page.getByText('Activity Logs')).toBeVisible();
    });
  });
});