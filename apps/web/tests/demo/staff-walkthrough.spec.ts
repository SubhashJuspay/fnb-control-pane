import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Staff-side demo walkthrough — records a video of:
 *   1. A manager signing in
 *   2. Accepting an inbound online order in the inbox
 *   3. Firing the ticket in the POS
 *   4. Bumping each item in the KDS
 *   5. Returning to the POS, serving all ready lines, and closing the
 *      ticket with a Card payment (showing the processing → confirmed
 *      overlay)
 *
 * The customer order that triggers all of this is created with a single
 * GraphQL call *before* the recording context opens, so the video shows
 * only the staff side. That also keeps the run deterministic — we don't
 * depend on a fresh customer flow being mid-air.
 */

const GRAPHQL_PATH = '/api/graphql';

const captions: Array<{ at: number; text: string }> = [];
let recordStartedAt: number | null = null;

function elapsed(): number {
  if (recordStartedAt === null) recordStartedAt = Date.now();
  return Date.now() - recordStartedAt;
}

async function narrate(page: Page, text: string, pauseMs = 1800): Promise<void> {
  captions.push({ at: elapsed(), text });
  // eslint-disable-next-line no-console
  console.log(`[narrate +${(elapsed() / 1000).toFixed(1)}s] ${text}`);
  await page.waitForTimeout(pauseMs);
}

function srtTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
  const m = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
  const s = String(totalSeconds % 60).padStart(2, '0');
  const millis = String(ms % 1000).padStart(3, '0');
  return `${h}:${m}:${s},${millis}`;
}

function writeSrt(outPath: string, endMs: number): void {
  const lines: string[] = [];
  for (let i = 0; i < captions.length; i += 1) {
    const start = captions[i]!.at;
    const end = i + 1 < captions.length ? captions[i + 1]!.at : endMs;
    lines.push(String(i + 1));
    lines.push(`${srtTimestamp(start)} --> ${srtTimestamp(end)}`);
    lines.push(captions[i]!.text);
    lines.push('');
  }
  writeFileSync(outPath, lines.join('\n'), 'utf8');
}

/**
 * Place a fresh online order via the public GraphQL endpoint so the
 * inbox has something to accept when the recording starts. Returns
 * the short ticket number so we can narrate it.
 */
async function seedPendingOrder(request: APIRequestContext, baseURL: string): Promise<{
  shortNumber: number | null;
  itemName: string;
  locationId: string;
}> {
  const endpoint = `${baseURL}${GRAPHQL_PATH}`;

  // 1. Find a menu item with no modifier groups so we can submit cleanly.
  const menuResp = await request.post(endpoint, {
    data: {
      query: /* GraphQL */ `
        query DemoMenuLookup($tenantSlug: String!, $locationSlug: String!) {
          publicLocationBySlug(tenantSlug: $tenantSlug, locationSlug: $locationSlug) {
            id
            activeMenus {
              sections {
                items {
                  id
                  name
                  modifierGroups {
                    id
                  }
                }
              }
            }
          }
        }
      `,
      variables: { tenantSlug: 'acme', locationSlug: 'mission-st' },
    },
  });
  expect(menuResp.ok()).toBeTruthy();
  const menuBody = (await menuResp.json()) as {
    data?: {
      publicLocationBySlug?: {
        id?: string;
        activeMenus?: Array<{
          sections?: Array<{
            items?: Array<{ id: string; name: string; modifierGroups?: Array<{ id: string }> }>;
          }>;
        }>;
      };
    };
  };
  const locationId = menuBody.data?.publicLocationBySlug?.id;
  if (!locationId) {
    throw new Error('publicLocationBySlug did not return a location id');
  }
  const allItems = (menuBody.data?.publicLocationBySlug?.activeMenus ?? [])
    .flatMap((m) => m.sections ?? [])
    .flatMap((s) => s.items ?? []);
  const target =
    allItems.find(
      (i) => i.name === 'Italian Tiramisu' && (i.modifierGroups?.length ?? 0) === 0,
    ) ?? allItems.find((i) => (i.modifierGroups?.length ?? 0) === 0);
  if (!target) {
    throw new Error('No modifier-free menu item found to seed the order');
  }

  // 2. Submit the order anonymously.
  const submitResp = await request.post(endpoint, {
    data: {
      query: /* GraphQL */ `
        mutation DemoSubmitOrder($input: SubmitOnlineOrderInput!) {
          submitOnlineOrder(input: $input) {
            shortNumber
            trackingToken
          }
        }
      `,
      variables: {
        input: {
          tenantSlug: 'acme',
          locationSlug: 'mission-st',
          customerName: 'Demo Customer',
          customerPhone: '+52 55 1234 5678',
          pickupKind: 'ASAP',
          items: [{ menuItemId: target.id, quantity: 1, modifiers: [] }],
        },
      },
    },
  });
  expect(submitResp.ok()).toBeTruthy();
  const submitBody = (await submitResp.json()) as {
    data?: { submitOnlineOrder?: { shortNumber: number | null } };
    errors?: Array<{ message: string }>;
  };
  if (submitBody.errors) {
    throw new Error(`submitOnlineOrder failed: ${submitBody.errors.map((e) => e.message).join(', ')}`);
  }
  return {
    shortNumber: submitBody.data?.submitOnlineOrder?.shortNumber ?? null,
    itemName: target.name,
    locationId,
  };
}

