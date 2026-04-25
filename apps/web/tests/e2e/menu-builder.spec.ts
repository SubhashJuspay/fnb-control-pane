import { test, expect } from '@playwright/test';
import { resetTestData, createCatalogFixtures } from './fixtures/seed';

/**
 * Spec section 8 (acceptance criteria) steps 7–9: owner creates a menu, adds
 * a section, adds a catalog item to the section, and the menu shows up as
 * "Live now" on the listing page (because the schedule defaults to Always).
 */
test.describe('Menu builder', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createCatalogFixtures({ tenantSlug: 'acme' });
  });

  test('owner creates an All Day menu, adds a section + item, sees it as live', async ({
    page,
  }) => {
    // Sign in
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // Create the menu. Schedule defaults to "always" so it lands live.
    await page.goto('/acme/mission-st/menus/new');
    await page.getByLabel('Name').fill('All Day');
    await page.getByRole('button', { name: /create menu/i }).click();

    // Lands on the builder.
    await page.waitForURL(/\/menus\/[0-9a-f-]+$/);
    await expect(page.getByLabel('Menu name')).toHaveValue('All Day');
    await expect(page.getByText('Live now').first()).toBeVisible();

    // Add a "Drinks" section.
    await page.getByRole('button', { name: 'Add section' }).click();
    await page.getByLabel(/section name/i).fill('Drinks');
    await page.getByRole('button', { name: 'Add section' }).click();
    // The new section input box should now be present.
    await expect(page.getByRole('textbox', { name: 'Section name' })).toHaveValue('Drinks');

    // Add Latte to the section via the typeahead picker.
    const picker = page.getByRole('searchbox', { name: /search catalog items/i });
    await picker.click();
    await picker.fill('Latte');
    await page.getByRole('button', { name: /Latte/ }).click();
    // Item appears as a row in the section.
    await expect(page.getByText('Latte')).toBeVisible();
    await expect(page.getByText('$4.50').first()).toBeVisible();

    // Verify "Live now" on the listing page (schedule is Always).
    await page.goto('/acme/mission-st/menus');
    await expect(page.getByRole('link', { name: 'All Day' })).toBeVisible();
    await expect(page.getByText(/live now/i).first()).toBeVisible();
  });
});
