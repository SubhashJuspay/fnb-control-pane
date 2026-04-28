import { test, expect } from '@playwright/test';
import {
  createAnalyticsFixtures,
  resetTestData,
} from './fixtures/seed';

/**
 * Wave 3 / Task 11 — Analytics dashboard spec.
 *
 * Seeds a single closed ticket today (1× Latte at $4.50, 8.25% tax = $4.87
 * total) linked to a Guest. Signs in as the demo owner, walks the dashboard
 * and the items / hours insights tabs, and asserts the corresponding
 * analytics surfaces show the seeded data.
 */
test.describe('Analytics flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createAnalyticsFixtures({ tenantSlug: 'acme' });
  });

  test('owner sees today KPIs, top items, and an hours bar', async ({
    page,
  }) => {
    // Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 1. Dashboard: net sales today should be > $0.
    await page.goto('/acme/mission-st/dashboard');
    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: 15_000,
    });
    const netSalesValue = page.getByTestId('kpi-net-sales-today-value');
    await expect(netSalesValue).toBeVisible({ timeout: 10_000 });
    // Closed ticket = $4.50 + 8.25% tax → net sales $4.87 (gross-discount).
    await expect(netSalesValue).toContainText('$4.87');

    const ticketsValue = page.getByTestId('kpi-tickets-today-value');
    await expect(ticketsValue).toContainText('1');

    // 2. Insights / Items: Latte should appear at least once.
    await page.goto('/acme/mission-st/insights/items');
    await expect(page.getByText(/Latte/i).first()).toBeVisible({
      timeout: 15_000,
    });

    // 3. Insights / Hours: at least one chart wrapper renders.
    await page.goto('/acme/mission-st/insights/hours');
    await expect(page.getByTestId('hourly-bars')).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId('dow-bars')).toBeVisible();
  });
});
