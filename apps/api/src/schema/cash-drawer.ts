import type { Prisma } from '@repo/db';
import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { RequestContext } from '../context.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  AppError,
} from '../errors.js';
import { builder } from './builder.js';
import { CashMovementKindEnum } from './enums.js';

/**
 * Cash drawer + cash movement domain.
 *
 * Model:
 *   - A location has at most one OPEN session (closed_at IS NULL) at a time —
 *     enforced both server-side here and by a partial unique index in the
 *     DB.
 *   - Manual movements (PAY_IN / PAY_OUT / DEPOSIT) are recorded by staff
 *     during the shift. Cents are always stored positive; sign is implied
 *     by `kind`.
 *   - Close computes `expectedCashCents` from starting + cash sales + pay-ins
 *     - pay-outs - deposits, then stores the user-entered `countedCashCents`
 *     and the resulting `varianceCents` (counted − expected).
 *   - Manager+ can write off variances or override; staff can open/close their
 *     own shift. Audit log captures every transition.
 */

const MANUAL_MOVEMENT_KINDS = ['PAY_IN', 'PAY_OUT', 'DEPOSIT'] as const;
type ManualMovementKind = (typeof MANUAL_MOVEMENT_KINDS)[number];

const openCashDrawerSchema = z.object({
  startingCashCents: z.number().int().min(0).max(10_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

const recordCashMovementSchema = z.object({
  sessionId: z.string().uuid(),
  kind: z.enum(MANUAL_MOVEMENT_KINDS),
  amountCents: z.number().int().positive().max(10_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

const closeCashDrawerSchema = z.object({
  sessionId: z.string().uuid(),
  countedCashCents: z.number().int().min(0).max(10_000_000),
  note: z.string().trim().max(500).optional().nullable(),
});

/** Signed cents per movement kind, for the expected-cash calculation. */
function signedCents(kind: string, amountCents: number): number {
  switch (kind) {
    case 'PAY_IN':
    case 'SALE_CASH':
      return amountCents;
    case 'PAY_OUT':
    case 'DEPOSIT':
    case 'REFUND_CASH':
      return -amountCents;
    default:
      return 0;
  }
}

/** Pure helper used by closeCashDrawer + currentCashDrawer.expectedCashCents. */
export function computeExpectedCashCents(
  startingCashCents: number,
  movements: ReadonlyArray<{ kind: string; amountCents: number }>,
): number {
  return movements.reduce(
    (sum, m) => sum + signedCents(m.kind, m.amountCents),
    startingCashCents,
  );
}

function requireLocation(ctx: RequestContext): { tenantId: string; locationId: string } {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location)
    throw new ForbiddenError('A location context is required');
  return { tenantId: ctx.auth.tenant.id, locationId: ctx.auth.location.id };
}

// ── Object types ───────────────────────────────────────

builder.prismaObject('CashDrawerSession', {
  fields: (t) => ({
    id: t.exposeID('id'),
    openedAt: t.expose('openedAt', { type: 'DateTime' }),
    openedBy: t.relation('openedBy', { authScopes: { staff: true } }),
    startingCashCents: t.exposeInt('startingCashCents'),
    closedAt: t.expose('closedAt', { type: 'DateTime', nullable: true }),
    closedBy: t.relation('closedBy', { authScopes: { staff: true }, nullable: true }),
    expectedCashCents: t.exposeInt('expectedCashCents', { nullable: true }),
    countedCashCents: t.exposeInt('countedCashCents', { nullable: true }),
    varianceCents: t.exposeInt('varianceCents', { nullable: true }),
    note: t.exposeString('note', { nullable: true }),
    movements: t.relation('movements', {
      authScopes: { staff: true },
      query: { orderBy: { createdAt: 'asc' } },
    }),
  }),
});

builder.prismaObject('CashMovement', {
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({ type: CashMovementKindEnum, resolve: (p) => p.kind }),
    amountCents: t.exposeInt('amountCents'),
    note: t.exposeString('note', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    createdBy: t.relation('createdBy', { authScopes: { staff: true } }),
    ticket: t.relation('ticket', { authScopes: { staff: true }, nullable: true }),
  }),
});

// ── Queries ───────────────────────────────────────────

builder.queryField('currentCashDrawer', (t) =>
  t.prismaField({
    type: 'CashDrawerSession',
    nullable: true,
    description:
      "The currently-open cash drawer session at the viewer's location, or null if none.",
    authScopes: { staff: true },
    resolve: async (query, _root, _args, ctx) => {
      const { locationId } = requireLocation(ctx);
      return ctx.prisma.cashDrawerSession.findFirst({
        ...query,
        where: { locationId, closedAt: null },
      });
    },
  }),
);

builder.queryField('cashDrawerHistory', (t) =>
  t.prismaField({
    type: ['CashDrawerSession'],
    description:
      'Closed cash drawer sessions at the viewer location, most recent first. Limited to the last 50 to keep the page snappy.',
    authScopes: { staff: true },
    resolve: async (query, _root, _args, ctx) => {
      const { locationId } = requireLocation(ctx);
      return ctx.prisma.cashDrawerSession.findMany({
        ...query,
        where: { locationId, closedAt: { not: null } },
        orderBy: { openedAt: 'desc' },
        take: 50,
      });
    },
  }),
);

// ── Mutations ─────────────────────────────────────────

builder.mutationField('openCashDrawer', (t) =>
  t.prismaField({
    type: 'CashDrawerSession',
    description:
      'Open a new cash drawer session at the current location with the given starting cash. Fails if a session is already open.',
    authScopes: { staff: true },
    args: {
      startingCashCents: t.arg.int({ required: true }),
      note: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireLocation(ctx);
      const parsed = openCashDrawerSchema.safeParse({
        startingCashCents: args.startingCashCents,
        note: args.note ?? null,
      });
      if (!parsed.success) {
        throw new AppError('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
      }
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();

      // Server-side guard before relying on the partial unique index.
      const existing = await ctx.prisma.cashDrawerSession.findFirst({
        where: { locationId, closedAt: null },
        select: { id: true },
      });
      if (existing) {
        throw new ConflictError(
          'A cash drawer session is already open at this location.',
        );
      }

      const session = await ctx.prisma.cashDrawerSession.create({
        ...query,
        data: {
          tenantId,
          locationId,
          openedById: ctx.auth.user.id,
          startingCashCents: parsed.data.startingCashCents,
          note: parsed.data.note,
        },
      });
      await writeAudit(ctx, {
        action: 'open_cash_drawer',
        resourceType: 'CashDrawerSession',
        resourceId: session.id,
        metadata: { startingCashCents: parsed.data.startingCashCents },
      });
      return session;
    },
  }),
);

builder.mutationField('recordCashMovement', (t) =>
  t.prismaField({
    type: 'CashMovement',
    description:
      'Add a manual pay-in / pay-out / deposit to the active drawer session.',
    authScopes: { staff: true },
    args: {
      sessionId: t.arg({ type: 'UUID', required: true }),
      kind: t.arg({ type: CashMovementKindEnum, required: true }),
      amountCents: t.arg.int({ required: true }),
      note: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireLocation(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      if (!MANUAL_MOVEMENT_KINDS.includes(args.kind as ManualMovementKind)) {
        throw new ForbiddenError(
          'Only manual kinds (PAY_IN, PAY_OUT, DEPOSIT) can be recorded directly.',
        );
      }
      const parsed = recordCashMovementSchema.safeParse({
        sessionId: args.sessionId,
        kind: args.kind,
        amountCents: args.amountCents,
        note: args.note ?? null,
      });
      if (!parsed.success) {
        throw new AppError('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
      }
      // DEPOSIT can only be recorded by manager+. Pay-in / pay-out are open to
      // any staff for tip-out and supply-run flows.
      if (parsed.data.kind === 'DEPOSIT') {
        const role = ctx.auth.role;
        if (!(role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER')) {
          throw new ForbiddenError(
            'Only managers can record cash deposits to the safe.',
          );
        }
      }
      const session = await ctx.prisma.cashDrawerSession.findFirst({
        where: { id: parsed.data.sessionId, locationId },
        select: { id: true, closedAt: true },
      });
      if (!session) throw new NotFoundError('Cash drawer session not found.');
      if (session.closedAt !== null) {
        throw new ConflictError(
          'Cannot record movements on a closed drawer session.',
        );
      }

      const movement = await ctx.prisma.cashMovement.create({
        ...query,
        data: {
          sessionId: session.id,
          kind: parsed.data.kind,
          amountCents: parsed.data.amountCents,
          note: parsed.data.note,
          createdById: ctx.auth.user.id,
        },
      });
      await writeAudit(ctx, {
        action: 'record_cash_movement',
        resourceType: 'CashMovement',
        resourceId: movement.id,
        metadata: {
          sessionId: session.id,
          kind: parsed.data.kind,
          amountCents: parsed.data.amountCents,
        },
      });
      return movement;
    },
  }),
);

builder.mutationField('closeCashDrawer', (t) =>
  t.prismaField({
    type: 'CashDrawerSession',
    description:
      'Close an open drawer session with the counted cash total. Computes expected vs counted variance and stores it.',
    authScopes: { staff: true },
    args: {
      sessionId: t.arg({ type: 'UUID', required: true }),
      countedCashCents: t.arg.int({ required: true }),
      note: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireLocation(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const parsed = closeCashDrawerSchema.safeParse({
        sessionId: args.sessionId,
        countedCashCents: args.countedCashCents,
        note: args.note ?? null,
      });
      if (!parsed.success) {
        throw new AppError('BAD_INPUT', parsed.error.issues[0]?.message ?? 'Invalid input');
      }
      // Load session + all movements in one query so the math is consistent
      // with what closeCashDrawer commits.
      const session = await ctx.prisma.cashDrawerSession.findFirst({
        where: { id: parsed.data.sessionId, locationId },
        include: { movements: { select: { kind: true, amountCents: true } } },
      });
      if (!session) throw new NotFoundError('Cash drawer session not found.');
      if (session.closedAt !== null) {
        throw new ConflictError('Cash drawer session is already closed.');
      }
      const expected = computeExpectedCashCents(
        session.startingCashCents,
        session.movements,
      );
      const variance = parsed.data.countedCashCents - expected;
      const updated = await ctx.prisma.cashDrawerSession.update({
        ...query,
        where: { id: session.id },
        data: {
          closedAt: new Date(),
          closedById: ctx.auth.user.id,
          countedCashCents: parsed.data.countedCashCents,
          expectedCashCents: expected,
          varianceCents: variance,
          note: parsed.data.note ?? session.note ?? null,
        },
      });
      await writeAudit(ctx, {
        action: 'close_cash_drawer',
        resourceType: 'CashDrawerSession',
        resourceId: session.id,
        metadata: {
          expectedCashCents: expected,
          countedCashCents: parsed.data.countedCashCents,
          varianceCents: variance,
        },
      });
      return updated;
    },
  }),
);

// Force the module to be considered side-effect-only; index.ts imports for
// registration.
export const __cashDrawerSchema: Prisma.CashDrawerSessionWhereInput | undefined =
  undefined;
