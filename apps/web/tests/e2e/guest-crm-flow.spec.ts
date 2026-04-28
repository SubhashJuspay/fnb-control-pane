import { test, expect } from '@playwright/test';
import {
  closeTicketViaPrisma,
  createCatalogFixtures,
  createPosFixtures,
  resetTestData,
} from './fixtures/seed';
import { prisma } from '@repo/db';

/**
 * Wave 3 / Task 11 — Guest CRM flow.
 *
 * Walks the manager UI: empty guests list → create Alice via the dialog →
 * open POS → link Alice to a new ticket via the picker → close the ticket
 * (via Prisma to keep the focus on guest semantics) → re-visit the guests
 * list and assert visitCount=1 and the guest profile shows the ticket.
 */
test.describe('Guest CRM flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    // We need a Latte item + Food tax rate so the POS can build a real
    // closed ticket with a non-zero subtotal.
    await createCatalogFixtures({ tenantSlug: 'acme' });
    await createPosFixtures({ tenantSlug: 'acme' });
  });

  test('owner creates a guest, links them to a ticket via POS, and reviews the profile', async ({
    page,
  }) => {
    // Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 1. Empty guests list.
    await page.goto('/acme/mission-st/guests');
    await expect(
      page.getByRole('button', { name: /new guest/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/no guests yet/i)).toBeVisible();

    // 2. Create Alice.
    await page.locator('[data-action="new-guest"]').click();
    const newGuestDialog = page.getByRole('dialog', { name: /new guest/i });
    await expect(newGuestDialog).toBeVisible();
    await newGuestDialog.locator('[data-input="name"]').fill('Alice');
    await newGuestDialog.locator('[data-input="phone"]').fill('555-0100');
    await newGuestDialog
      .getByRole('button', { name: /create guest/i })
      .click();
    // Row appears in the table; scope the assertion to a guest-row testid so
    // the success toast ("Created Alice") doesn't trip strict-mode matching.
    await expect(
      page.locator('[data-testid^="guest-row-"]').filter({ hasText: 'Alice' }),
    ).toBeVisible({ timeout: 10_000 });

    // 3. Open POS, click "New ticket", submit (no label needed).
    await page.goto('/acme/mission-st/pos');
    const newTicketBtn = page.getByRole('button', { name: /new ticket/i });
    await expect(newTicketBtn).toBeVisible({ timeout: 10_000 });
    await newTicketBtn.click();
    const newTicketDialog = page.getByRole('dialog', { name: /open a new ticket/i });
    await newTicketDialog
      .getByRole('button', { name: /open ticket/i })
      .click();

    // Active ticket panel renders.
    await expect(page.getByRole('heading', { name: /^#\d+$/ })).toBeVisible({
      timeout: 10_000,
    });

    // 4. Pick Alice via the GuestPicker.
    await page.locator('[data-action="pick-guest"]').click();
    const picker = page.getByRole('dialog', { name: /pick a guest/i });
    await expect(picker).toBeVisible();
    await picker.locator('[data-input="picker-search"]').fill('Alice');
    // Wait for the row to appear after the 200ms debounce + query.
    const aliceRow = picker.getByText('Alice', { exact: true }).first();
    await expect(aliceRow).toBeVisible({ timeout: 10_000 });
    await aliceRow.click();

    // The active panel should now show Alice as the linked guest.
    await expect(page.getByTestId('linked-guest-name')).toHaveText('Alice', {
      timeout: 10_000,
    });

    // 5. Close the ticket via Prisma (with a Latte line) — the POS UI flow
    //    is exercised in pos-flow.spec.ts; here we focus on guest
    //    semantics. Read back the ticketId from the panel header.
    const ticketHeading = await page
      .getByRole('heading', { name: /^#\d+$/ })
      .innerText();
    const shortNumber = Number.parseInt(ticketHeading.replace('#', ''), 10);
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { shortNumber, location: { slug: 'mission-st' } },
      select: { id: true },
      orderBy: { openedAt: 'desc' },
    });
    await closeTicketViaPrisma({ ticketId: ticket.id, withLatteItem: true });

    // 6. Back to /guests — Alice should now show visitCount=1.
    await page.goto('/acme/mission-st/guests');
    const alice = await prisma.guest.findFirstOrThrow({
      where: { name: 'Alice' },
      select: { id: true },
    });
    await expect(page.getByTestId(`visits-${alice.id}`)).toHaveText('1', {
      timeout: 10_000,
    });

    // 7. Click into Alice's profile and assert the recent ticket appears.
    await page.locator(`[data-testid="guest-row-${alice.id}"]`).click();
    await expect(page.getByText(/recent tickets/i)).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(`#${shortNumber}`)).toBeVisible();
  });
});
