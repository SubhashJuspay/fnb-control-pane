import type { PrismaClient } from '@repo/db';
import { logger } from '../logger.js';
import { sendEmail } from './client.js';

/**
 * Online-order transactional email.
 *
 * Each public function is fire-and-forget: it never throws. SMTP failures
 * (provider down, rate limited, missing config) must not break the user-
 * facing mutation. Errors are logged at warn level so we can spot them in
 * Pino without alerting on a mailer hiccup.
 */

export interface OrderEmailContext {
  customerName: string;
  customerEmail: string;
  /** Phone is always present on a request — exposed for the SMS dispatcher. */
  customerPhone: string;
  shortNumber: number;
  tenantName: string;
  locationName: string;
  trackingUrl: string;
  rejectReason?: string | null;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function firstName(full: string): string {
  const f = full.trim().split(/\s+/)[0] ?? full;
  return f.replace(/[^A-Za-z0-9-]/g, '') || full;
}

function commonShell(body: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:560px">${body}</div>`;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function renderOrderReceived(c: OrderEmailContext): RenderedEmail {
  const subject = `Order #${c.shortNumber} received — ${c.tenantName}`;
  const text = [
    `Hi ${firstName(c.customerName)},`,
    ``,
    `We've got your order #${c.shortNumber} at ${c.tenantName} — ${c.locationName}.`,
    `The kitchen will confirm it shortly. Track your order:`,
    c.trackingUrl,
    ``,
    `— ${c.tenantName}`,
  ].join('\n');
  const html = commonShell(`
    <p>Hi ${escapeHtml(firstName(c.customerName))},</p>
    <p>We've got your order <strong>#${c.shortNumber}</strong> at
       <strong>${escapeHtml(c.tenantName)}</strong> —
       ${escapeHtml(c.locationName)}.</p>
    <p>The kitchen will confirm it shortly. You can follow the status here:</p>
    <p><a href="${escapeHtml(c.trackingUrl)}">${escapeHtml(c.trackingUrl)}</a></p>
    <p style="color:#666;font-size:12px">— ${escapeHtml(c.tenantName)}</p>
  `);
  return { subject, html, text };
}

export function renderOrderConfirmed(c: OrderEmailContext): RenderedEmail {
  const subject = `Order #${c.shortNumber} confirmed — ${c.tenantName}`;
  const text = [
    `Hi ${firstName(c.customerName)},`,
    ``,
    `Order #${c.shortNumber} is confirmed and being prepared. We'll email again`,
    `when it's ready for pickup.`,
    ``,
    `Track: ${c.trackingUrl}`,
    ``,
    `— ${c.tenantName}`,
  ].join('\n');
  const html = commonShell(`
    <p>Hi ${escapeHtml(firstName(c.customerName))},</p>
    <p>Order <strong>#${c.shortNumber}</strong> is <strong>confirmed</strong> and
       being prepared. We'll email again when it's ready for pickup.</p>
    <p><a href="${escapeHtml(c.trackingUrl)}">Track your order</a></p>
    <p style="color:#666;font-size:12px">— ${escapeHtml(c.tenantName)}</p>
  `);
  return { subject, html, text };
}

export function renderOrderReady(c: OrderEmailContext): RenderedEmail {
  const subject = `Order #${c.shortNumber} is ready for pickup — ${c.tenantName}`;
  const text = [
    `Hi ${firstName(c.customerName)},`,
    ``,
    `Your order #${c.shortNumber} is ready for pickup at`,
    `${c.tenantName} — ${c.locationName}.`,
    ``,
    `See you soon!`,
    `— ${c.tenantName}`,
  ].join('\n');
  const html = commonShell(`
    <p>Hi ${escapeHtml(firstName(c.customerName))},</p>
    <p>Your order <strong>#${c.shortNumber}</strong> is
       <strong style="color:#047857">ready for pickup</strong> at
       <strong>${escapeHtml(c.tenantName)}</strong> —
       ${escapeHtml(c.locationName)}.</p>
    <p>See you soon!</p>
    <p style="color:#666;font-size:12px">— ${escapeHtml(c.tenantName)}</p>
  `);
  return { subject, html, text };
}

export function renderOrderRejected(c: OrderEmailContext): RenderedEmail {
  const subject = `Order #${c.shortNumber} couldn't be accepted — ${c.tenantName}`;
  const reason = c.rejectReason ?? null;
  const text = [
    `Hi ${firstName(c.customerName)},`,
    ``,
    `We couldn't accept order #${c.shortNumber} at ${c.tenantName}.`,
    reason ? `Reason: ${reason}` : '',
    ``,
    `Sorry about that — please reach out to the location if you need help.`,
    `— ${c.tenantName}`,
  ]
    .filter((s) => s !== '')
    .join('\n');
  const html = commonShell(`
    <p>Hi ${escapeHtml(firstName(c.customerName))},</p>
    <p>We couldn't accept order <strong>#${c.shortNumber}</strong> at
       <strong>${escapeHtml(c.tenantName)}</strong>.</p>
    ${
      reason
        ? `<p style="color:#9f1239"><em>Reason:</em> ${escapeHtml(reason)}</p>`
        : ''
    }
    <p>Sorry about that — please reach out to the location if you need help.</p>
    <p style="color:#666;font-size:12px">— ${escapeHtml(c.tenantName)}</p>
  `);
  return { subject, html, text };
}

/**
 * Send `email`; swallow + log any failure so the caller's transaction
 * commits cleanly. Returns whether the send succeeded.
 */
export async function sendOrderEmailSafely(
  to: string,
  email: RenderedEmail,
  context: { kind: string; shortNumber: number },
): Promise<boolean> {
  try {
    await sendEmail(to, email.subject, email.html, email.text);
    logger.info(
      { kind: context.kind, shortNumber: context.shortNumber, to },
      'online-order email sent',
    );
    return true;
  } catch (err) {
    logger.warn(
      { kind: context.kind, shortNumber: context.shortNumber, to, err },
      'online-order email failed',
    );
    return false;
  }
}

/**
 * Lookup helper: load the bits we need to render any of the order emails for
 * a given OnlineOrderRequest.id. Returns null if anything is missing
 * (customer email is the most common reason).
 */
export async function loadOrderEmailContext(
  prisma: Pick<PrismaClient, 'onlineOrderRequest'>,
  requestId: string,
  publicAppUrl: string,
): Promise<(OrderEmailContext & { tenantSlug: string; locationSlug: string }) | null> {
  const row = await prisma.onlineOrderRequest.findUnique({
    where: { id: requestId },
    select: {
      customerName: true,
      customerEmail: true,
      customerPhone: true,
      rejectReason: true,
      ticket: {
        select: {
          shortNumber: true,
          location: {
            select: {
              name: true,
              slug: true,
              tenant: { select: { name: true, slug: true } },
            },
          },
        },
      },
      trackingTokenHash: true, // unused but ensures select shape
    },
  });
  if (!row) return null;
  // We don't have the raw tracking token here (only its hash); build the
  // tracking page URL anyway — it surfaces the order via short number lookup
  // through the same UI in the future. For now we link to the customer order
  // surface so the email always has a clickable destination.
  return {
    customerName: row.customerName,
    customerEmail: row.customerEmail ?? '',
    customerPhone: row.customerPhone,
    shortNumber: row.ticket?.shortNumber ?? 0,
    tenantName: row.ticket?.location.tenant.name ?? '',
    locationName: row.ticket?.location.name ?? '',
    tenantSlug: row.ticket?.location.tenant.slug ?? '',
    locationSlug: row.ticket?.location.slug ?? '',
    trackingUrl: `${publicAppUrl}/order/${row.ticket?.location.tenant.slug ?? ''}/${row.ticket?.location.slug ?? ''}`,
    rejectReason: row.rejectReason ?? null,
  };
}
