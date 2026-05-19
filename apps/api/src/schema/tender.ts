import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { RequestContext } from '../context.js';
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../errors.js';
import { deductInventoryForTicket } from '../inventory/deduct-on-close.js';
import { builder } from './builder.js';
import { TenderMethodEnum, TenderStatusEnum } from './enums.js';

/**
 * Payment simulation domain.
 *
 * Each Ticket can have one or many Tenders (split-tender). Sum of
 * `amountCents + tipCents` across active tenders for a ticket must equal the
 * ticket's grand total (subtotal − discount + tax + tip).
 *
 * `processPayment` is the entry point. It:
 *   1. Validates tender amounts add up.
 *   2. For CARD / MOBILE: runs a fake 800–1800ms authorize delay and rolls a
 *      configurable decline probability (`SIM_DECLINE_RATE`, default 0).
 *      Successful auth attaches a simulated brand + last-4 + auth code.
 *   3. For CASH: requires `tenderedCents ≥ amount + tip` and computes change.
 *      If a CashDrawerSession is open at the location, the tender is linked
 *      to it AND a corresponding SALE_CASH movement is written so the
 *      drawer's expected-cash math reflects the sale.
 *   4. If every tender CAPTURED, the ticket is closed (with combined tip).
 *      If any DECLINED, no tender is persisted and the ticket stays open —
 *      the cashier retries.
 */

const SIM_DECLINE_RATE_DEFAULT = 0; // override at run-time via SIM_DECLINE_RATE
const SIM_MIN_DELAY_MS = 800;
const SIM_MAX_DELAY_MS = 1800;

const CARD_BRANDS = ['visa', 'mastercard', 'amex', 'discover'] as const;
type CardBrand = (typeof CARD_BRANDS)[number];

const tenderInputSchema = z.object({
  method: z.enum(['CASH', 'CARD', 'MOBILE', 'GIFT']),
  amountCents: z.number().int().min(0).max(100_000_000),
  tipCents: z.number().int().min(0).max(100_000_000).default(0),
  tenderedCents: z.number().int().min(0).max(100_000_000).optional().nullable(),
});

const processPaymentSchema = z.object({
  ticketId: z.string().uuid(),
  tenders: z.array(tenderInputSchema).min(1).max(8),
  closeNote: z.string().trim().max(500).optional().nullable(),
});

interface SimulatedAuthResult {
  approved: boolean;
  cardBrand: CardBrand | null;
  cardLast4: string | null;
  authCode: string | null;
  declineReason: string | null;
}

function simulatedDeclineRate(): number {
  const raw = process.env.SIM_DECLINE_RATE;
  if (!raw) return SIM_DECLINE_RATE_DEFAULT;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : SIM_DECLINE_RATE_DEFAULT;
}

async function simulateAuth(method: 'CARD' | 'MOBILE'): Promise<SimulatedAuthResult> {
  const delayMs =
    SIM_MIN_DELAY_MS + Math.random() * (SIM_MAX_DELAY_MS - SIM_MIN_DELAY_MS);
  await new Promise((resolve) => setTimeout(resolve, delayMs));
  const declined = Math.random() < simulatedDeclineRate();
  if (declined) {
    return {
      approved: false,
      cardBrand: null,
      cardLast4: null,
      authCode: null,
      declineReason: 'CARD_DECLINED_BY_ISSUER',
    };
  }
  const brand = CARD_BRANDS[Math.floor(Math.random() * CARD_BRANDS.length)] ?? 'visa';
  const last4 = String(Math.floor(1000 + Math.random() * 9000));
  const authCode = Math.random().toString(36).slice(2, 8).toUpperCase();
  // `method` only affects which brand string we'd surface in a real impl —
  // for the simulator we just stamp a fake card brand for both card + mobile.
  void method;
  return {
    approved: true,
    cardBrand: brand,
    cardLast4: last4,
    authCode,
    declineReason: null,
  };
}

