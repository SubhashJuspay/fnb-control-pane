import { test, expect } from '@playwright/test';
import { resetTestData, openSeededTicket } from './fixtures/seed';

/**
 * Spec section 8 (acceptance criteria) steps 11–12: a manager-scoped user can
 * apply a percent ticket discount, and any staff can void a NEW line with a
 * reason. Both actions surface in the active ticket panel.
 */
test.describe('Discount and void', () => {
  test.beforeEach(async () => {
    await resetTestData();
  });

  test('owner applies a 10% ticket discount; voids a line', async ({ page }) => {
    const { ticket } = await openSeededTicket({
      tenantSlug: 'acme',
      locationSlug: 'mission-st',
      itemNames: ['Latte', 'Croissant'],
    });

    // Sign in (owner has both staff + manager scope).
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // Jump straight to the ticket via the URL search param.
    await page.goto(`/acme/mission-st/pos?ticket=${ticket.id}`);
    await expect(
      page.getByRole('heading', { name: `#${ticket.shortNumber}` }),
    ).toBeVisible({ timeout: 10_000 });

    // Apply a 10% ticket discount via the bottom-row "Apply discount" button.
    await page.getByRole('button', { name: /^apply discount$/i }).click();
    const discountDialog = page.getByRole('dialog', { name: /apply ticket discount/i });
    await expect(discountDialog).toBeVisible();
    // Switch from FLAT to PERCENT.
    await discountDialog.getByRole('radio', { name: /^Percent$/ }).check();
    // Numeric input is rendered conditionally on PERCENT.
    await discountDialog.locator('#discount-percent').fill('10');
    await discountDialog.getByLabel(/reason/i).fill('Manager comp');
    await discountDialog.getByRole('button', { name: /^apply discount$/i }).click();

    // The totals block surfaces a "Discount" line; sonner toast confirms.
    await expect(page.getByText(/discount applied/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/^Discount$/)).toBeVisible({ timeout: 10_000 });

    // Void the first line via its kebab.
    const firstLine = page.getByTestId(/^line-row-/).first();
    await firstLine.getByRole('button', { name: /line actions/i }).click();
    await page.getByRole('menuitem', { name: /void line/i }).click();

    const voidDialog = page.getByRole('dialog', { name: /void/i });
    await voidDialog.getByLabel(/reason/i).fill('Wrong item');
    await voidDialog.getByRole('button', { name: /^void line$/i }).click();

    // The line surfaces a "Voided" status pill.
    await expect(firstLine.getByText('Voided')).toBeVisible({ timeout: 10_000 });
  });
});
