import { test, expect } from '@playwright/test';
import { resetTestData } from './fixtures/seed';
import { clearMailHog, findEmailTo, extractFirstUrl } from './fixtures/mailhog';

test.describe('Invitation acceptance', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await clearMailHog();
  });

  test('owner invites a manager who accepts via email link', async ({ page, baseURL }) => {
    // 1. Owner signs in
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/);

    // 2. Owner navigates to /acme/admin/members
    await page.goto('/acme/admin/members');
    await expect(page.getByRole('heading', { name: /team members/i })).toBeVisible();

    // 3. Open InviteMemberDialog
    await page.getByRole('button', { name: /invite member/i }).click();

    // 4. Fill invite form: manager role, scoped to mission-st
    const inviteeEmail = 'manager@acme.test';
    await page.getByLabel('Email').fill(inviteeEmail);
    await page.getByLabel('Role').selectOption('MANAGER');
    // `exact: true` so we don't match the top-bar's "Switch tenant or
    // location" button label, which contains the substring "Location".
    const locationSelect = page.getByLabel('Location', { exact: true });
    // Wait for the location <select> to become enabled — the form's
    // role-change effect resets locationId synchronously but the disabled
    // attribute flips on the next render.
    await expect(locationSelect).toBeEnabled();
    // The locations dropdown is fed by an async GraphQL query, so wait for
    // the first real (non-placeholder) option to land before selecting it.
    // The placeholder option has an empty `value`; real options carry a UUID.
    await expect
      .poll(
        () =>
          locationSelect.evaluate((el) => {
            const select = el as HTMLSelectElement;
            return Array.from(select.options).filter((o) => o.value).length;
          }),
        { timeout: 10_000 },
      )
      .toBeGreaterThan(0);
    const locationValue = await locationSelect.evaluate((el) => {
      const select = el as HTMLSelectElement;
      const opt = Array.from(select.options).find((o) => o.value);
      return opt ? opt.value : '';
    });
    expect(locationValue).toBeTruthy();
    await locationSelect.selectOption(locationValue);
    await page.getByRole('button', { name: /send invite/i }).click();

    // 5. Wait for the toast / refetch confirming invitation created
    await expect(page.getByText(inviteeEmail)).toBeVisible();

    // 6. Fetch the email from MailHog
    const email = await findEmailTo(inviteeEmail, { timeoutMs: 15_000 });
    expect(email).not.toBeNull();
    const inviteUrl = extractFirstUrl(email!.Content.Body, `${baseURL}/sign-up/`);
    expect(inviteUrl).toBeTruthy();

    // 7. Open invitation in a new context (so we lose the owner's session)
    //    and accept
    const inviteeContext = await page.context().browser()!.newContext();
    const inviteeTab = await inviteeContext.newPage();
    await inviteeTab.goto(inviteUrl!);
    await expect(inviteeTab.getByText(/Acme Restaurant Group/i)).toBeVisible();
    await inviteeTab.getByLabel('Your name').fill('New Manager');
    await inviteeTab.getByLabel('Password').fill('Password123!');
    await inviteeTab.getByRole('button', { name: /create account/i }).click();

    // 8. Should land in the app, scoped to acme/mission-st
    await inviteeTab.waitForURL(/\/acme(\/|$)/);

    await inviteeContext.close();
  });
});