function requireStaffLocation(ctx: RequestContext): {
  tenantId: string;
  locationId: string;
} {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location)
    throw new ForbiddenError('A location context is required');
  return { tenantId: ctx.auth.tenant.id, locationId: ctx.auth.location.id };
}

// ── Object type ───────────────────────────────────────

builder.prismaObject('Tender', {
  fields: (t) => ({
    id: t.exposeID('id'),
    method: t.field({ type: TenderMethodEnum, resolve: (p) => p.method }),
    status: t.field({ type: TenderStatusEnum, resolve: (p) => p.status }),
    amountCents: t.exposeInt('amountCents'),
    tipCents: t.exposeInt('tipCents'),
    tenderedCents: t.exposeInt('tenderedCents', { nullable: true }),
    changeCents: t.exposeInt('changeCents', { nullable: true }),
    cardBrand: t.exposeString('cardBrand', { nullable: true }),
    cardLast4: t.exposeString('cardLast4', { nullable: true }),
    authCode: t.exposeString('authCode', { nullable: true }),
    declineReason: t.exposeString('declineReason', { nullable: true }),
    processedAt: t.expose('processedAt', { type: 'DateTime' }),
    processedBy: t.relation('processedBy', { authScopes: { staff: true } }),
    ticket: t.relation('ticket', { authScopes: { staff: true } }),
  }),
});

// ── Inputs ────────────────────────────────────────────

const TenderInput = builder.inputType('TenderInput', {
  fields: (t) => ({
    method: t.field({ type: TenderMethodEnum, required: true }),
    amountCents: t.int({ required: true }),
    tipCents: t.int({ required: false }),
    /** Cash only: what the customer handed over. Required when method=CASH. */
    tenderedCents: t.int({ required: false }),
  }),
});

const ProcessPaymentInput = builder.inputType('ProcessPaymentInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    tenders: t.field({ type: [TenderInput], required: true }),
    closeNote: t.string({ required: false }),
  }),
});

// ── Query: tenders for a ticket ───────────────────────

