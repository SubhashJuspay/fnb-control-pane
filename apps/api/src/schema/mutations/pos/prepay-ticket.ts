import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import { invalidateCachePrefix } from '../../../cache.js';
import type { RequestContext } from '../../../context.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../../../errors.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { TenderMethodEnum } from '../../enums.js';

/**
 * Counter-service "pay first, then fire" flow.
 *
 * Mirrors `processPayment` (same tender simulation, same validations) but
 * leaves the ticket OPEN and instead transitions any NEW items to FIRED
 * so the kitchen starts preparing immediately. Used at QSR / coffee /
 * counter-pickup spots where the cashier rings the order, charges the
 * customer at the register, and only after that does the food go out.
 *
 * After this lands the ticket has CAPTURED tenders covering the total +
 * fired items. The cashier (or whoever serves the food) eventually closes
 * the ticket via the simplified "already paid" path on the close dialog,
 * which just transitions status → CLOSED with no second charge.
 *
 * Differences vs processPayment, in one place so future readers don't
 * have to diff the files:
 *   - The ticket's status stays OPEN. closedAt / closedById are not set.
 *   - NEW items flip to FIRED with firedAt = now. FIRED / READY / SERVED
 *     lines are untouched (those were already handled the manual way).
 *   - Inventory deduction is deferred to close-ticket so we don't double-
 *     decrement when the cashier finally closes the (now-paid) tab.
 */

const SIM_DECLINE_RATE_DEFAULT = 0;
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

const prepayTicketSchema = z.object({
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
  void method;
  return {
    approved: true,
    cardBrand: brand,
    cardLast4: last4,
    authCode,
    declineReason: null,
  };
}

// Local input refs — separate from ProcessPaymentInput so any future
// divergence (e.g. tip rules, partial payments) doesn't ripple back into
// the close flow.
const PrepayTenderInput = builder.inputType('PrepayTenderInput', {
  fields: (t) => ({
    method: t.field({ type: TenderMethodEnum, required: true }),
    amountCents: t.int({ required: true }),
    tipCents: t.int({ required: false }),
    tenderedCents: t.int({ required: false }),
  }),
});

const PrepayTicketInput = builder.inputType('PrepayTicketInput', {
  fields: (t) => ({
    ticketId: t.field({ type: 'UUID', required: true }),
    tenders: t.field({ type: [PrepayTenderInput], required: true }),
    closeNote: t.string({ required: false }),
  }),
});

builder.mutationField('prepayTicket', (t) =>
  t.prismaField({
    type: 'Ticket',
    description:
      "Capture payment for an OPEN ticket and fire its NEW items to the kitchen without closing the ticket. Used at counter-service spots where the cashier charges before the food is made. The ticket stays OPEN; close it later via closeTicket once the order is served.",
    authScopes: { staff: true },
    args: { input: t.arg({ type: PrepayTicketInput, required: true }) },
    resolve: async (query, _root, args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      if (!ctx.auth.location) {
        throw new ForbiddenError('A location context is required');
      }
      const tenantId = ctx.auth.tenant.id;
      const locationId = ctx.auth.location.id;
      const userId = ctx.auth.user.id;
      const input = args.input;

      const parsed = prepayTicketSchema.safeParse({
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

      const ticket = await ctx.prisma.ticket.findFirst({
        where: { id: parsed.data.ticketId, locationId, status: 'OPEN' },
        select: { id: true, totalCents: true, tipCents: true },
      });
      if (!ticket) {
        throw new NotFoundError('Open ticket not found at this location.');
      }

      // Cash tenders must include enough handed-over to cover amount + tip.
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

      // Sum of tender amounts must equal the ticket total (tips are
      // captured separately so they don't need to land on totalCents).
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

      // Simulator auth for CARD / MOBILE. CASH + GIFT capture
      // immediately — same shape as processPayment.
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

      const openSession = await ctx.prisma.cashDrawerSession.findFirst({
        where: { locationId, closedAt: null },
        select: { id: true },
      });

      const totalTipCents = parsed.data.tenders.reduce(
        (s, x) => s + x.tipCents,
        0,
      );

      const now = new Date();
      const out = await ctx.prisma.$transaction(async (tx) => {
        for (const a of authed) {
          const tendered =
            a.input.method === 'CASH' ? (a.input.tenderedCents ?? 0) : null;
          const change =
            a.input.method === 'CASH'
              ? Math.max(0, (tendered ?? 0) - a.input.amountCents - a.input.tipCents)
              : null;
          const cashSessionId =
            a.input.method === 'CASH' && openSession ? openSession.id : null;

          await tx.tender.create({
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
              processedAt: now,
            },
          });

          if (cashSessionId) {
            await tx.cashMovement.create({
              data: {
                sessionId: cashSessionId,
                kind: 'SALE_CASH',
                amountCents: a.input.amountCents + a.input.tipCents,
                ticketId: ticket.id,
                createdById: userId,
                note: 'Prepay cash tender from POS',
              },
            });
          }
        }

        // Fire all NEW items so the kitchen starts working. Mirrors what
        // `confirmOnlineOrder` / `capturePayment` do on the kiosk path.
        await tx.ticketItem.updateMany({
          where: { ticketId: ticket.id, status: 'NEW' },
          data: { status: 'FIRED', firedById: userId, firedAt: now },
        });

        // Stash the tip on the ticket so it shows up in totals before
        // close. closeTicket will re-stamp tipCents on close, but in
        // the meantime the cashier wants to see the captured tip.
        const updated = await tx.ticket.update({
          ...query,
          where: { id: ticket.id },
          data: {
            tipCents: totalTipCents,
            // Persist the close note now so it doesn't get lost if the
            // person who closes the ticket later is a different staff
            // member. Empty input clears any prior note.
            closeNote: parsed.data.closeNote ?? null,
          },
        });

        return updated;
      });

      await writeAudit(ctx, {
        action: 'prepay_ticket',
        resourceType: 'Ticket',
        resourceId: ticket.id,
        metadata: {
          tenderCount: parsed.data.tenders.length,
          totalCents: ticket.totalCents,
          tipCents: totalTipCents,
          methods: parsed.data.tenders.map((x) => x.method),
        },
      });
      await pubsub.publish(ticketChannelName(locationId), {
        kind: 'TicketChanged',
        ticketId: ticket.id,
      });
      // Analytics caches are keyed by closedAt-range; firing items
      // doesn't change closed-ticket aggregates yet, but the dashboard
      // does surface "open tickets" + kitchen queue counts that this
      // mutation moves around, so invalidate to keep "right now" fresh.
      invalidateCachePrefix(`analytics:${locationId}:`);
      return out as never;
    },
  }),
);
