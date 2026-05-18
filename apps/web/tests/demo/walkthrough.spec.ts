import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Customer-journey demo walkthrough — records a video of an anonymous guest
 * scanning the QR code, picking items, checking out, and watching the
 * tracking page. The staff handover lives in a separate spec so failures on
 * the staff side don't take the customer recording down with them.
 *
 * Caption track is built as an SRT file alongside the video by recording a
 * timestamp every time `narrate()` is called. The orchestrator script then
 * burns the SRT into the video with ffmpeg.
 */

const captions: Array<{ at: number; text: string }> = [];
let recordStartedAt: number | null = null;

function elapsed(): number {
  if (recordStartedAt === null) recordStartedAt = Date.now();
  return Date.now() - recordStartedAt;
}

async function narrate(page: Page, text: string, pauseMs = 900): Promise<void> {
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

test('Customer journey — QR scan to tracking', async ({ page }, testInfo) => {
  recordStartedAt = Date.now();

  // ─── 1. Storefront ─────────────────────────────────────────────────────
  await page.goto('/order/acme/mission-st', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('public-menu-list')).toBeVisible({ timeout: 20_000 });
  await narrate(page, 'A customer scans the QR code at the table and lands on Acme — Mission St.');
  await narrate(page, 'The menu shows photos, dietary tags, and a category sidebar on the left.');

  // ─── 2. Add a no-modifier item ─────────────────────────────────────────
  const tiramisuTile = page.getByTestId('public-menu-tile-Italian Tiramisu').first();
  await tiramisuTile.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await narrate(page, 'They tap Italian Tiramisu — it goes straight to the cart.');
  await tiramisuTile.click();
  await page.waitForTimeout(1200);

  // ─── 3. Add a modifier-requiring item ──────────────────────────────────
  const mangoTile = page.getByTestId('public-menu-tile-Mango Lassi').first();
  await mangoTile.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await narrate(page, 'Mango Lassi has size options — the picker opens to choose.');
  await mangoTile.click();
  const modifierDialog = page.getByTestId('public-modifier-dialog');
  await expect(modifierDialog).toBeVisible({ timeout: 10_000 });
  await modifierDialog.getByTestId('public-modifier-Medium').click();
  await narrate(page, 'They pick Medium and add it.', 800);
  await modifierDialog.getByTestId('public-modifier-submit').click();
  await expect(modifierDialog).toBeHidden({ timeout: 8_000 });

  // ─── 4. Review the cart ────────────────────────────────────────────────
  const reviewBar = page.getByTestId('order-review-bar-cta');
  await expect(reviewBar).toBeVisible({ timeout: 8_000 });
  await narrate(page, 'A "Review order" bar appears at the bottom with the running total.');
  await reviewBar.click();
  await expect(page.getByTestId('checkout-form')).toBeVisible({ timeout: 10_000 });
  await narrate(page, 'The checkout page shows both items, modifiers, and the subtotal.');

  // ─── 5. Customer details ───────────────────────────────────────────────
  await narrate(page, 'They enter a name and a Mexican phone number — that\'s all.');
  await page.getByTestId('checkout-name').fill('Subhash');
  await page.waitForTimeout(400);
  await page.getByTestId('checkout-phone').fill('+52 55 1234 5678');
  await page.waitForTimeout(800);
  await narrate(page, 'They tap Proceed — pickup is ASAP by default.');
  await page.getByTestId('checkout-submit').click();

  // ─── 6. Confirmation ───────────────────────────────────────────────────
  await page.waitForURL(/\/confirmation\//, { timeout: 25_000 });
  await expect(page.getByTestId('confirmation-card')).toBeVisible({ timeout: 15_000 });
  await narrate(page, 'Order placed! The page shows the order number and a tracking link.', 1800);
  const trackingUrlText = (await page.getByTestId('confirmation-tracking-url').textContent()) ?? '';
  const trackingUrl = trackingUrlText.trim();
  expect(trackingUrl).toMatch(/\/order\/acme\/mission-st\/track\//);

  // ─── 7. Tracking page ──────────────────────────────────────────────────
  await page.goto(trackingUrl, { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tracking-page')).toBeVisible({ timeout: 20_000 });
  await narrate(page, 'The tracking page polls every 5 seconds — status starts at "Received".', 2000);
  await narrate(page, 'When the kitchen accepts, fires, and bumps each item, this page advances.', 2200);
  await narrate(page, 'After the cashier closes the ticket with payment, the customer sees "Picked up — Order complete!"', 3000);

  // ─── Persist captions next to the recording ──────────────────────────
  // Use testInfo.outputDir — Playwright guarantees that's the same folder
  // it'll save video.webm to after the test finishes. Writing relative to
  // the in-flight artifact path orphaned the SRT in a temp directory that
  // Playwright cleaned up at end-of-test.
  const totalElapsed = elapsed() + 1000;
  mkdirSync(testInfo.outputDir, { recursive: true });
  const srtPath = join(testInfo.outputDir, 'captions.srt');
  writeSrt(srtPath, totalElapsed);
  console.log(`[walkthrough] wrote captions to ${srtPath}`);
});
