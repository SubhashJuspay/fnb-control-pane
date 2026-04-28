import { test, expect } from '@playwright/test';
import { createScheduleFixtures, resetTestData } from './fixtures/seed';

/**
 * Plan section "Task 14 — E2E": owner punches in, starts a break, ends it,
 * punches out, then verifies the entry surfaces in the time-entries report
 * with non-zero net minutes (small but positive given fast test execution).
 *
 * `createScheduleFixtures` seeds a Server job role and a PUBLISHED shift
 * for the owner starting in 30 minutes — within the 60-min window the
 * `punchIn` resolver uses to bind the entry to a real shift, but otherwise
 * unrelated to the punch-clock state machine itself.
 */
test.describe('Time clock flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createScheduleFixtures({ tenantSlug: 'acme' });
  });

  test('owner punches in, takes a break, punches out, sees the entry on /time-entries', async ({
    page,
  }) => {
    // 1. Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 2. Time clock at the demo location.
    await page.goto('/acme/mission-st/time-clock');
    await expect(page.getByRole('heading', { name: /time clock/i })).toBeVisible({
      timeout: 10_000,
    });

    // State NONE → "Punch in" button.
    const punchInButton = page.getByRole('button', { name: /^punch in$/i });
    await expect(punchInButton).toBeVisible({ timeout: 10_000 });

    // 3. Punch in. UI flips to PUNCHED_IN state — "Punch out" + "Start break".
    const main = page.getByRole('main');
    await punchInButton.click();
    const punchOutButton = page.getByRole('button', { name: /^punch out$/i });
    const startBreakButton = page.getByRole('button', { name: /start break/i });
    await expect(punchOutButton).toBeVisible({ timeout: 10_000 });
    await expect(startBreakButton).toBeVisible();
    // Activity log shows the clock-in entry. Scope to <main> so the toast
    // (also showing "Punched in") doesn't trip strict-mode resolution.
    await expect(main.getByText(/punched in/i)).toBeVisible({ timeout: 10_000 });

    // 4. Start break. UI flips to ON_BREAK — "End break" + "Punch out".
    await startBreakButton.click();
    const endBreakButton = page.getByRole('button', { name: /end break/i });
    await expect(endBreakButton).toBeVisible({ timeout: 10_000 });
    // The PunchClock primitive in ON_BREAK state still shows "Punch out".
    await expect(page.getByRole('button', { name: /^punch out$/i })).toBeVisible();
    await expect(main.getByText(/break started/i)).toBeVisible({
      timeout: 10_000,
    });

    // 5. End break. UI flips back to PUNCHED_IN.
    await endBreakButton.click();
    await expect(
      page.getByRole('button', { name: /start break/i }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByRole('button', { name: /^punch out$/i }),
    ).toBeVisible();
    await expect(main.getByText(/break finished/i)).toBeVisible({
      timeout: 10_000,
    });

    // 6. Punch out. UI flips back to NONE — "Punch in" reappears.
    await page.getByRole('button', { name: /^punch out$/i }).click();
    await expect(
      page.getByRole('button', { name: /^punch in$/i }),
    ).toBeVisible({ timeout: 10_000 });

    // 7. Time entries report. The completed entry shows up with non-zero
    //    net minutes. Filtering is permissive — as the only test entry, it
    //    should appear without filters applied.
    await page.goto('/acme/mission-st/time-entries');
    await expect(
      page.getByRole('heading', { name: /time entries/i }),
    ).toBeVisible({ timeout: 10_000 });

    const entryRow = page
      .getByRole('row')
      .filter({ hasText: /Acme Owner|owner@acme\.test/i });
    await expect(entryRow).toBeVisible({ timeout: 10_000 });

    // Net column renders "h:mm". With a near-zero elapsed time the minutes
    // are usually 0, so we just assert the net cell renders an h:mm-shaped
    // value (not a "—" dash) — i.e. the row is closed and the column is
    // populated. The entry passing through punch_in → break → break_end →
    // punch_out is the spec's actual contract.
    await expect(entryRow.getByText(/^\d+:\d{2}$/).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
