import { test, expect } from '@playwright/test';
import {
  closeTicketViaPrisma,
  createCatalogFixtures,
  createFloorFixtures,
  resetTestData,
} from './fixtures/seed';
import { prisma } from '@repo/db';

/**
 * Plan section "Task 12 — Floor sub-project E2E specs": create a reservation,
 * confirm it, seat it onto T-1, then close the bound ticket via Prisma and
 * verify the reservation transitions to COMPLETED on reload.
 */
test.describe('Reservation flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createCatalogFixtures({ tenantSlug: 'acme' });
    await createFloorFixtures({ tenantSlug: 'acme' });
  });

  test('owner books a reservation, confirms, seats it on T-1, closes the ticket → COMPLETED', async ({
    page,
  }) => {
    // 1. Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 2. Reservations book at the demo location.
    await page.goto('/acme/mission-st/reservations');
    const newReservationButton = page.locator('[data-action="new-reservation"]');
    await expect(newReservationButton).toBeVisible({ timeout: 10_000 });

    // 3. New reservation. Build the requestedTime as `today + 1 hour` in the
    //    local datetime-local format the input expects (no timezone suffix).
    await newReservationButton.click();
    const newDialog = page.getByRole('dialog', { name: /new reservation/i });
    await expect(newDialog).toBeVisible();

    await newDialog.locator('[data-input="guestName"]').fill('John');
    await newDialog.locator('[data-input="partySize"]').fill('4');
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    const yyyy = inOneHour.getFullYear();
    const mm = String(inOneHour.getMonth() + 1).padStart(2, '0');
    const dd = String(inOneHour.getDate()).padStart(2, '0');
    const hh = String(inOneHour.getHours()).padStart(2, '0');
    const mi = String(inOneHour.getMinutes()).padStart(2, '0');
    const localIso = `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    await newDialog.locator('[data-input="requestedTime"]').fill(localIso);
    await newDialog.locator('[data-action="create"]').click();

    // Dialog closes once the mutation lands.
    await expect(newDialog).toBeHidden({ timeout: 10_000 });

    // 4. The new row appears in PENDING state.
    const johnRow = page
      .getByRole('row')
      .filter({ hasText: 'John' });
    await expect(johnRow).toBeVisible({ timeout: 10_000 });
    await expect(johnRow.locator('[data-status="PENDING"]')).toBeVisible();

    // 5. Confirm. Status flips to CONFIRMED.
    await johnRow.locator('[data-action="confirm"]').click();
    await expect(johnRow.locator('[data-status="CONFIRMED"]')).toBeVisible({
      timeout: 10_000,
    });

    // 6. Seat. SeatDialog opens; T-1 is the only candidate at capacity ≥ 4.
    await johnRow.locator('[data-action="seat"]').click();
    const seatDialog = page.getByRole('dialog', { name: /seat reservation/i });
    await expect(seatDialog).toBeVisible({ timeout: 10_000 });
    const t1Pick = seatDialog.locator('[data-table-pick]').filter({ hasText: 'T-1' });
    await expect(t1Pick).toBeVisible({ timeout: 10_000 });
    await t1Pick.click();
    await seatDialog.locator('[data-action="seat"]').click();

    // Dialog closes; row flips to SEATED.
    await expect(seatDialog).toBeHidden({ timeout: 10_000 });
    await expect(johnRow.locator('[data-status="SEATED"]')).toBeVisible({
      timeout: 10_000,
    });

    // 7. Look up the ticket bound to T-1 via Prisma, then close it. The helper
    //    walks items NEW/FIRED/READY → SERVED, flips the ticket to CLOSED, and
    //    completes any linked SEATED reservation (mirroring the POS server-side
    //    `completeReservationAfterClose` post-commit hook).
    const t1 = await prisma.table.findFirstOrThrow({
      where: { label: 'T-1', location: { slug: 'mission-st' } },
      select: { id: true },
    });
    const ticket = await prisma.ticket.findFirstOrThrow({
      where: { tableId: t1.id, status: 'OPEN' },
      select: { id: true },
    });
    await closeTicketViaPrisma({ ticketId: ticket.id });

    // 8. Reload. Reservation should now show COMPLETED.
    await page.reload();
    const completedRow = page
      .getByRole('row')
      .filter({ hasText: 'John' });
    await expect(completedRow.locator('[data-status="COMPLETED"]')).toBeVisible({
      timeout: 10_000,
    });
  });
});
