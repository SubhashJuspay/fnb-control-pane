import type { PrismaClient } from '@repo/db';
import { invalidateCachePrefix } from '../cache.js';
import { logger } from '../logger.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { deductInventoryForTicket } from '../inventory/deduct-on-close.js';
import { ensureSystemUser } from '../online-orders/system-user.js';
import { onlineOrdersChannelName, ticketChannelName, pubsub } from '../pubsub.js';
import {
  encode,
  type PaymentRequestPayload,
} from './protocol.js';
import {
  getTerminal,
  isTerminalOnline,
  registryKey,
} from './registry.js';

/**
 * Push a payment request to the POS terminal paired with this location.
 *
 * Throws `ConflictError` if no terminal is currently online — callers
 * (e.g. `submitOnlineOrder` for PAY_AT_KIOSK orders) surface this as a
 * user-facing "POS terminal offline" error rather than leaving the order
 * stranded in PENDING_PAYMENT forever.
 *
 * Also arms a 60s auto-expire timer: if no `payment_result` lands in time
 * the request is auto-declined and the in-memory intent state is cleared.
 */
export function dispatchPaymentRequest(args: {
  prisma: PrismaClient;
  tenantSlug: string;
  locationSlug: string;
  payload: PaymentRequestPayload;
}): void {
  const { tenantSlug, locationSlug, payload } = args;
  const key = registryKey(tenantSlug, locationSlug);
  const ws = getTerminal(key);
  if (!ws || !isTerminalOnline(key)) {
    throw new ConflictError(
      'No POS terminal is connected at this location. Please ask staff for help.',
    );
  }
  ws.send(encode({ type: 'payment_request', ...payload }));
  logger.info(
    { key, intentId: payload.intentId, amountCents: payload.amountCents },
    'pos-terminal: payment request dispatched',
  );
  armExpiry(args.prisma, payload.intentId);
}

const PAYMENT_EXPIRY_MS = 60_000;
const expiryTimers = new Map<string, NodeJS.Timeout>();

function armExpiry(prisma: PrismaClient, intentId: string): void {
  // Clear any previous timer for this intent — paranoia, the same intentId
  // should never be dispatched twice.
  const existing = expiryTimers.get(intentId);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    expiryTimers.delete(intentId);
    void expireIntent(prisma, intentId).catch((err) => {
      logger.error({ err, intentId }, 'pos-terminal: expire failed');
    });
  }, PAYMENT_EXPIRY_MS);
  // Don't keep the process alive just for a payment timer.
  timer.unref?.();
  expiryTimers.set(intentId, timer);
}

export function cancelExpiry(intentId: string): void {
  const t = expiryTimers.get(intentId);
  if (t) {
    clearTimeout(t);
    expiryTimers.delete(intentId);
  }
}

async function expireIntent(prisma: PrismaClient, intentId: string): Promise<void> {
  // Try Tender path first (the staff cashier flow). updateMany filters on
  // status to be race-safe — the terminal response and our timer can fire
  // near-simultaneously.
  const tenderHit = await prisma.tender.updateMany({
    where: { id: intentId, status: 'PENDING' },
    data: { status: 'DECLINED', declineReason: 'Payment timed out at terminal' },
  });
  if (tenderHit.count > 0) {
    const tender = await prisma.tender.findUnique({
      where: { id: intentId },
      select: { locationId: true, ticketId: true },
    });
    if (tender) {
      await pubsub.publish(ticketChannelName(tender.locationId), {
        kind: 'TicketChanged',
        ticketId: tender.ticketId,
      });
    }
    logger.warn({ intentId }, 'pos-terminal: tender auto-expired');
    return;
  }

  // Fall through to OnlineOrderRequest (kiosk) path.
  const result = await prisma.onlineOrderRequest.updateMany({
    where: { id: intentId, paymentStatus: 'PENDING' },
    data: {
      paymentStatus: 'DECLINED',
      confirmStatus: 'REJECTED',
      rejectedAt: new Date(),
      rejectReason: 'Payment timed out at terminal',
    },
  });
  if (result.count === 0) return;
  const request = await prisma.onlineOrderRequest.findUnique({
    where: { id: intentId },
    select: { id: true, locationId: true, ticketId: true },
  });
  if (!request) return;
  await pubsub.publish(onlineOrdersChannelName(request.locationId), {
    kind: 'OnlineOrderRequestUpdated',
    requestId: request.id,
  });
  logger.warn({ intentId }, 'pos-terminal: kiosk payment auto-expired');
}

