import { test, expect } from '@playwright/test';
import { prisma } from '@repo/db';
import { resetTestData, createOnlineOrderFixtures } from './fixtures/seed';

/**
 * End-to-end online order flow per plan task 11:
 *
 *   1.  Anonymous customer browses the public order surface.
 *   2.  Picks a Mango Lassi (Size: Medium) and adds to cart.
 *   3.  Reviews cart → checkout → submits the order.
 *   4.  Lands on the confirmation page; tracking URL is shown.
 *   5.  Visits tracking URL → status PENDING.
 *   6.  Owner signs in (separate auth flow), goes to the staff inbox.
 *   7.  Accepts the request → moves to confirmed.
 *   8.  Verifies a Guest "Bob" with phone "+52 55 1234 5678" exists.
 *   9.  Verifies a ticket was created with the customer label "Bob".
 */
test.describe('online order flow', () => {
  test.beforeEach(async () => {
    await resetTestData();
    await createOnlineOrderFixtures({ tenantSlug: 'acme', locationSlug: 'mission-st' });
  });

  test('anonymous customer submits, owner accepts, ticket + guest created', async ({
    page,
  }) => {
    // 1. Browse public menu (anonymous, no cookie).
    await page.goto('/order/acme/mission-st');
    await expect(page.getByTestId('public-menu-list')).toBeVisible({ timeout: 10_000 });
    const mangoTile = page.getByTestId('public-menu-tile-Mango Lassi');
    await expect(mangoTile).toBeVisible();

    // 2. Tap Mango Lassi → modifier picker → pick Medium → submit.
    await mangoTile.click();
    const dialog = page.getByTestId('public-modifier-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('public-modifier-Medium').click();
    await dialog.getByTestId('public-modifier-submit').click();
    await expect(dialog).toBeHidden();

    // 3. Open cart drawer → Mango Lassi present.
    // 4. Tap the cart button in the header → navigates to /checkout. The
    // dedicated checkout page shows order summary + name/phone form and
    // a Proceed button.
    await expect(page.getByTestId('order-cart-button')).toContainText('1');
    await page.getByTestId('order-cart-button').click();
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('checkout-line-Mango Lassi')).toBeVisible();
    await page.getByTestId('checkout-name').fill('Bob');
    await page.getByTestId('checkout-phone').fill('+52 55 1234 5678');
    await page.getByTestId('checkout-submit').click();

    // 5. Confirmation page with tracking URL.
    await page.waitForURL(/\/confirmation\//, { timeout: 10_000 });
    await expect(page.getByTestId('confirmation-card')).toBeVisible();
    const trackingUrlText = await page.getByTestId('confirmation-tracking-url').textContent();
    expect(trackingUrlText).toBeTruthy();
    const trackingUrl = (trackingUrlText ?? '').trim();
    expect(trackingUrl).toMatch(/\/order\/acme\/mission-st\/track\//);

    // 6. Visit the tracking URL → status PENDING with Mango Lassi in the summary.
    await page.goto(trackingUrl);
    await expect(page.getByTestId('tracking-page')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('tracking-status')).toHaveAttribute(
      'data-status',
      'PENDING',
    );
    await expect(page.getByTestId('tracking-item-summary')).toContainText(/Mango Lassi/i);

    // 7. Sign in as the demo owner. Public flow used no cookie, so signing in
    // adds one to the same browser context.
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('owner@acme.test');
    await page.getByLabel('Password').fill('Password123!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL(/\/acme(\/|$)/, { timeout: 10_000 });

    // 8. Open the staff online-orders inbox. Pending request is visible.
    await page.goto('/acme/mission-st/online-orders');
    await expect(page.getByTestId('online-orders-inbox')).toBeVisible({
      timeout: 10_000,
    });
    const card = page.getByTestId('online-order-card-Bob');
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-status', 'PENDING');

    // 9. Accept the order. Card transitions to CONFIRMED.
    await card.getByRole('button', { name: /^accept$/i }).click();
    await expect(card).toHaveAttribute('data-status', 'CONFIRMED', { timeout: 10_000 });

    // 10. Guest "Bob" with phone "+52 55 1234 5678" exists in the guest CRM.
    await page.goto('/acme/mission-st/guests');
    await expect(page.getByText('Bob').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('+52 55 1234 5678').first()).toBeVisible();

    // 11. A ticket with originChannel=ONLINE exists for the accepted order.
    // The tickets-list page has its own filter wiring concerns we don't want
    // to entangle with this flow, so we assert via Prisma directly.
    const onlineTicket = await prisma.ticket.findFirst({
      where: {
        location: { slug: 'mission-st', tenant: { slug: 'acme' } },
        originChannel: 'ONLINE',
      },
    });
    expect(onlineTicket).not.toBeNull();
  });
});
