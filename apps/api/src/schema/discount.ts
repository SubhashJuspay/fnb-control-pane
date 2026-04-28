import { builder } from './builder.js';
import { DiscountKindEnum } from './enums.js';
import { TicketItemRef, TicketRef } from './ticket.js';

export type DiscountRow = {
  id: string;
  locationId: string;
  ticketId: string | null;
  ticketItemId: string | null;
  kind: 'FLAT' | 'PERCENT';
  amountCents: number | null;
  percentBp: number | null;
  computedCents: number;
  reason: string;
  appliedById: string;
  appliedAt: Date;
  voidedById: string | null;
  voidedAt: Date | null;
  voidReason: string | null;
};

/** Tagged-union shape for the `Discount.scope` resolver — keeps it pure-testable. */
export type DiscountScopeShape =
  | { kind: 'ticket'; ticket: unknown }
  | { kind: 'line'; ticketItem: unknown };

/**
 * Pure resolver: derive the tagged-union scope object for a Discount row.
 * The caller is responsible for loading the relation via Prisma `include`.
 */
export function resolveDiscountScope(parent: {
  ticketId: string | null;
  ticketItemId: string | null;
  ticket?: unknown;
  ticketItem?: unknown;
}): DiscountScopeShape {
  if (parent.ticketId !== null) {
    return { kind: 'ticket', ticket: parent.ticket };
  }
  if (parent.ticketItemId !== null) {
    return { kind: 'line', ticketItem: parent.ticketItem };
  }
  // Schema invariant: discount has either ticketId or ticketItemId.
  throw new Error('Discount has neither ticketId nor ticketItemId');
}

const TicketScopeRef = builder.objectRef<{ kind: 'ticket'; ticket: unknown }>(
  'TicketScope',
);
TicketScopeRef.implement({
  description: 'Discount scope marker — discount applies to the entire ticket.',
  fields: (t) => ({
    ticket: t.field({
      type: TicketRef,
      resolve: (parent) => parent.ticket as never,
    }),
  }),
});

const LineScopeRef = builder.objectRef<{ kind: 'line'; ticketItem: unknown }>(
  'LineScope',
);
LineScopeRef.implement({
  description: 'Discount scope marker — discount applies to a single ticket line.',
  fields: (t) => ({
    ticketItem: t.field({
      type: TicketItemRef,
      resolve: (parent) => parent.ticketItem as never,
    }),
  }),
});

export const DiscountScopeUnion = builder.unionType('DiscountScope', {
  types: [TicketScopeRef, LineScopeRef],
  resolveType: (parent) => (parent.kind === 'ticket' ? 'TicketScope' : 'LineScope'),
});

export const DiscountRef = builder.prismaObject('Discount', {
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({
      type: DiscountKindEnum,
      resolve: (parent) => parent.kind,
    }),
    amountCents: t.exposeInt('amountCents', { nullable: true }),
    percentBp: t.exposeInt('percentBp', { nullable: true }),
    computedCents: t.exposeInt('computedCents'),
    reason: t.exposeString('reason'),
    appliedAt: t.expose('appliedAt', { type: 'DateTime' }),
    voidedAt: t.expose('voidedAt', { type: 'DateTime', nullable: true }),
    voidReason: t.exposeString('voidReason', { nullable: true }),
    appliedBy: t.relation('appliedBy', { authScopes: { manager: true } }),
    voidedBy: t.relation('voidedBy', {
      authScopes: { manager: true },
      nullable: true,
    }),
    scope: t.field({
      type: DiscountScopeUnion,
      authScopes: { staff: true },
      resolve: async (parent, _args, ctx) => {
        const row = parent as DiscountRow;
        if (row.ticketId !== null) {
          const ticket = await ctx.prisma.ticket.findUnique({ where: { id: row.ticketId } });
          return resolveDiscountScope({
            ticketId: row.ticketId,
            ticketItemId: row.ticketItemId,
            ticket,
          });
        }
        const ticketItem = row.ticketItemId
          ? await ctx.prisma.ticketItem.findUnique({ where: { id: row.ticketItemId } })
          : null;
        return resolveDiscountScope({
          ticketId: row.ticketId,
          ticketItemId: row.ticketItemId,
          ticketItem,
        });
      },
    }),
  }),
});
