import { test, expect } from '@playwright/test';
import { resetTestData } from './fixtures/seed';

test.describe('Sign-in', () => {
  test.beforeEach(async () => {
    await resetTestData();
  });

  test('demo owner can sign in and lands inside the app shell', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    // Should redirect to /<tenantSlug>/<locationSlug> or /<tenantSlug>/overview.
    await page.waitForURL(/\/acme(\/|$)/);
    // App shell should be visible.
    await expect(page.getByRole('navigation')).toBeVisible();
  });

  test('rejects bad password with a friendly error', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('NotTheRightOne123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText(/incorrect/i)).toBeVisible();
  });
});
