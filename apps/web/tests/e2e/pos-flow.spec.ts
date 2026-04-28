import { test, expect } from '@playwright/test';
import { resetTestData, createPosFixtures } from './fixtures/seed';

/**
 * Spec section 8 (acceptance criteria) steps 1–13: open → add → modifiers →
 * fire → mark ready → mark served → close. KDS bump and discount/void are
 * exercised in their dedicated specs.
 */
test.describe('POS flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createPosFixtures({ tenantSlug: 'acme' });
  });

  test('owner opens a ticket, adds items, fires, marks served, closes', async ({
    page,
  }) => {
    // Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // POS workspace at the demo location.
    await page.goto('/acme/mission-st/pos');
    await expect(page.getByRole('button', { name: /new ticket/i })).toBeVisible({
      timeout: 10_000,
    });

    // Open a new ticket. Order type defaults to DINE_IN; submit just confirms.
    await page.getByRole('button', { name: /new ticket/i }).click();
    const newTicketDialog = page.getByRole('dialog', { name: /open a new ticket/i });
    await newTicketDialog.getByLabel(/customer label/i).fill('Sarah');
    await newTicketDialog.getByRole('button', { name: /open ticket/i }).click();

    // Active ticket panel renders the new ticket header.
    await expect(page.getByRole('heading', { name: /^#\d+$/ })).toBeVisible({
      timeout: 10_000,
    });

    // Tap a Latte tile (has a required Size group). Pick Medium and confirm.
    await page.getByRole('button', { name: /Latte/ }).first().click();
    const modifierDialog = page.getByRole('dialog');
    await expect(modifierDialog.getByRole('heading', { name: 'Latte' })).toBeVisible();
    const mediumOption = modifierDialog.getByRole('checkbox', { name: /Medium/ });
    await mediumOption.click();
    await expect(mediumOption).toHaveAttribute('aria-checked', 'true');
    const addButton = modifierDialog.getByRole('button', { name: /add to ticket/i });
    await expect(addButton).toBeEnabled();
    await addButton.click();

    // Latte appears as a line in the active panel.
    const lattLine = page.getByTestId(/^line-row-/).filter({ hasText: 'Latte' });
    await expect(lattLine).toBeVisible({ timeout: 10_000 });

    // Tap a Croissant tile (no modifier groups → adds directly).
    await page.getByRole('button', { name: /Croissant/ }).first().click();
    const croissantLine = page
      .getByTestId(/^line-row-/)
      .filter({ hasText: 'Croissant' });
    await expect(croissantLine).toBeVisible({ timeout: 10_000 });

    // Both lines should currently be NEW (status pill "New").
    await expect(lattLine.getByText('New')).toBeVisible();
    await expect(croissantLine.getByText('New')).toBeVisible();

    // Fire all NEW lines.
    await page.getByRole('button', { name: /fire all/i }).click();
    await expect(lattLine.getByText('Fired')).toBeVisible({ timeout: 10_000 });
    await expect(croissantLine.getByText('Fired')).toBeVisible();

    // Mark each line ready, then served, by walking the kebab menu.
    const lineRows = page.getByTestId(/^line-row-/);
    const rowCount = await lineRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(2);

    // Walk: Fired -> Ready
    for (let i = 0; i < rowCount; i++) {
      const row = lineRows.nth(i);
      await row.getByRole('button', { name: /line actions/i }).click();
      await page.getByRole('menuitem', { name: /mark ready/i }).click();
      await expect(row.getByText('Ready')).toBeVisible({ timeout: 10_000 });
    }

    // Walk: Ready -> Served
    for (let i = 0; i < rowCount; i++) {
      const row = lineRows.nth(i);
      await row.getByRole('button', { name: /line actions/i }).click();
      await page.getByRole('menuitem', { name: /mark served/i }).click();
      await expect(row.getByText('Served')).toBeVisible({ timeout: 10_000 });
    }

    // Close the ticket.
    await page.getByRole('button', { name: /^close ticket$/i }).click();
    const closeDialog = page.getByRole('dialog', { name: /^close #/i });
    await closeDialog.getByLabel(/close note/i).fill('paid cash');
    await closeDialog.getByRole('button', { name: /^close ticket$/i }).click();

    // The ticket panel surfaces a "Closed at …" badge once the mutation lands.
    await expect(page.getByText(/closed at/i)).toBeVisible({ timeout: 10_000 });
  });
});