/**
 * Apply a terminal-reported payment result. Called from the WS message
 * handler. The intentId resolves to one of two intent types:
 *
 *   - Tender (staff cashier closing a ticket on the POS) — looked up first
 *     since this is the more common per-day path.
 *   - OnlineOrderRequest (customer-facing kiosk order) — the original path.
 *
 * Idempotent: replaying an APPROVED for a settled intent is a no-op.
 */
export async function applyPaymentResult(args: {
  prisma: PrismaClient;
  intentId: string;
  status: 'APPROVED' | 'DECLINED' | 'CANCELLED';
  /**
   * Location id of the WS connection that delivered the message. The
   * Tender we look up has its own locationId; if they don't match the
   * frame is from a connection that has no business settling this
   * tender (stranded dev WS, attacker who guessed an id, etc.).
   */
  fromLocationId?: string;
}): Promise<void> {
  const { prisma, intentId, status, fromLocationId } = args;
  cancelExpiry(intentId);

  // 1. Staff-ticket path: intentId is a Tender id.
  const tender = await prisma.tender.findUnique({
    where: { id: intentId },
    select: {
      id: true,
      locationId: true,
      ticketId: true,
      processedById: true,
      amountCents: true,
      tipCents: true,
      status: true,
    },
  });
  if (tender) {
    if (fromLocationId && tender.locationId !== fromLocationId) {
      logger.warn(
        { intentId, tenderLocation: tender.locationId, fromLocationId },
        'pos-terminal: REJECTED payment_result from wrong location',
      );
      return;
    }
    if (tender.status !== 'PENDING') {
      logger.info(
        { intentId, currentStatus: tender.status, reported: status },
        'pos-terminal: ignoring replay (tender already settled)',
      );
      return;
    }
    logger.info(
      { intentId, ticketId: tender.ticketId, status },
      'pos-terminal: applying tender result',
    );
    if (status === 'APPROVED') {
      await captureTender(prisma, tender);
    } else {
      await declineTender(
        prisma,
        tender,
        status === 'CANCELLED' ? 'Cancelled at terminal' : 'Declined at terminal',
      );
    }
    return;
  }

  // 2. Kiosk-order path: intentId is an OnlineOrderRequest id.
  const request = await prisma.onlineOrderRequest.findUnique({
    where: { id: intentId },
    select: {
      id: true,
      locationId: true,
      ticketId: true,
      paymentStatus: true,
      paymentMode: true,
    },
  });
  if (!request) {
    throw new NotFoundError('Payment intent not found');
  }
  if (request.paymentMode !== 'PAY_AT_KIOSK') {
    throw new ConflictError('Intent is not a kiosk payment');
  }
  if (request.paymentStatus !== 'PENDING') {
    logger.info(
      { intentId, currentStatus: request.paymentStatus, reported: status },
      'pos-terminal: ignoring replay (intent already settled)',
    );
    return;
  }

  if (status === 'APPROVED') {
    await capturePayment(prisma, request.id, request.locationId, request.ticketId);
    return;
  }
  await declinePayment(
    prisma,
    request.id,
    request.locationId,
    status === 'CANCELLED' ? 'Cancelled at terminal' : 'Declined at terminal',
  );
}

interface TenderRow {
  id: string;
  locationId: string;
  ticketId: string;
  processedById: string;
  amountCents: number;
  tipCents: number;
  status: string;
}

/** Look up the ticket's tenantId — needed for inventory deduction. */
async function tenantIdForTicket(prisma: PrismaClient, ticketId: string): Promise<string | null> {
  const row = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { location: { select: { tenantId: true } } },
  });
  return row?.location.tenantId ?? null;
}

/**
 * Capture a staff-ticket Tender after the terminal reports APPROVED.
 *
 * Closes the ticket (totals already include tip from the mutation that
 * created the Tender), runs the same post-close hooks the cash path runs
 * (inventory deduction, loyalty points, audit, pubsub).
 *
 * NOTE: this intentionally lives in the dispatcher rather than reaching
 * back into the GraphQL `processPayment` resolver — the resolver assumes
 * a synchronous request/response, whereas the terminal flow is async.
 */