builder.queryField('ticketTenders', (t) =>
  t.prismaField({
    type: ['Tender'],
    description: 'All tenders captured against a ticket. Staff scope.',
    authScopes: { staff: true },
    args: { ticketId: t.arg({ type: 'UUID', required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireStaffLocation(ctx);
      return ctx.prisma.tender.findMany({
        ...query,
        where: { ticketId: args.ticketId, locationId },
        orderBy: { processedAt: 'asc' },
      });
    },
  }),
);

// Single tender by id — used by the close-ticket dialog to poll the status
// of a PENDING terminal payment.
builder.queryField('tender', (t) =>
  t.prismaField({
    type: 'Tender',
    nullable: true,
    description: "Single tender by id, scoped to the viewer's location.",
    authScopes: { staff: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireStaffLocation(ctx);
      return ctx.prisma.tender.findFirst({
        ...query,
        where: { id: args.id as string, locationId },
      });
    },
  }),
);

// ── Mutation: processPayment ──────────────────────────

builder.mutationField('processPayment', (t) =>
  t.prismaField({
    type: 'Ticket',
    description:
      "Run all tenders for a ticket through the (simulated) payment terminal. On full capture, the ticket is closed and a cash sale is recorded against the open drawer session. On any decline, nothing is persisted and the ticket stays open.",
    authScopes: { staff: true },
    args: { input: t.arg({ type: ProcessPaymentInput, required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireStaffLocation(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const input = args.input;

      const parsed = processPaymentSchema.safeParse({
        ticketId: input.ticketId,
        tenders: input.tenders.map((tender) => ({
          method: tender.method,
          amountCents: tender.amountCents,
          tipCents: tender.tipCents ?? 0,
          tenderedCents: tender.tenderedCents ?? null,
        })),
        closeNote: input.closeNote ?? null,
      });
      if (!parsed.success) {
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );
      }

      // Load ticket; it must be OPEN at the viewer's location.
      const ticket = await ctx.prisma.ticket.findFirst({
        where: { id: parsed.data.ticketId, locationId, status: 'OPEN' },
        include: {
          items: { select: { status: true, lineSubtotalCents: true } },
        },
      });
      if (!ticket)
        throw new NotFoundError('Open ticket not found at this location.');

      // Cash tenders must include a tenderedCents ≥ amount + tip.
      for (const t of parsed.data.tenders) {
        if (t.method === 'CASH') {
          const tendered = t.tenderedCents ?? 0;
          if (tendered < t.amountCents + t.tipCents) {
            throw new AppError(
              'BAD_INPUT',
              'Cash tendered must cover the amount plus tip.',
            );
          }
        }
      }

      // Sum of tender amounts must equal the ticket's total. Tips are
      // captured separately so we don't require them to be on the total.
      const tenderAmountSum = parsed.data.tenders.reduce(
        (s, x) => s + x.amountCents,
        0,
      );
      if (tenderAmountSum !== ticket.totalCents) {
        throw new AppError(
          'BAD_INPUT',
          `Sum of tender amounts (${tenderAmountSum}) must equal the ticket total (${ticket.totalCents}).`,
        );
      }

      // For each tender, run the appropriate simulation. Card auths run
      // serially — terminals don't multiplex tenders. If any declines we
      // abort the whole transaction.
      const authed: Array<
        Omit<SimulatedAuthResult, 'approved'> & {
          input: typeof parsed.data.tenders[number];
          finalStatus: 'CAPTURED' | 'DECLINED';
        }
      > = [];
      for (const tInput of parsed.data.tenders) {
        if (tInput.method === 'CARD' || tInput.method === 'MOBILE') {
          const r = await simulateAuth(tInput.method);
          if (!r.approved) {
            throw new AppError(
              'PAYMENT_DECLINED',
              r.declineReason ?? 'Card declined.',
            );
          }
          authed.push({
            input: tInput,
            cardBrand: r.cardBrand,
            cardLast4: r.cardLast4,
            authCode: r.authCode,
            declineReason: null,
            finalStatus: 'CAPTURED',
          });
        } else {
          // CASH / GIFT capture immediately.
          authed.push({
            input: tInput,
            cardBrand: null,
            cardLast4: null,
            authCode: null,
            declineReason: null,
            finalStatus: 'CAPTURED',
          });
        }
      }

      // Resolve the open cash drawer session, if any, before the
      // transaction. We need it for both the cashSessionId link on the
      // tender and the SALE_CASH movement.
      const openSession = await ctx.prisma.cashDrawerSession.findFirst({
        where: { locationId, closedAt: null },
        select: { id: true },
      });

      const totalTipCents = parsed.data.tenders.reduce(
        (s, x) => s + x.tipCents,
        0,
      );

      // All approved — write tenders + close ticket + cash movements atomically.
      const userId = ctx.auth.user.id;
      const out = await ctx.prisma.$transaction(async (tx) => {
        const createdTenders = [];
        for (const a of authed) {
          const tendered =
            a.input.method === 'CASH' ? (a.input.tenderedCents ?? 0) : null;
          const change =
            a.input.method === 'CASH'
              ? Math.max(0, (tendered ?? 0) - a.input.amountCents - a.input.tipCents)
              : null;
          const cashSessionId =
            a.input.method === 'CASH' && openSession ? openSession.id : null;

          const created = await tx.tender.create({
            data: {
              tenantId,
              locationId,
              ticketId: ticket.id,
              method: a.input.method,
              amountCents: a.input.amountCents,
              tipCents: a.input.tipCents,
              tenderedCents: tendered,
              changeCents: change,
              cardBrand: a.cardBrand,
              cardLast4: a.cardLast4,
              authCode: a.authCode,
              status: a.finalStatus,
              cashSessionId,
              processedById: userId,
            },
          });
          createdTenders.push(created);

          // For cash tenders, write a SALE_CASH movement equal to the
          // amount that landed in the drawer (= amount + tip, NOT tendered).
          // The change handed back is a separate cash-out flow, but cash
          // drawers don't track it as a movement — it's just netted out of
          // the next tendered amount.
          if (cashSessionId) {
            await tx.cashMovement.create({
              data: {
                sessionId: cashSessionId,
                kind: 'SALE_CASH',
                amountCents: a.input.amountCents + a.input.tipCents,
                ticketId: ticket.id,
                createdById: userId,
                note: 'Cash tender from POS',
              },
            });
          }
        }

        // Close the ticket. Combined tip is the sum across tenders.
        const closed = await tx.ticket.update({
          ...query,
          where: { id: ticket.id },
          data: {
            status: 'CLOSED',
            closedAt: new Date(),
            closedById: userId,
            tipCents: totalTipCents,
            closeNote: parsed.data.closeNote ?? null,
          },
        });

        // Auto-deduct inventory for any line item whose menuItem has a
        // recipe defined. Same transaction so a failure rolls back tenders,
        // ticket close, AND inventory side-effects together.
        await deductInventoryForTicket({
          tx,
          ticketId: ticket.id,
          locationId,
          tenantId,
        });

        return { closed, tenders: createdTenders };
      });

      await writeAudit(ctx, {
        action: 'process_payment',
        resourceType: 'Ticket',
        resourceId: ticket.id,
        metadata: {
          tenderCount: out.tenders.length,
          totalCents: ticket.totalCents,
          tipCents: totalTipCents,
          methods: parsed.data.tenders.map((x) => x.method),
        },
      });
      return out.closed;
    },
  }),
);

// ── Mutation: refundTender ────────────────────────────

builder.mutationField('refundTender', (t) =>
  t.prismaField({
    type: 'Tender',
    description:
      'Refund a previously-captured tender. Creates a sibling Tender row with negative-flow semantics and writes a REFUND_CASH movement when applicable. Manager+ only.',
    authScopes: { manager: true },
    args: {
      tenderId: t.arg({ type: 'UUID', required: true }),
      amountCents: t.arg.int({ required: true }),
      reason: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireStaffLocation(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const original = await ctx.prisma.tender.findFirst({
        where: { id: args.tenderId, locationId, status: 'CAPTURED' },
      });
      if (!original)
        throw new NotFoundError('Captured tender not found.');
      if (args.amountCents <= 0 || args.amountCents > original.amountCents)
        throw new AppError(
          'BAD_INPUT',
          `Refund amount must be 1..${original.amountCents}.`,
        );

      const openSession = original.method === 'CASH'
        ? await ctx.prisma.cashDrawerSession.findFirst({
            where: { locationId, closedAt: null },
            select: { id: true },
          })
        : null;

      const userId = ctx.auth.user.id;
      const refund = await ctx.prisma.$transaction(async (tx) => {
        const r = await tx.tender.create({
          ...query,
          data: {
            tenantId,
            locationId,
            ticketId: original.ticketId,
            method: original.method,
            amountCents: -args.amountCents, // negative = money out
            tipCents: 0,
            status: 'CAPTURED',
            cardBrand: original.cardBrand,
            cardLast4: original.cardLast4,
            authCode: original.authCode,
            cashSessionId: openSession?.id ?? null,
            refundsTenderId: original.id,
            declineReason: args.reason ?? null,
            processedById: userId,
          },
        });
        // Mark the original as REFUNDED only when fully refunded.
        if (args.amountCents === original.amountCents) {
          await tx.tender.update({
            where: { id: original.id },
            data: { status: 'REFUNDED' },
          });
        }
        if (openSession?.id) {
          await tx.cashMovement.create({
            data: {
              sessionId: openSession.id,
              kind: 'REFUND_CASH',
              amountCents: args.amountCents,
              ticketId: original.ticketId,
              createdById: userId,
              note: args.reason ?? 'Cash refund',
            },
          });
        }
        return r;
      });

      await writeAudit(ctx, {
        action: 'refund_tender',
        resourceType: 'Tender',
        resourceId: original.id,
        metadata: {
          refundTenderId: refund.id,
          amountCents: args.amountCents,
          method: original.method,
        },
      });
      return refund;
    },
  }),
);

// Force module load; index.ts imports for registration side-effects.
void ConflictError;
