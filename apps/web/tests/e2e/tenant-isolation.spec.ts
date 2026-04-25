import { test, expect } from '@playwright/test';
import { resetTestData, createTenantWithOwner } from './fixtures/seed';

test.describe('Tenant isolation', () => {
  test.beforeEach(async () => {
    await resetTestData();
  });

  test("tenant A owner cannot see tenant B's data", async ({ page }) => {
    // Seed a second tenant with its own owner.
    await createTenantWithOwner({
      slug: 'beta',
      name: 'Beta Bistro',
      ownerEmail: 'owner@beta.test',
      ownerPassword: 'Password123!',
    });

    // Sign in as Acme owner
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // Try to navigate to tenant B's URL — should redirect away (back to /).
    await page.goto('/beta/main');
    await page.waitForURL((u) => !u.pathname.startsWith('/beta'), {
      timeout: 5000,
    });

    // Try to navigate to tenant B's admin — should redirect.
    await page.goto('/beta/admin/members');
    await page.waitForURL((u) => !u.pathname.startsWith('/beta'), {
      timeout: 5000,
    });

    // Open the tenant/location switcher in the top bar. The switcher should
    // NOT show "Beta Bistro" — only Acme.
    const switcher = page
      .getByRole('button', { name: /switch tenant or location/i })
      .first();
    await expect(switcher).toBeVisible();
    await switcher.click();
    await expect(page.getByText('Beta Bistro')).toHaveCount(0);
  });
});
