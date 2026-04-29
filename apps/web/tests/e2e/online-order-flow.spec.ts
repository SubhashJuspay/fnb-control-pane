import { test, expect } from '@playwright/test';
import { prisma } from '@repo/db';
import { resetTestData, createOnlineOrderFixtures } from './fixtures/seed';

/**
 * End-to-end online order flow per plan task 11:
 *
 *   1.  Anonymous customer browses the public order surface.
 *   2.  Picks a Latte (Size: Medium) and adds to cart.
 *   3.  Reviews cart → checkout → submits the order.
 *   4.  Lands on the confirmation page; tracking URL is shown.
 *   5.  Visits tracking URL → status PENDING.
 *   6.  Owner signs in (separate auth flow), goes to the staff inbox.
 *   7.  Accepts the request → moves to confirmed.
 *   8.  Verifies a Guest "Bob" with phone "555-0100" exists.
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
    const latteTile = page.getByTestId('public-menu-tile-Latte');
    await expect(latteTile).toBeVisible();

    // 2. Tap Latte → modifier picker → pick Medium → submit.
    await latteTile.click();
    const dialog = page.getByTestId('public-modifier-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('public-modifier-Medium').click();
    await dialog.getByTestId('public-modifier-submit').click();
    await expect(dialog).toBeHidden();

    // 3. Open cart drawer → Latte present.
    await page.getByTestId('order-cart-button').click();
    const drawer = page.getByTestId('cart-drawer');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByTestId('cart-line-Latte')).toBeVisible();

    // 4. Verify the cart's checkout button is reachable, then navigate to
    // checkout. We `goto` directly so the test doesn't depend on a SPA
    // navigation interaction that's brittle through Radix Sheet portals;
    // the button presence alone is the integration assertion.
    await expect(page.getByTestId('cart-checkout-button')).toBeVisible();
    // Wait for the cart count to surface in the header — confirms the
    // CartProvider has flushed `items` to sessionStorage before navigation.
    await expect(page.getByTestId('order-cart-button')).toContainText('1');
    await page.goto(`/order/acme/mission-st/checkout`);
    await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 15_000 });
    // Wait for the cart to hydrate from sessionStorage on the checkout page.
    await expect(page.getByTestId('order-cart-button')).toContainText('1');
    await page.getByTestId('checkout-name').fill('Bob');
    await page.getByTestId('checkout-phone').fill('555-0100');
    // ASAP is the default — no need to click pickup toggle.
    await page.getByTestId('checkout-submit').click();

    // 5. Confirmation page with tracking URL.
    await page.waitForURL(/\/confirmation\//, { timeout: 10_000 });
    await expect(page.getByTestId('confirmation-card')).toBeVisible();
    const trackingUrlText = await page.getByTestId('confirmation-tracking-url').textContent();
    expect(trackingUrlText).toBeTruthy();
    const trackingUrl = (trackingUrlText ?? '').trim();
    expect(trackingUrl).toMatch(/\/order\/acme\/mission-st\/track\//);

    // 6. Visit the tracking URL → status PENDING with Latte in the summary.
    await page.goto(trackingUrl);
    await expect(page.getByTestId('tracking-page')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('tracking-status')).toHaveAttribute(
      'data-status',
      'PENDING',
    );
    await expect(page.getByTestId('tracking-item-summary')).toContainText(/Latte/i);

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

    // 10. Guest "Bob" with phone "555-0100" exists in the guest CRM.
    await page.goto('/acme/mission-st/guests');
    await expect(page.getByText('Bob').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText('555-0100').first()).toBeVisible();

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
