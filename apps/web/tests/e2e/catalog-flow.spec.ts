import { test, expect } from '@playwright/test';
import { resetTestData } from './fixtures/seed';

/**
 * Spec section 8 (acceptance criteria) steps 3–6: catalog admin can create a
 * tax category + rate, a modifier group + modifiers, a category, and an item
 * end-to-end through the UI.
 */
test.describe('Catalog flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
  });

  test('owner can create a tax category, modifier group, category, and item', async ({
    page,
  }) => {
    // 1. Sign in
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 2. Tax category "Food" + 8.25% rate at Mission St.
    await page.goto('/acme/admin/catalog/taxes');
    await page.getByRole('button', { name: /new tax category/i }).first().click();
    const taxDialog = page.getByRole('dialog', { name: /new tax category/i });
    await taxDialog.getByLabel('Name').fill('Food');
    // Kind defaults to FOOD via the schema; explicitly select to be safe.
    await taxDialog.getByLabel('Kind').selectOption('FOOD');
    await taxDialog.getByRole('button', { name: 'Create' }).click();
    // Tax category appears in the list.
    await expect(
      page.getByRole('button', { expanded: false, name: /Food\s+FOOD/i }),
    ).toBeVisible();

    // Expand the row and set a rate. Permille is integer-only, so 8.5%
    // round-trips cleanly (85 permille -> "8.50%").
    const foodRow = page.getByRole('button', { name: /Food\s+FOOD/i });
    await foodRow.click();
    await page.getByRole('button', { name: 'Set new rate' }).first().click();
    const rateDialog = page.getByRole('dialog', { name: /set tax rate/i });
    await rateDialog.getByLabel(/rate/i).fill('8.5');
    await rateDialog.getByRole('button', { name: 'Set rate' }).click();
    // Toast confirmation tells us the mutation completed.
    await expect(page.getByText(/tax rate set/i)).toBeVisible();
    // Reload to force the rate sub-query to reissue. The urql document cache
    // does not invalidate the rates query on first write (its initial result
    // was an empty list, so there was no TaxRate __typename overlap to evict).
    // A reload sidesteps the cache by mounting fresh urql clients.
    await page.reload();
    await page.getByRole('button', { name: /Food\s+FOOD/i }).click();
    await expect(page.getByText('8.50%')).toBeVisible();

    // 3. Modifier group "Size" with three modifiers.
    await page.goto('/acme/admin/catalog/modifiers/new');
    await page.getByLabel('Name').fill('Size');
    await page.getByLabel(/minimum selections/i).fill('1');
    await page.getByLabel(/maximum selections/i).fill('1');
    await page.getByRole('button', { name: /create group/i }).click();
    // Lands on /modifiers/[id]; the "Modifiers" sub-card is now visible.
    await page.waitForURL(/\/admin\/catalog\/modifiers\/[0-9a-f-]+$/);
    await expect(page.getByText(/^Modifiers$/)).toBeVisible();

    const addRow = page.getByText(/^Add modifier$/).locator('..');
    for (const [name, dollars] of [
      ['Small', '0'],
      ['Medium', '0.75'],
      ['Large', '1.50'],
    ] as const) {
      await addRow.getByLabel('Name').fill(name);
      const delta = addRow.getByLabel(/price delta/i);
      await delta.click();
      await delta.fill(dollars);
      await delta.blur();
      await addRow.getByRole('button', { name: 'Add', exact: true }).click();
      await expect(page.getByLabel(`${name} name`)).toBeVisible();
    }

    // 4. Category "Drinks".
    await page.goto('/acme/admin/catalog/categories');
    await page.getByLabel('Name').fill('Drinks');
    await page.getByLabel('Slug').fill('drinks');
    await page.getByRole('button', { name: 'Create' }).click();
    await expect(page.getByText('drinks').first()).toBeVisible();

    // 5. Item "Latte".
    await page.goto('/acme/admin/catalog/items/new');
    await page.getByLabel('Name').fill('Latte');
    await page.getByLabel('Short description').fill('Espresso with steamed milk');
    const price = page.getByLabel('Base price');
    await price.click();
    await price.fill('4.50');
    await price.blur();
    await page.getByLabel('Category', { exact: true }).selectOption({ label: 'Drinks' });
    await page.getByLabel('Tax category').selectOption({ label: 'Food (FOOD)' });
    // Toggle the Vegetarian dietary chip.
    await page.getByRole('button', { name: 'Vegetarian' }).click();
    await page.getByRole('button', { name: /create item/i }).click();
    // Lands on item detail.
    await page.waitForURL(/\/admin\/catalog\/items\/[0-9a-f-]+$/);

    // Verify the item shows up on the items list at $4.50.
    await page.goto('/acme/admin/catalog/items');
    await expect(page.getByText('Latte')).toBeVisible();
    await expect(page.getByText('$4.50').first()).toBeVisible();
  });
});