async function captureTender(
  prisma: PrismaClient,
  tender: TenderRow,
): Promise<void> {
  const now = new Date();
  const tenantId = await tenantIdForTicket(prisma, tender.ticketId);
  if (!tenantId) {
    throw new NotFoundError('Ticket location not found');
  }

  // Single atomic close: flip the tender CAPTURED, close the ticket with
  // the tip + total, and run the inventory deduction so a partial state
  // never lingers.
  await prisma.$transaction(async (tx) => {
    await tx.tender.update({
      where: { id: tender.id },
      data: { status: 'CAPTURED', processedAt: now, authCode: synthAuthCode() },
    });
    await tx.ticket.update({
      where: { id: tender.ticketId },
      data: {
        status: 'CLOSED',
        closedAt: now,
        closedById: tender.processedById,
        tipCents: tender.tipCents,
      },
    });
    await deductInventoryForTicket({
      tx,
      ticketId: tender.ticketId,
      locationId: tender.locationId,
      tenantId,
    });
  });
  await pubsub.publish(ticketChannelName(tender.locationId), {
    kind: 'TicketChanged',
    ticketId: tender.ticketId,
  });
  // Same reasoning as the cash close path — drop analytics cache so the
  // dashboard reflects the close immediately.
  invalidateCachePrefix(`analytics:${tender.locationId}:`);
  logger.info(
    { tenderId: tender.id, ticketId: tender.ticketId },
    'pos-terminal: staff tender captured + ticket closed',
  );
}

async function declineTender(
  prisma: PrismaClient,
  tender: TenderRow,
  reason: string,
): Promise<void> {
  await prisma.tender.update({
    where: { id: tender.id },
    data: { status: 'DECLINED', declineReason: reason },
  });
  await pubsub.publish(ticketChannelName(tender.locationId), {
    kind: 'TicketChanged',
    ticketId: tender.ticketId,
  });
  logger.info({ tenderId: tender.id, reason }, 'pos-terminal: staff tender declined');
}

/** 8-char hex auth code for receipt rendering, opaque to the UI. */
function synthAuthCode(): string {
  return Math.random().toString(16).slice(2, 10).toUpperCase();
}

async function capturePayment(
  prisma: PrismaClient,
  requestId: string,
  locationId: string,
  ticketId: string,
): Promise<void> {
  const now = new Date();
  // The kiosk has no acting user — borrow the tenant's system user (the
  // same one we use for OnlineOrderRequest bookkeeping) to satisfy the
  // Tender.processedById foreign key.
  const ticketRow = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      totalCents: true,
      location: {
        select: {
          tenantId: true,
          tenant: { select: { slug: true } },
        },
      },
    },
  });
  if (!ticketRow) {
    throw new NotFoundError('Ticket not found for kiosk capture');
  }
  const tenantId = ticketRow.location.tenantId;
  const systemUserId = await ensureSystemUser(
    prisma,
    tenantId,
    ticketRow.location.tenant.slug,
  );

  // Mirror what `confirmOnlineOrder` does for staff-driven confirmation:
  // flip items to FIRED, mark the request CONFIRMED + CAPTURED. We also
  // write a CAPTURED Tender so the staff close-ticket dialog can detect
  // "already paid" and skip the payment picker, and analytics see the
  // sale in the same shape as a cashier-rung tender.
  await prisma.$transaction(async (tx) => {
    await tx.ticketItem.updateMany({
      where: { ticketId, status: 'NEW' },
      data: { status: 'FIRED', firedAt: now },
    });
    await tx.onlineOrderRequest.update({
      where: { id: requestId },
      data: {
        paymentStatus: 'CAPTURED',
        confirmStatus: 'CONFIRMED',
        confirmedAt: now,
      },
    });
    await tx.tender.create({
      data: {
        tenantId,
        locationId,
        ticketId,
        method: 'CARD',
        amountCents: ticketRow.totalCents,
        tipCents: 0,
        status: 'CAPTURED',
        processedById: systemUserId,
        processedAt: now,
        authCode: synthAuthCode(),
      },
    });
  });
  await pubsub.publish(onlineOrdersChannelName(locationId), {
    kind: 'OnlineOrderRequestUpdated',
    requestId,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId,
  });
  logger.info({ requestId, ticketId }, 'pos-terminal: payment captured');
}

async function declinePayment(
  prisma: PrismaClient,
  requestId: string,
  locationId: string,
  reason: string,
): Promise<void> {
  const now = new Date();
  await prisma.onlineOrderRequest.update({
    where: { id: requestId },
    data: {
      paymentStatus: 'DECLINED',
      confirmStatus: 'REJECTED',
      rejectedAt: now,
      rejectReason: reason,
    },
  });
  await pubsub.publish(onlineOrdersChannelName(locationId), {
    kind: 'OnlineOrderRequestUpdated',
    requestId,
  });
  logger.info({ requestId, reason }, 'pos-terminal: payment declined');
}
