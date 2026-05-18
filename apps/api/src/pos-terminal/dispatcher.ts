import type { PrismaClient } from '@repo/db';
import { logger } from '../logger.js';
import { ConflictError, NotFoundError } from '../errors.js';
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
  // Only auto-decline if the request is still PENDING — guards against
  // the race where the terminal's response and our timer fire near-simultaneously.
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
  logger.warn({ intentId }, 'pos-terminal: payment auto-expired');
}

/**
 * Apply a terminal-reported payment result. Called from the WS message
 * handler. Idempotent: replaying an APPROVED message for an already-CAPTURED
 * intent is a no-op (the updateMany clause filters on `paymentStatus`).
 */
export async function applyPaymentResult(args: {
  prisma: PrismaClient;
  intentId: string;
  status: 'APPROVED' | 'DECLINED' | 'CANCELLED';
}): Promise<void> {
  const { prisma, intentId, status } = args;
  cancelExpiry(intentId);
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
    // Idempotent replay — accept silently rather than 4xx the terminal.
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

async function capturePayment(
  prisma: PrismaClient,
  requestId: string,
  locationId: string,
  ticketId: string,
): Promise<void> {
  const now = new Date();
  // Mirror what `confirmOnlineOrder` does for staff-driven confirmation:
  // flip items to FIRED, mark the request CONFIRMED + CAPTURED. The kiosk
  // path has no acting user, so confirmedById/firedById stay null.
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
