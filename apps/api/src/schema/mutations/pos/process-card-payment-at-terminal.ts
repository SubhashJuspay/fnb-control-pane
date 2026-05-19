import type { PrismaClient } from '@repo/db';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { AppError, ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { dispatchPaymentRequest } from '../../../pos-terminal/dispatcher.js';
import { builder } from '../../builder.js';

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

const schema = z.object({
  ticketId: z.string().uuid(),
  /** Tip portion, in cents. 0 if the customer didn't tip. */
  tipCents: z.number().int().min(0).max(100_000_000).default(0),
  /**
   * CLOSE_TICKET (default) → on capture the dispatcher closes the
   * ticket. PREPAY_TICKET → on capture the dispatcher fires items
   * but leaves the ticket OPEN ("charge & fire" counter-service flow).
   */
  intent: z.enum(['CLOSE_TICKET', 'PREPAY_TICKET']).default('CLOSE_TICKET'),
});

/**
 * Single-tender card payment routed via a paired POS terminal.
 *
 * Synchronous part:
 *   1. Verifies the ticket is OPEN at the cashier's location.
 *   2. Creates a Tender(PENDING, method=CARD) tied to the ticket. The
 *      Tender is the durable "intent" — its id is the WS intentId.
 *   3. Dispatches a payment_request frame over the POS-terminal WS.
 *   4. Hard fails (ConflictError) if no terminal is online — the
 *      cashier must pair a terminal before accepting card payments.
 *
 * Async part (in the WS message handler):
 *   - APPROVED → captureTender(): Tender → CAPTURED, Ticket → CLOSED,
 *     inventory deducted, ticket pubsub fires so the POS UI refreshes.
 *   - DECLINED/CANCELLED → declineTender(): Tender → DECLINED, ticket
 *     stays OPEN so the cashier can retry / pick a different tender.
 *   - 60s auto-expire → declineTender with "timed out at terminal".
 */
const ProcessCardPaymentAtTerminalInput = builder.inputType(
  'ProcessCardPaymentAtTerminalInput',
  {
    fields: (t) => ({
      ticketId: t.field({ type: 'UUID', required: true }),
      tipCents: t.int({ required: false }),
      /**
       * Intent for the captured tender. Defaults to CLOSE_TICKET — the
       * historical behaviour where the dispatcher closes the ticket.
       * Pass PREPAY_TICKET for the counter-service "charge & fire"
       * flow: items fire to the kitchen on capture, ticket stays OPEN.
       */
      intent: t.string({ required: false }),
    }),
  },
);

interface ResultData {
  tenderId: string;
  amountCents: number;
  tipCents: number;
  currency: string;
}

const ProcessCardPaymentAtTerminalResultRef = builder.objectRef<ResultData>(
  'ProcessCardPaymentAtTerminalResult',
);
ProcessCardPaymentAtTerminalResultRef.implement({
  description:
    "Intent for a card payment dispatched to the location's paired POS terminal. The client polls `tender(id)` until it transitions out of PENDING.",
  fields: (t) => ({
    tenderId: t.exposeString('tenderId'),
    amountCents: t.exposeInt('amountCents'),
    tipCents: t.exposeInt('tipCents'),
    currency: t.exposeString('currency'),
  }),
});

export async function resolveProcessCardPaymentAtTerminal(
  ctx: RequestContext,
  input: { ticketId: string; tipCents?: number | null; intent?: string | null },
): Promise<ResultData> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can process payments');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const parsed = schema.safeParse({
    ticketId: input.ticketId,
    tipCents: input.tipCents ?? 0,
    intent: input.intent ?? 'CLOSE_TICKET',
  });
  if (!parsed.success) {
    throw new AppError('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
  }
  const { ticketId, tipCents, intent } = parsed.data;

  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: ticketId, locationId, status: 'OPEN' },
    select: {
      id: true,
      shortNumber: true,
      totalCents: true,
      customerLabel: true,
      location: {
        select: {
          id: true,
          tenantId: true,
          currency: true,
          slug: true,
          tenant: { select: { slug: true } },
          tables: { select: { label: true }, take: 0 }, // not needed; tableId joined below
        },
      },
      table: { select: { label: true } },
      items: {
        where: { status: { not: 'VOIDED' } },
        select: {
          quantity: true,
          nameSnapshot: true,
          lineSubtotalCents: true,
          modifiers: { select: { nameSnapshot: true } },
        },
      },
    },
  });
  if (!ticket) {
    throw new NotFoundError('Open ticket not found at this location.');
  }
  if (ticket.items.length === 0) {
    throw new AppError('BAD_INPUT', 'Cannot process payment on an empty ticket.');
  }

  const amountCents = ticket.totalCents;
  const currency = ticket.location.currency ?? 'USD';

  // Create the PENDING tender BEFORE dispatching so the WS callback always
  // has a row to look up — even if the terminal responds in milliseconds.
  // `intent` is the discriminator the WS dispatcher reads on capture to
  // decide between close-the-ticket (default) and fire-and-leave-open
  // (counter-service "Charge & fire").
  const tender = await ctx.prisma.tender.create({
    data: {
      tenantId: ticket.location.tenantId,
      locationId,
      ticketId: ticket.id,
      method: 'CARD',
      amountCents,
      tipCents,
      status: 'PENDING',
      intent,
      processedById: userId,
    },
    select: { id: true },
  });

  // Dispatch — throws ConflictError if no terminal is online. We catch and
  // mark the tender VOIDED so it doesn't leak as a stranded PENDING row.
  try {
    dispatchPaymentRequest({
      prisma: ctx.prisma as PrismaClient,
      tenantSlug: ticket.location.tenant.slug,
      locationSlug: ticket.location.slug,
      payload: {
        intentId: tender.id,
        kind: 'staff_ticket',
        amountCents: amountCents + tipCents,
        currency,
        shortNumber: ticket.shortNumber,
        customerName: ticket.customerLabel ?? `Order #${ticket.shortNumber}`,
        tableLabel: ticket.table?.label ?? null,
        items: ticket.items.map((it) => ({
          name: it.nameSnapshot,
          qty: it.quantity,
          lineTotalCents: it.lineSubtotalCents,
          modifiers: it.modifiers.map((m) => m.nameSnapshot),
        })),
      },
    });
  } catch (err) {
    // Roll back the PENDING tender so the cashier sees a clean slate.
    await ctx.prisma.tender.update({
      where: { id: tender.id },
      data: { status: 'VOIDED', declineReason: 'POS terminal offline' },
    });
    throw err;
  }

  await writeAudit(ctx, {
    action: 'tender.dispatched_to_terminal',
    resourceType: 'tender',
    resourceId: tender.id,
    metadata: { ticketId: ticket.id, amountCents, tipCents, method: 'CARD' },
  });

  return {
    tenderId: tender.id,
    amountCents,
    tipCents,
    currency,
  };
}

builder.mutationField('processCardPaymentAtTerminal', (t) =>
  t.field({
    type: ProcessCardPaymentAtTerminalResultRef,
    authScopes: { staff: true },
    description:
      'Create a PENDING card tender for the ticket and dispatch it to the paired POS terminal. The terminal returns APPROVED/DECLINED via WS which captures or declines the tender (and closes the ticket on capture). Hard fails when no terminal is online.',
    args: { input: t.arg({ type: ProcessCardPaymentAtTerminalInput, required: true }) },
    resolve: (_root, args, ctx) =>
      resolveProcessCardPaymentAtTerminal(ctx, args.input as { ticketId: string; tipCents?: number | null; intent?: string | null }),
  }),
);
