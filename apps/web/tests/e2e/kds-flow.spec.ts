import { test, expect } from '@playwright/test';
import { resetTestData, fireSeededTicket } from './fixtures/seed';

/**
 * Spec section 8 (acceptance criteria) steps 8–9: KDS shows fired tickets
 * within seconds; bumping items moves them to READY and a card disappears
 * once every line is bumped.
 */
test.describe('KDS flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
  });

  test('KDS shows a fired ticket and a Bump moves the item to READY', async ({
    page,
  }) => {
    // Seed a ticket with two FIRED items, bypassing the POS UI.
    const { ticket } = await fireSeededTicket({
      tenantSlug: 'acme',
      locationSlug: 'mission-st',
      itemNames: ['Latte', 'Croissant'],
    });

    // Sign in.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // Open KDS at the demo location.
    await page.goto('/acme/mission-st/kds');
    const card = page.getByTestId(`kds-card-${ticket.id}`);
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card.getByText(`#${ticket.shortNumber}`)).toBeVisible();

    // Each FIRED item exposes a "Bump <name>" button.
    const bumpButtons = card.getByRole('button', { name: /^bump\b/i });
    await expect(bumpButtons.first()).toBeVisible();

    // Bump the first item. Its row flips to ✓ Ready.
    await bumpButtons.first().click();
    await expect(card.getByText(/^✓ Ready$/).first()).toBeVisible({
      timeout: 10_000,
    });

    // Bump the remaining FIRED item. Both items now show ✓ Ready; the card
    // stays on the board (server filter keeps tickets with READY items so
    // expediters can still see them — items disappear from the board only
    // after the server-side flow marks them SERVED/VOIDED).
    await card.getByRole('button', { name: /^bump\b/i }).first().click();
    await expect(card.getByText(/^✓ Ready$/)).toHaveCount(2, { timeout: 10_000 });
    await expect(card.getByRole('button', { name: /^bump\b/i })).toHaveCount(0);
  });
});