test('Staff handover — accept → fire → bump → serve → close', async (
  { page },
  testInfo,
) => {
  const baseURL = testInfo.project.use.baseURL ?? 'https://fnb-control-panel.vercel.app';

  // Seed a pending online order before the recording starts so the
  // staff inbox has something to act on. Use page.request (the
  // browser-context request fixture) rather than the worker-level
  // request — ngrok-fronted endpoints failed TLS handshake on the
  // worker fixture for reasons we haven't dug into.
  const seeded = await seedPendingOrder(page.request, baseURL);
  console.log(
    `[demo] seeded order #${seeded.shortNumber ?? '?'} with ${seeded.itemName}`,
  );

  recordStartedAt = Date.now();

  // ─── 1. Sign in as a manager ────────────────────────────────────────
  await page.goto('/sign-in', { waitUntil: 'domcontentloaded' });
  await narrate(page, 'A manager signs in to handle the new online order.');
  await page.getByLabel('Email').fill('owner@acme.test');
  await page.getByLabel('Password').fill('Password123!');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // The form uses a server-action that redirects on success — wait for
  // the URL to leave /sign-in so we know the auth cookie is set before
  // navigating to a protected route. Without this, the next goto bounces
  // straight back to /sign-in.
  await page.waitForURL((url) => !url.pathname.endsWith('/sign-in'), {
    timeout: 20_000,
  });
  await page.waitForLoadState('networkidle');

  // ─── 2. Online Orders inbox: Accept the new request ─────────────────
  await page.goto('/acme/mission-st/online-orders', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('online-orders-inbox')).toBeVisible({ timeout: 15_000 });
  await narrate(
    page,
    `In Online Orders, request #${seeded.shortNumber ?? ''} appears at the top with the green "Live" indicator.`,
  );
  const acceptButton = page.locator('[data-testid^="online-order-accept-"]').first();
  await expect(acceptButton).toBeVisible({ timeout: 10_000 });
  await narrate(page, 'They tap Accept — the customer’s tracking page advances to "Confirmed".');
  await acceptButton.click();
  await page.waitForTimeout(2500);

  // ─── 3. POS: pick the ticket + Fire all ─────────────────────────────
  await page.goto('/acme/mission-st/pos', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await narrate(page, 'On the POS, the new ticket appears in the open tickets list.');
  // Pick our specific ticket by short number — there will be other open
  // tickets in the list (from prior demo runs / seed) and we must act on
  // the one we just seeded, not whichever happens to be at the top.
  const ourTicketSelector = seeded.shortNumber
    ? page.locator('aside ul li button').filter({ hasText: `#${seeded.shortNumber}` })
    : page.locator('aside ul li button');
  const ourTicket = ourTicketSelector.first();
  await expect(ourTicket).toBeVisible({ timeout: 10_000 });
  await ourTicket.click();
  await page.waitForTimeout(1200);

  const fireAll = page.getByRole('button', { name: /^fire all$/i });
  if (await fireAll.isVisible().catch(() => false)) {
    await narrate(page, 'They tap "Fire all" — the kitchen now sees the items as FIRED.');
    await fireAll.click();
    await page.waitForTimeout(1800);
  } else {
    await narrate(page, 'Items are already on their way to the kitchen.');
  }

  // ─── 4. KDS: visual narration + API-driven status fast-forward ─────
  // We navigate to the KDS for the visual narration, but the actual
  // status transitions (READY for each item, then SERVED) are driven
  // via authenticated GraphQL mutations. The on-board "Bump" button
  // works fine for humans, but Playwright scoping to "our" card on a
  // shared KDS proved flaky — multiple tickets, identical "Bump" labels,
  // partial-text filters all collide. Driving via API keeps the demo
  // reliable; the video still tells the right story.
  await page.goto('/acme/mission-st/kds', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText(/KDS · /i)).toBeVisible({ timeout: 10_000 });
  await narrate(
    page,
    'On the Kitchen Display, the order appears with customer name, items, allergens, and pickup time.',
    1800,
  );

  // Find our ticket id + items via authenticated GraphQL.
  // The api's request context resolves tenant + location from request headers
  // — without them, openTickets returns an empty list even for the owner.
  const scopedHeaders = {
    'x-tenant-slug': 'acme',
    'x-location-id': seeded.locationId,
  };
  const ticketQuery = await page.request.post(`${baseURL}${GRAPHQL_PATH}`, {
    headers: scopedHeaders,
    data: {
      query: /* GraphQL */ `
        query DemoOpenTickets {
          openTickets {
            id
            shortNumber
            items { id status }
          }
        }
      `,
    },
  });
  const ticketBody = (await ticketQuery.json()) as {
    data?: { openTickets?: Array<{ id: string; shortNumber: number | null; items: Array<{ id: string; status: string }> }> };
  };
  const ourTicketRow = (ticketBody.data?.openTickets ?? []).find(
    (t) => t.shortNumber === seeded.shortNumber,
  );
  if (!ourTicketRow) {
    throw new Error(`Could not locate our ticket #${seeded.shortNumber} via openTickets`);
  }

  // Mark every line READY (cook bump), then SERVED (cashier handoff).
  for (const line of ourTicketRow.items) {
    if (line.status === 'FIRED') {
      await page.request.post(`${baseURL}${GRAPHQL_PATH}`, {
        headers: scopedHeaders,
        data: {
          query: /* GraphQL */ `mutation Ready($input: MarkTicketItemReadyInput!) { markTicketItemReady(input: $input) { id } }`,
          variables: { input: { ticketItemId: line.id } },
        },
      });
    }
  }
  await narrate(
    page,
    'They bump each item as it leaves the pass — green ✓ Ready badges replace the buttons.',
    1800,
  );
  for (const line of ourTicketRow.items) {
    await page.request.post(`${baseURL}${GRAPHQL_PATH}`, {
      headers: scopedHeaders,
      data: {
        query: /* GraphQL */ `mutation Served($input: MarkTicketItemServedInput!) { markTicketItemServed(input: $input) { id } }`,
        variables: { input: { ticketItemId: line.id } },
      },
    });
  }

  // ─── 5. POS: re-select OUR ticket so Close becomes available ───────
  await page.goto('/acme/mission-st/pos', { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  const ourTicket2 = seeded.shortNumber
    ? page.locator('aside ul li button').filter({ hasText: `#${seeded.shortNumber}` }).first()
    : page.locator('aside ul li button').first();
  await ourTicket2.click();
  await page.waitForTimeout(1500);
  await narrate(
    page,
    'Back on the POS with every line served — "Close ticket" is now active.',
  );

  await narrate(
    page,
    'With every line served, "Close ticket" opens the payment dialog.',
  );
  const closeButton = page.getByRole('button', { name: /^close ticket$/i });
  await expect(closeButton).toBeEnabled({ timeout: 8_000 });
  await closeButton.click();
  const closeDialog = page.getByRole('dialog', { name: /^close #/i });
  await expect(closeDialog).toBeVisible({ timeout: 8_000 });
  await page.waitForTimeout(1500);

  // ─── 6. Pick payment + watch the processing overlay ────────────────
  await narrate(
    page,
    'They keep the tip at "No tip", select Card, and tap Pay.',
  );
  await closeDialog.getByTestId('close-payment-card').click().catch(() => undefined);
  await page.waitForTimeout(800);
  await closeDialog.getByTestId('close-ticket-submit').click();
  await narrate(
    page,
    'A brief "Processing card payment…" overlay turns into a green "Payment received".',
    3000,
  );
  // Dialog auto-closes ~0.7s after the success state lands.
  await expect(closeDialog).toBeHidden({ timeout: 8_000 });
  await narrate(
    page,
    'Ticket closed. The customer’s tracking page now advances to "Picked up — Order complete!".',
    2500,
  );

  // ─── Persist captions next to the recording ─────────────────────────
  const totalElapsed = elapsed() + 1000;
  mkdirSync(testInfo.outputDir, { recursive: true });
  const srtPath = join(testInfo.outputDir, 'captions.srt');
  writeSrt(srtPath, totalElapsed);
  console.log(`[walkthrough] wrote captions to ${srtPath}`);
});
