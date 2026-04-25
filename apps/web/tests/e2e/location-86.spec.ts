import { test, expect } from '@playwright/test';
import { resetTestData, createCatalogFixtures } from './fixtures/seed';

/**
 * Spec section 8 (acceptance criteria) step 10: owner marks an item 86 from
 * the overrides page; the item shows up on the 86 board; "Mark available"
 * restores it.
 *
 * The override-add dialog (touched in this commit to add an "available"
 * toggle) is the UI surface that flips `available` to false. After save, the
 * overrides page polls and the 86 board shows the item; clicking "Mark
 * available" calls the `setItem86` mutation and the board returns to empty.
 */
test.describe('Location 86 toggle', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createCatalogFixtures({ tenantSlug: 'acme' });
  });

  test('owner marks Latte 86 from overrides, sees it in 86 board, then restores', async ({
    page,
  }) => {
    // Sign in
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // Open the overrides page for Mission St.
    await page.goto('/acme/mission-st/menus/overrides');
    await expect(page.getByText(/nothing 86'd/i)).toBeVisible();

    // Open the "Add override" picker, find Latte, mark it 86, save.
    await page.getByRole('button', { name: 'Add override' }).click();
    const picker = page.getByPlaceholder(/search items/i);
    await picker.fill('Latte');
    await page.getByRole('button', { name: 'Latte', exact: true }).click();

    const dialog = page.getByRole('dialog', { name: /override latte/i });
    await expect(dialog).toBeVisible();
    // Check the "Mark 86" checkbox added in this commit.
    await dialog.getByTestId('override-mark-86').locator('input').check();
    await dialog.getByRole('button', { name: /save override/i }).click();

    // 86 board now shows Latte with a "Mark available" button.
    await expect(page.getByText(/nothing 86'd/i)).toHaveCount(0);
    const markAvailable = page.getByRole('button', { name: /mark available/i });
    await expect(markAvailable).toBeVisible();
    // Latte appears inside the 86 board card list.
    await expect(page.getByText('Latte').first()).toBeVisible();

    // Restore — click "Mark available", board empties out again.
    await markAvailable.click();
    await expect(page.getByText(/nothing 86'd/i)).toBeVisible();
  });
});
