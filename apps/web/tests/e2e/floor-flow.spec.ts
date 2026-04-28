import { test, expect } from '@playwright/test';
import {
  closeTicketViaPrisma,
  createCatalogFixtures,
  createFloorFixtures,
  resetTestData,
} from './fixtures/seed';
import { prisma } from '@repo/db';

/**
 * Plan section "Task 12 — Floor sub-project E2E specs": click a table on the
 * live floor view, open a bound ticket, close it via Prisma, then verify the
 * table is reported AVAILABLE again on a reload. Prisma is the test's window
 * onto post-commit state — the user-visible flow is open → service → close
 * → table free again.
 */
test.describe('Floor flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createCatalogFixtures({ tenantSlug: 'acme' });
    await createFloorFixtures({ tenantSlug: 'acme' });
  });

  test('owner clicks T-1, opens a ticket, closes it, T-1 returns to AVAILABLE', async ({
    page,
  }) => {
    // 1. Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 2. Live floor at the demo location. T-1 renders inside the SVG canvas.
    await page.goto('/acme/mission-st/floor');
    const canvas = page.locator('[data-floor-canvas]');
    await expect(canvas).toBeVisible({ timeout: 10_000 });
    const tableTile = canvas.locator('[data-table-id]').filter({ hasText: 'T-1' });
    await expect(tableTile).toBeVisible({ timeout: 10_000 });
    await expect(tableTile).toHaveAttribute('data-table-state', 'AVAILABLE');

    // 3. Click T-1 → action sheet opens with the "Open ticket" button.
    await tableTile.click();
    const openTicketButton = page.locator('[data-action="open-ticket"]');
    await expect(openTicketButton).toBeVisible({ timeout: 10_000 });

    // 4. Open the ticket. Caller pushes /acme/mission-st/pos?ticket=<id>.
    await openTicketButton.click();
    await page.waitForURL(/\/acme\/mission-st\/pos\?ticket=[0-9a-f-]+/, {
      timeout: 10_000,
    });
    const url = new URL(page.url());
    const ticketId = url.searchParams.get('ticket');
    expect(ticketId).toBeTruthy();

    // 5. Active ticket badge: panel shows "#<shortNumber>" header.
    await expect(
      page.getByRole('heading', { name: /^#\d+$/ }),
    ).toBeVisible({ timeout: 10_000 });

    // 6. Close the ticket via Prisma (add a Latte line, walk it through to
    //    SERVED, then flip the ticket to CLOSED). Mirrors the POS UI without
    //    the click-by-click dance — this spec is about the floor handoff.
    await closeTicketViaPrisma({ ticketId: ticketId as string, withLatteItem: true });

    // Verify the ticket is actually closed before we navigate.
    const closed = await prisma.ticket.findUniqueOrThrow({
      where: { id: ticketId as string },
      select: { status: true },
    });
    expect(closed.status).toBe('CLOSED');

    // 7. Reload the floor view. T-1 should be AVAILABLE again.
    await page.goto('/acme/mission-st/floor');
    const refreshedTile = page
      .locator('[data-floor-canvas]')
      .locator('[data-table-id]')
      .filter({ hasText: 'T-1' });
    await expect(refreshedTile).toBeVisible({ timeout: 10_000 });
    await expect(refreshedTile).toHaveAttribute('data-table-state', 'AVAILABLE', {
      timeout: 10_000,
    });
  });
});
