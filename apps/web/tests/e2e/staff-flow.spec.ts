import { test, expect } from '@playwright/test';
import { resetTestData } from './fixtures/seed';

/**
 * Plan section "Task 14 — E2E": admin creates a Job Role, upserts an
 * employment profile for the owner, schedules a shift, publishes the week,
 * and verifies the shift appears on `/my-schedule`.
 *
 * The same user (the demo owner) carries OWNER membership so they hold
 * admin + manager + staff scopes in one identity — the spec exercises every
 * surface from a single login, mirroring how a small operator would actually
 * work day-to-day.
 */
test.describe('Staff flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
  });

  test('owner adds job role + employment, schedules a shift, publishes, sees it on /my-schedule', async ({
    page,
  }) => {
    // 1. Sign in as the demo owner.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 2. Job roles admin: create a "Server" role.
    await page.goto('/acme/admin/job-roles');
    await expect(
      page.getByRole('button', { name: /new job role/i }),
    ).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: /new job role/i }).click();
    const roleDialog = page.getByRole('dialog', { name: /new job role/i });
    await expect(roleDialog).toBeVisible();
    await roleDialog.getByLabel(/^name$/i).fill('Server');
    // The default colour (#6366f1) is fine — submit the form.
    await roleDialog.getByRole('button', { name: /^create$/i }).click();

    // The "Server" row should appear in the table.
    const serverRow = page.getByRole('row').filter({ hasText: 'Server' });
    await expect(serverRow).toBeVisible({ timeout: 10_000 });

    // 3. Staff admin: add an employment profile for the owner at $25.00/hr.
    await page.goto('/acme/admin/staff');
    await expect(
      page.getByRole('button', { name: /add employment/i }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: /add employment/i }).click();

    const employDialog = page.getByRole('dialog', { name: /add employment/i });
    await expect(employDialog).toBeVisible();

    // Pick the owner from the member dropdown. Index 0 is the placeholder
    // ("Select a member…") so index 1 is the only seeded member.
    const memberSelect = employDialog.getByLabel(/^member$/i);
    await memberSelect.selectOption({ index: 1 });

    // Pick the seeded Mission St location.
    await employDialog.getByLabel(/^location$/i).selectOption({ index: 1 });

    // Default employment type is FULL_TIME — leave it.
    // Hourly rate input is a controlled MoneyInput rendered as text. Fill
    // "25.00" so the form emits 2500 cents.
    await employDialog.getByLabel(/hourly rate/i).fill('25.00');

    // Hire date — overwrite the default with a fixed value.
    await employDialog.getByLabel(/hire date/i).fill('2026-01-01');

    await employDialog.getByRole('button', { name: /^save$/i }).click();

    // The owner row appears with $25.00 formatted.
    const ownerRow = page
      .getByRole('row')
      .filter({ hasText: /Acme Owner|owner@acme\.test/i });
    await expect(ownerRow).toBeVisible({ timeout: 10_000 });
    await expect(ownerRow).toContainText('$25.00');

    // 4. Schedule editor: add a draft shift on a future weekday for the owner
    //    as Server, 17:00–22:00. The grid renders rows = users, cols = days;
    //    we click the cell at (owner, +2 days) which is always non-Monday so
    //    we don't worry about week-boundary edge cases.
    await page.goto('/acme/mission-st/schedule');
    await expect(
      page.getByRole('button', { name: /publish week/i }),
    ).toBeVisible({ timeout: 15_000 });

    // The roster row is the only one with the owner's name.
    // Pick a future day — the WeekGrid renders 7 day cells per row labelled
    // by `aria-label="<name> <YYYY-MM-DD>"`. We choose one that's clearly
    // mid-week and in the future for stability.
    const today = new Date();
    // Find next Friday (relative to today, so the shift always lives within
    // the visible week the editor opens to). If today is Friday, push to
    // next Friday (7 days out) to keep things deterministic.
    const day = today.getDay();
    // 0 = Sun, 1 = Mon, ..., 5 = Fri. Aim for Fri = 5.
    let offset = (5 - day + 7) % 7;
    if (offset === 0) offset = 7;
    const target = new Date(today);
    target.setDate(today.getDate() + offset);
    const yyyy = target.getUTCFullYear();
    const mm = String(target.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(target.getUTCDate()).padStart(2, '0');
    const targetUtcKey = `${yyyy}-${mm}-${dd}`;

    // Click the cell. The aria-label is `<member name> <YYYY-MM-DD>` (UTC).
    // Match permissively because the displayed name comes from a DB query.
    const cellButton = page
      .getByRole('button')
      .filter({ hasText: /^\+\s*add$|^$/ })
      .filter({
        has: page.locator('span'),
      });
    void cellButton; // not used — we target via aria-label below

    const dayCell = page.locator(`button[aria-label$="${targetUtcKey}"]`).first();
    await expect(dayCell).toBeVisible({ timeout: 10_000 });
    await dayCell.click();

    const shiftDialog = page.getByRole('dialog', { name: /new shift/i });
    await expect(shiftDialog).toBeVisible({ timeout: 10_000 });
    // Role pre-selects to the first job role — that's "Server" (only one).
    await shiftDialog.getByLabel(/^start$/i).fill('17:00');
    await shiftDialog.getByLabel(/^end$/i).fill('22:00');
    await shiftDialog.getByRole('button', { name: /add shift/i }).click();
    await expect(shiftDialog).toBeHidden({ timeout: 10_000 });

    // The chip should render in the cell with the role label.
    const draftChip = page
      .getByRole('button', { name: /server/i })
      .filter({ hasText: /17:00|5:00/ });
    await expect(draftChip).toBeVisible({ timeout: 10_000 });

    // 5. Publish the week. The chip should lose its DRAFT-dashed outline.
    await page.getByRole('button', { name: /publish week/i }).click();

    // After publish, the publish button disables (no more drafts → 0 drafts).
    await expect(
      page.getByRole('button', { name: /publish week/i }),
    ).toBeDisabled({ timeout: 10_000 });
    // And the counts pill flips to "1 published · 0 draft".
    await expect(page.getByText(/1 published · 0 draft/i)).toBeVisible({
      timeout: 10_000,
    });

    // 6. /my-schedule: the published shift appears with role + time.
    await page.goto('/acme/mission-st/my-schedule');
    await expect(page.getByRole('heading', { name: /my schedule/i })).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/server/i).first()).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByText(/17:00|5:00/).first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
