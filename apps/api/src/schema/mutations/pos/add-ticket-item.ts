import { addTicketItemSchema } from '@repo/validation/ticket';
import { z } from 'zod';
import { writeAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../errors.js';
import { resolveItemPrice, resolveModifierPrice } from '../../../menu/pricing.js';
import { computeLineSubtotalCents } from '../../../order/pricing.js';
import { pubsub, ticketChannelName } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { AddTicketItemInput } from './inputs.js';
import {
  findModifierGroupViolations,
  recomputeTicketTotalsLive,
} from './recompute-totals.js';

export interface AddTicketItemArgs {
  ticketId: string;
  menuItemId: string;
  quantity?: number | null;
  modifiers?: Array<{ modifierId: string }> | null;
  notes?: string | null;
}

const STAFF_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER', 'STAFF'];

export async function resolveAddTicketItem(
  query: object,
  input: AddTicketItemArgs,
  ctx: RequestContext,
): Promise<unknown> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!STAFF_ROLES.includes(ctx.auth.role)) {
    throw new ForbiddenError('Only STAFF or above can add ticket items');
  }
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const locationId = ctx.auth.location.id;
  const tenantId = ctx.auth.tenant.id;

  const ticket = await ctx.prisma.ticket.findFirst({
    where: { id: input.ticketId, locationId },
    select: { id: true, status: true },
  });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.status !== 'OPEN') {
    throw new ConflictError('Ticket must be OPEN to add items');
  }

  const menuItem = await ctx.prisma.menuItem.findFirst({
    where: { id: input.menuItemId, tenantId, archivedAt: null },
    select: {
      id: true,
      name: true,
      basePriceCents: true,
      course: true,
    },
  });
  if (!menuItem) throw new NotFoundError('Menu item not found or archived');

  const locationItem = await ctx.prisma.locationItem.findUnique({
    where: { locationId_menuItemId: { locationId, menuItemId: menuItem.id } },
    select: { priceCents: true },
  });
  const unitPriceCents = resolveItemPrice({
    basePriceCents: menuItem.basePriceCents,
    locationOverride: locationItem ? { priceCents: locationItem.priceCents } : null,
    sectionOverride: null,
  });

  const modifierInputs = input.modifiers ?? [];
  const quantity = input.quantity ?? 1;

  // Load every selected Modifier + verify it's attached to this MenuItem via a
  // ModifierGroup. Snapshot name + price-delta + group name.
  const modifierSnapshots: Array<{
    modifierId: string;
    nameSnapshot: string;
    priceDeltaCents: number;
    modifierGroupName: string;
    modifierGroupId: string;
  }> = [];

  if (modifierInputs.length > 0) {
    const modifiers = (await ctx.prisma.modifier.findMany({
      where: {
        id: { in: modifierInputs.map((m) => m.modifierId) },
        archivedAt: null,
        modifierGroup: {
          tenantId,
          itemAttachments: { some: { menuItemId: menuItem.id } },
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
    if (modifiers.length !== modifierInputs.length) {
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
    for (const inputMod of modifierInputs) {
      const m = modifiers.find((x) => x.id === inputMod.modifierId);
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

  // Validate group min/max selections — fetch attached groups and count.
  const attachedGroups = (await ctx.prisma.menuItemModifierGroup.findMany({
    where: { menuItemId: menuItem.id },
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
    unitPriceCents,
    quantity,
    modifiers: modifierSnapshots,
  });

  const created = (await ctx.prisma.ticketItem.create({
    ...query,
    data: {
      ticketId: ticket.id,
      menuItemId: menuItem.id,
      status: 'NEW',
      nameSnapshot: menuItem.name,
      unitPriceCents,
      quantity,
      modifiersTotalCents,
      lineSubtotalCents,
      notes: input.notes ?? null,
      course: menuItem.course,
      modifiers: {
        create: modifierSnapshots.map((m) => ({
          modifierId: m.modifierId,
          nameSnapshot: m.nameSnapshot,
          priceDeltaCents: m.priceDeltaCents,
          modifierGroupName: m.modifierGroupName,
        })),
      },
    },
  })) as { id: string };

  await recomputeTicketTotalsLive({ prisma: ctx.prisma, ticketId: ticket.id });
  await writeAudit(ctx, {
    action: 'ticket_item.added',
    resourceType: 'ticket_item',
    resourceId: created.id,
    metadata: {
      ticketId: ticket.id,
      menuItemId: menuItem.id,
      quantity,
      lineSubtotalCents,
    },
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketItemChanged',
    ticketId: ticket.id,
    ticketItemId: created.id,
  });
  await pubsub.publish(ticketChannelName(locationId), {
    kind: 'TicketChanged',
    ticketId: ticket.id,
  });
  return created;
}

builder.mutationField('addTicketItem', (t) =>
  t.prismaField({
    type: 'TicketItem',
    authScopes: { staff: true },
    args: { input: t.arg({ type: AddTicketItemInput, required: true }) },
    validate: { schema: z.object({ input: addTicketItemSchema }) },
    resolve: (query, _root, args, ctx) =>
      resolveAddTicketItem(query, args.input as AddTicketItemArgs, ctx) as never,
  }),
);
