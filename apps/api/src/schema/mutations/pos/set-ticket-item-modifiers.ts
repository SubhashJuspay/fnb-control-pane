import { setTicketItemModifiersSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveModifierPrice } from '../../../menu/pricing.js';
import { computeLineSubtotalCents } from '../../../order/pricing.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { SetTicketItemModifiersInput } from './inputs.js';
import {
  findModifierGroupViolations,
  recomputeTicketTotalsLive,
} from './recompute-totals.js';

export interface SetTicketItemModifiersArgs {
  ticketItemId: string;
  modifierIds: string[];
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveSetTicketItemModifiers(
  query: object,
  input: SetTicketItemModifiersArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can edit ticket-item modifiers');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  const item = await ctx.prisma.ticketItem.findUnique({
    where: { id: input.ticketItemId },
    select: {
      id: true,
      status: true,
      ticketId: true,
      menuItemId: true,
      unitPriceCents: true,
      quantity: true,
      ticket: { select: { locationId: true, status: true } },
    },
  });
  if (!item) throw new NotFoundError('Ticket item not found');
  if (item.ticket.locationId !== locationId) {
    throw new ForbiddenError('Ticket item not found at this location');
  }
  if (item.ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to edit modifiers');
  }
  if (item.status !== 'NEW') {
    throw new ConflictError('Only NEW items can have modifiers edited');
  }

  const modifierSnapshots: Array<{
    modifierId: string;
    nameSnapshot: string;
    priceDeltaCents: number;
    modifierGroupName: string;
    modifierGroupId: string;
  }> = [];

  if (input.modifierIds.length > 0) {
    const modifiers = (await ctx.prisma.modifier.findMany({
      where: {
        id: { in: input.modifierIds },
        archivedAt: null,
        modifierGroup: {
          tenantId,
          itemAttachments: { some: { menuItemId: item.menuItemId } },
        },
      },
      select: {
        id: true,
        name: true,
        priceDeltaCents: true,
        modifierGroupId: true,
        modifierGroup: { select: { id: true, name: true } },
      },
    })) as Array<{
      id: string;
      name: string;
      priceDeltaCents: number;
      modifierGroupId: string;
      modifierGroup: { id: string; name: string };
    }>;
    if (modifiers.length !== input.modifierIds.length) {
      throw new NotFoundError(
        'One or more modifiers are unknown or not attached to this menu item',
      );
    }
    const locationModifiers = (await ctx.prisma.locationModifier.findMany({
      where: { locationId, modifierId: { in: modifiers.map((m) => m.id) } },
      select: { modifierId: true, priceDeltaOverrideCents: true },
    })) as Array<{ modifierId: string; priceDeltaOverrideCents: number | null }>;
    const overrideByModId = new Map(
      locationModifiers.map((l) => [l.modifierId, l.priceDeltaOverrideCents]),
    );
    for (const id of input.modifierIds) {
      const m = modifiers.find((x) => x.id === id);
      if (!m) continue;
      const effectiveDelta = resolveModifierPrice({
        basePriceDeltaCents: m.priceDeltaCents,
        locationOverride: overrideByModId.has(m.id)
          ? { priceDeltaOverrideCents: overrideByModId.get(m.id) ?? null }
          : null,
      });
      modifierSnapshots.push({
        modifierId: m.id,
        nameSnapshot: m.name,
        priceDeltaCents: effectiveDelta,
        modifierGroupName: m.modifierGroup.name,
        modifierGroupId: m.modifierGroupId,
      });
    }
  }

  const attachedGroups = (await ctx.prisma.menuItemModifierGroup.findMany({
    where: { menuItemId: item.menuItemId },
    select: {
      modifierGroup: {
        select: { id: true, name: true, minSelections: true, maxSelections: true },
      },
    },
  })) as Array<{
    modifierGroup: { id: string; name: string; minSelections: number; maxSelections: number };
  }>;
  const selectedByGroupId = new Map<string, number>();
  for (const m of modifierSnapshots) {
    selectedByGroupId.set(
      m.modifierGroupId,
      (selectedByGroupId.get(m.modifierGroupId) ?? 0) + 1,
    );
  }
  const violations = findModifierGroupViolations({
    attachedGroups: attachedGroups.map((a) => a.modifierGroup),
    selectedByGroupId,
  });
  if (violations.length > 0) {
    throw new ConflictError(
      `Modifier-group selection rules violated: ${violations.join(', ')}`,
    );
  }

  const { modifiersTotalCents, lineSubtotalCents } = computeLineSubtotalCents({
    unitPriceCents: item.unitPriceCents,
    quantity: item.quantity,
    modifiers: modifierSnapshots,
  });

  const updated = (await ctx.prisma.$transaction(async (tx) => {
    await tx.ticketItemModifier.deleteMany({ where: { ticketItemId: item.id } });
    if (modifierSnapshots.length > 0) {
      await tx.ticketItemModifier.createMany({
        data: modifierSnapshots.map((m) => ({
          ticketItemId: item.id,
          modifierId: m.modifierId,
          nameSnapshot: m.nameSnapshot,
          priceDeltaCents: m.priceDeltaCents,
          modifierGroupName: m.modifierGroupName,
        })),
      });
    }
    return tx.ticketItem.update({
      ...query,
      where: { id: item.id },
      data: { modifiersTotalCents, lineSubtotalCents },
    });
  })) as { id: string };

  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId: item.ticketId });
  await writeAudit(ctx, {
    action: 'ticket_item.modifiers_set',
    resourceType: 'ticket_item',
    resourceId: updated.id,
    metadata: {
      ticketId: item.ticketId,
      modifierIds: input.modifierIds,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketItemChanged',
    ticketId: item.ticketId,
    ticketItemId: updated.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: item.ticketId,
  });
  return updated;
}

builder.mutationField('setTicketItemModifiers', (t) =>
  t.prismaField({
    type: 'TicketItem',
    authScopes: { staff: true },
    args: { input: t.arg({ type: SetTicketItemModifiersInput, required: true }) },
    validate: { schema: z.object({ input: setTicketItemModifiersSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveSetTicketItemModifiers(
        query,
        args.input as SetTicketItemModifiersArgs,
        ctx,
      ) as never,
  }),
);
