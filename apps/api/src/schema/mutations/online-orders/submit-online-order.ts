import type { PrismaClient } from '@repo/db';
import { computeOpenStatus, parseOpeningHours } from '@repo/types';
import { submitOnlineOrderSchema } from '@repo/validation/online-order';
import { z } from 'zod';
import { writeAnonymousAudit } from '../../../audit.js';
import {
  renderOrderReceived,
  sendOrderEmailSafely,
} from '../../../email/online-order.js';
import { env } from '../../../env.js';
import { sendSmsSafely } from '../../../sms/client.js';
import { smsOrderReceived } from '../../../sms/online-order.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, NotFoundError } from '../../../errors.js';
import { resolveItemPrice, resolveModifierPrice } from '../../../menu/pricing.js';
import { estimateReadyAt } from '../../../online-orders/estimate.js';
import { TokenBucket } from '../../../online-orders/rate-limit.js';
import { ensureSystemUser } from '../../../online-orders/system-user.js';
import { generateTrackingToken } from '../../../online-orders/tracking-token.js';
import { computeLineSubtotalCents, computeTicketTotalsCents } from '../../../order/pricing.js';
import { computeBusinessDay, nextShortNumber } from '../../../order/short-number.js';
import { dispatchPaymentRequest } from '../../../pos-terminal/dispatcher.js';
import {
  floorChannelName,
  onlineOrdersChannelName,
  pubsub as defaultPubsub,
  ticketChannelName,
} from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { findModifierGroupViolations } from '../pos/recompute-totals.js';
import { SubmitOnlineOrderInput } from './inputs.js';

// Module-level rate limiter — 10 submits/min per IP key.
export const submitRateLimiter = new TokenBucket({
  capacity: 10,
  refillPerSec: 0.166,
});

export interface SubmitOnlineOrderArgs {
  tenantSlug: string;
  locationSlug: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  pickupKind: 'ASAP' | 'SCHEDULED';
  pickupAt?: Date | null;
  notes?: string | null;
  items: Array<{
    menuItemId: string;
    quantity: number;
    modifiers?: string[] | null;
    notes?: string | null;
  }>;
  ipAddress?: string | null;
  /**
   * Set when the customer scanned a QR sticker on a table. Switches the
   * order to dine-in: ticket gets `tableId`, items are fired immediately,
   * and the request is auto-CONFIRMED so it skips the staff inbox.
   */
  tableSlug?: string | null;
  /**
   * PAY_AT_KIOSK: the request stays PENDING with paymentStatus PENDING
   * until a connected POS terminal returns a payment_result over WS. Items
   * do NOT fire until the payment is CAPTURED. The dispatch happens
   * synchronously inside the resolver — if no terminal is online we throw
   * a ConflictError so the kiosk can tell the customer to call staff.
   *
   * PAY_AT_PICKUP (default): historical behavior — request lands in the
   * staff inbox, items fire after staff confirm, or auto-confirm for the
   * QR-at-table dine-in path.
   */
  paymentMode?: 'PAY_AT_PICKUP' | 'PAY_AT_KIOSK' | null;
}

export interface SubmitOnlineOrderResultData {
  trackingToken: string;
  trackingUrl: string;
  shortNumber: number;
  estimatedReadyAt: Date;
}

const SubmitOnlineOrderResultRef = builder.objectRef<SubmitOnlineOrderResultData>(
  'SubmitOnlineOrderResult',
);
SubmitOnlineOrderResultRef.implement({
  fields: (t) => ({
    trackingToken: t.exposeString('trackingToken'),
    trackingUrl: t.exposeString('trackingUrl'),
    shortNumber: t.exposeInt('shortNumber'),
    estimatedReadyAt: t.expose('estimatedReadyAt', { type: 'DateTime' }),
  }),
});

/** Normalize a phone number for guest matching: strip spaces, parens, dashes. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s()\-]/g, '').toLowerCase();
}

export interface SubmitOnlineOrderDeps {
  rateLimiter: TokenBucket;
  pubsub: Pick<typeof defaultPubsub, 'publish'>;
  now: () => Date;
}

export const defaultSubmitDeps: SubmitOnlineOrderDeps = {
  rateLimiter: submitRateLimiter,
  pubsub: defaultPubsub,
  now: () => new Date(),
};

export async function resolveSubmitOnlineOrder(
  input: SubmitOnlineOrderArgs,
  ctx: RequestContext,
  deps: SubmitOnlineOrderDeps = defaultSubmitDeps,
): Promise<SubmitOnlineOrderResultData> {
  // 1. Rate limit per IP.
  const ipKey = input.ipAddress ?? 'anon';
  if (!deps.rateLimiter.consume(ipKey)) {
    throw new ConflictError('Too many submissions, please try again shortly');
  }

  // 2. Resolve tenant + location.
  const tenant = await ctx.prisma.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true, slug: true, name: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') {
    throw new NotFoundError('Tenant not found');
  }
  const location = await ctx.prisma.location.findFirst({
    where: { tenantId: tenant.id, slug: input.locationSlug, status: 'ACTIVE' },
    select: {
      id: true,
      name: true,
      timezone: true,
      businessDayCutoff: true,
      openingHours: true,
    },
  });
  if (!location) throw new NotFoundError('Location not found');

  // PAY_AT_KIOSK changes the order's lifecycle: the request stays PENDING
  // until a connected POS terminal responds with a payment_result. Items
  // do NOT fire on submit even for dine-in. The current QR-at-table auto-
  // confirm path is bypassed in this mode.
  const isKioskPayment = input.paymentMode === 'PAY_AT_KIOSK';

  // Resolve the table when a QR-at-table flag is present. We do this before
  // the closed-hours gate so a customer sitting at a table never sees a
  // "closed for online orders" message when they're physically in the dining
  // room — dine-in is independent of online-pickup hours.
  let tableRow: { id: string; label: string } | null = null;
  if (input.tableSlug) {
    const tbl = (await ctx.prisma.table.findFirst({
      where: { locationId: location.id, slug: input.tableSlug, archivedAt: null },
      select: { id: true, label: true },
    })) as { id: string; label: string } | null;
    if (!tbl) throw new NotFoundError('Table not found');
    const occupied = await ctx.prisma.ticket.findFirst({
      where: { tableId: tbl.id, status: 'OPEN' },
      select: { id: true },
    });
    if (occupied) {
      throw new ConflictError(
        'This table already has an open order. Please ask a server for help.',
      );
    }
    tableRow = tbl;
  }

  // Reject when the location is closed — but only for pickup. Dine-in QR
  // scans bypass the closed-hours check (see above).
  if (!tableRow) {
    const hours = parseOpeningHours(location.openingHours);
    if (hours) {
      const status = computeOpenStatus(hours, location.timezone, deps.now());
      if (!status.isOpen) {
        throw new ConflictError('This location is currently closed for online orders');
      }
    }
  }

  // 3. Pickup-time resolution.
  const now = deps.now();
  const pickupAt =
    input.pickupKind === 'ASAP'
      ? new Date(now.getTime() + 15 * 60_000)
      : (input.pickupAt as Date);
  if (!pickupAt) {
    throw new ConflictError('pickupAt is required for SCHEDULED pickups');
  }

  // 4. Load + validate items.
  const itemIds = input.items.map((i) => i.menuItemId);
  const menuItems = (await ctx.prisma.menuItem.findMany({
    where: { id: { in: itemIds }, tenantId: tenant.id },
    select: {
      id: true,
      name: true,
      basePriceCents: true,
      course: true,
      archivedAt: true,
    },
  })) as Array<{
    id: string;
    name: string;
    basePriceCents: number;
    course: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'SIDE' | 'BEVERAGE' | 'OTHER';
    archivedAt: Date | null;
  }>;
  const menuById = new Map(menuItems.map((mi) => [mi.id, mi]));
  for (const it of input.items) {
    const mi = menuById.get(it.menuItemId);
    if (!mi) throw new NotFoundError(`Menu item ${it.menuItemId} not found`);
    if (mi.archivedAt !== null) {
      throw new ConflictError(`Menu item "${mi.name}" is archived`);
    }
  }

  const locItems = (await ctx.prisma.locationItem.findMany({
    where: { locationId: location.id, menuItemId: { in: itemIds } },
    select: {
      menuItemId: true,
      hidden: true,
      available: true,
      priceCents: true,
    },
  })) as Array<{
    menuItemId: string;
    hidden: boolean;
    available: boolean;
    priceCents: number | null;
  }>;
  const locItemBy = new Map(locItems.map((li) => [li.menuItemId, li]));
  for (const it of input.items) {
    const li = locItemBy.get(it.menuItemId);
    if (li?.hidden || (li && !li.available)) {
      const mi = menuById.get(it.menuItemId);
      throw new ConflictError(`Menu item "${mi?.name ?? it.menuItemId}" is unavailable`);
    }
  }

  // Modifier checks: load all modifiers across all items in one go.
  const allModIds = Array.from(
    new Set(input.items.flatMap((it) => it.modifiers ?? [])),
  );
  let modById = new Map<
    string,
    {
      id: string;
      name: string;
      priceDeltaCents: number;
      modifierGroupId: string;
      modifierGroup: { id: string; name: string };
    }
  >();
  let locModBy = new Map<string, number | null>();
  if (allModIds.length > 0) {
    const mods = (await ctx.prisma.modifier.findMany({
      where: {
        id: { in: allModIds },
        archivedAt: null,
        modifierGroup: { tenantId: tenant.id },
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
    modById = new Map(mods.map((m) => [m.id, m]));
    const locMods = (await ctx.prisma.locationModifier.findMany({
      where: { locationId: location.id, modifierId: { in: allModIds } },
      select: { modifierId: true, priceDeltaOverrideCents: true },
    })) as Array<{ modifierId: string; priceDeltaOverrideCents: number | null }>;
    locModBy = new Map(
      locMods.map((lm) => [lm.modifierId, lm.priceDeltaOverrideCents]),
    );
  }

  // Per-item modifier-group attachment + min/max validation.
  const attachments = (await ctx.prisma.menuItemModifierGroup.findMany({
    where: { menuItemId: { in: itemIds } },
    select: {
      menuItemId: true,
      modifierGroup: {
        select: { id: true, name: true, minSelections: true, maxSelections: true },
      },
    },
  })) as Array<{
    menuItemId: string;
    modifierGroup: { id: string; name: string; minSelections: number; maxSelections: number };
  }>;
  const attachmentsByItem = new Map<
    string,
    Array<{ id: string; name: string; minSelections: number; maxSelections: number }>
  >();
  for (const a of attachments) {
    const arr = attachmentsByItem.get(a.menuItemId) ?? [];
    arr.push(a.modifierGroup);
    attachmentsByItem.set(a.menuItemId, arr);
  }

  // Snapshot per input item: unit price, modifier rows, line subtotal.
  interface PreparedItem {
    menuItemId: string;
    nameSnapshot: string;
    unitPriceCents: number;
    quantity: number;
    modifiersTotalCents: number;
    lineSubtotalCents: number;
    notes: string | null;
    course: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'SIDE' | 'BEVERAGE' | 'OTHER';
    modifiers: Array<{
      modifierId: string;
      nameSnapshot: string;
      priceDeltaCents: number;
      modifierGroupName: string;
    }>;
  }
  const prepared: PreparedItem[] = [];
  for (const it of input.items) {
    const mi = menuById.get(it.menuItemId)!;
    const li = locItemBy.get(it.menuItemId);
    const unitPriceCents = resolveItemPrice({
      basePriceCents: mi.basePriceCents,
      locationOverride: li ? { priceCents: li.priceCents } : null,
      sectionOverride: null,
    });
    const itemMods = it.modifiers ?? [];
    const validatedMods: Array<{
      modifierId: string;
      nameSnapshot: string;
      priceDeltaCents: number;
      modifierGroupName: string;
      modifierGroupId: string;
    }> = [];
    const selectedByGroupId = new Map<string, number>();
    for (const mid of itemMods) {
      const mod = modById.get(mid);
      if (!mod) {
        throw new NotFoundError(`Modifier ${mid} not found or not allowed`);
      }
      // Verify attached to this item via attachment lookup.
      const attached = attachmentsByItem.get(it.menuItemId) ?? [];
      if (!attached.some((g) => g.id === mod.modifierGroupId)) {
        throw new ConflictError(
          `Modifier "${mod.name}" not attached to item "${mi.name}"`,
        );
      }
      const delta = resolveModifierPrice({
        basePriceDeltaCents: mod.priceDeltaCents,
        locationOverride: locModBy.has(mod.id)
          ? { priceDeltaOverrideCents: locModBy.get(mod.id) ?? null }
          : null,
      });
      validatedMods.push({
        modifierId: mod.id,
        nameSnapshot: mod.name,
        priceDeltaCents: delta,
        modifierGroupName: mod.modifierGroup.name,
        modifierGroupId: mod.modifierGroupId,
      });
      selectedByGroupId.set(
        mod.modifierGroupId,
        (selectedByGroupId.get(mod.modifierGroupId) ?? 0) + 1,
      );
    }
    const violations = findModifierGroupViolations({
      attachedGroups: attachmentsByItem.get(it.menuItemId) ?? [],
      selectedByGroupId,
    });
    if (violations.length > 0) {
      throw new ConflictError(
        `Modifier-group selection rules violated: ${violations.join(', ')}`,
      );
    }
    const { modifiersTotalCents, lineSubtotalCents } = computeLineSubtotalCents({
      unitPriceCents,
      quantity: it.quantity,
      modifiers: validatedMods,
    });
    prepared.push({
      menuItemId: mi.id,
      nameSnapshot: mi.name,
      unitPriceCents,
      quantity: it.quantity,
      modifiersTotalCents,
      lineSubtotalCents,
      notes: it.notes ?? null,
      course: mi.course,
      modifiers: validatedMods.map((m) => ({
        modifierId: m.modifierId,
        nameSnapshot: m.nameSnapshot,
        priceDeltaCents: m.priceDeltaCents,
        modifierGroupName: m.modifierGroupName,
      })),
    });
  }

  // 5. Find/create Guest by phone.
  const phoneNorm = normalizePhone(input.customerPhone);
  const allGuests = (await ctx.prisma.guest.findMany({
    where: { tenantId: tenant.id, archivedAt: null },
    select: { id: true, phone: true },
  })) as Array<{ id: string; phone: string | null }>;
  let guestId: string | null = null;
  for (const g of allGuests) {
    if (g.phone && normalizePhone(g.phone) === phoneNorm) {
      guestId = g.id;
      break;
    }
  }
  if (!guestId) {
    const created = (await ctx.prisma.guest.create({
      data: {
        tenantId: tenant.id,
        name: input.customerName,
        phone: input.customerPhone,
        email: input.customerEmail ?? null,
      },
      select: { id: true },
    })) as { id: string };
    guestId = created.id;
  }

  // 6. Ensure system user.
  const systemUserId = await ensureSystemUser(
    ctx.prisma as PrismaClient,
    tenant.id,
    tenant.slug,
  );

  // 7. Compute totals.
  const totals = computeTicketTotalsCents({
    items: prepared.map((p) => ({
      lineSubtotalCents: p.lineSubtotalCents,
      lineDiscountCents: 0,
      status: 'NEW' as const,
    })),
    ticketDiscountCents: 0,
    taxRatePermille: 0,
  });

  // 8. Create Ticket + items + OnlineOrderRequest in a transaction with retry.
  const businessDay = computeBusinessDay({
    at: now,
    businessDayCutoff: location.businessDayCutoff,
    timezone: location.timezone,
  });
  const { token, tokenHash } = generateTrackingToken();

  let ticketId: string | null = null;
  let shortNumber = 0;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const sn = await nextShortNumber({
      prisma: ctx.prisma as PrismaClient,
      locationId: location.id,
      businessDay,
    });
    try {
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Re-check table occupancy inside the transaction — between the
        // pre-check and now, a server may have opened a ticket at this
        // table. This is the authoritative gate.
        if (tableRow) {
          const inTxOccupied = await tx.ticket.findFirst({
            where: { tableId: tableRow.id, status: 'OPEN' },
            select: { id: true },
          });
          if (inTxOccupied) {
            throw new ConflictError(
              'This table already has an open order. Please ask a server for help.',
            );
          }
        }
        // Dine-in QR scans auto-fire to the kitchen — but only when the
        // customer is paying at handoff. PAY_AT_KIOSK still waits for the
        // POS terminal regardless of dine-in vs takeout.
        const autoFireAndConfirm = Boolean(tableRow) && !isKioskPayment;
        const ticket = (await tx.ticket.create({
          data: {
            locationId: location.id,
            shortNumber: sn,
            businessDay,
            customerLabel: input.customerName,
            orderType: tableRow ? 'DINE_IN' : 'TAKEOUT',
            // Dine-in QR scans are physically in-restaurant — the order
            // does not flow through the staff online-inbox, so tag it
            // IN_PERSON to match how a server-rung ticket looks.
            originChannel: tableRow ? 'IN_PERSON' : 'ONLINE',
            status: 'OPEN',
            openedById: systemUserId,
            guestId,
            tableId: tableRow?.id ?? null,
            subtotalCents: totals.subtotalCents,
            discountCents: totals.discountCents,
            taxCents: totals.taxCents,
            totalCents: totals.totalCents,
          },
          select: { id: true },
        })) as { id: string };
        for (const p of prepared) {
          await tx.ticketItem.create({
            data: {
              ticketId: ticket.id,
              menuItemId: p.menuItemId,
              status: autoFireAndConfirm ? 'FIRED' : 'NEW',
              firedById: autoFireAndConfirm ? systemUserId : null,
              firedAt: autoFireAndConfirm ? now : null,
              nameSnapshot: p.nameSnapshot,
              unitPriceCents: p.unitPriceCents,
              quantity: p.quantity,
              modifiersTotalCents: p.modifiersTotalCents,
              lineSubtotalCents: p.lineSubtotalCents,
              notes: p.notes,
              course: p.course,
              modifiers: { create: p.modifiers },
            },
          });
        }
        const requestRow = (await tx.onlineOrderRequest.create({
          data: {
            ticketId: ticket.id,
            locationId: location.id,
            customerName: input.customerName,
            customerPhone: input.customerPhone,
            customerEmail: input.customerEmail ?? null,
            pickupAt,
            pickupKind: input.pickupKind,
            notes: input.notes ?? null,
            confirmStatus: autoFireAndConfirm ? 'CONFIRMED' : 'PENDING',
            confirmedAt: autoFireAndConfirm ? now : null,
            confirmedById: autoFireAndConfirm ? systemUserId : null,
            paymentMode: isKioskPayment ? 'PAY_AT_KIOSK' : 'PAY_AT_PICKUP',
            paymentStatus: isKioskPayment ? 'PENDING' : null,
            trackingTokenHash: tokenHash,
            submittedFromIp: input.ipAddress ?? null,
          },
          select: { id: true },
        })) as { id: string };
        return { ticketId: ticket.id, requestId: requestRow.id, shortNumber: sn };
      });
      ticketId = result.ticketId;
      shortNumber = result.shortNumber;
      // 9. Audit (anonymous).
      await writeAnonymousAudit(ctx, {
        tenantId: tenant.id,
        locationId: location.id,
        actorUserId: systemUserId,
        action: isKioskPayment
          ? 'online_order.submitted_kiosk'
          : tableRow
            ? 'online_order.submitted_dine_in'
            : 'online_order.submitted',
        resourceType: 'online_order_request',
        resourceId: result.requestId,
        metadata: {
          ticketId: result.ticketId,
          itemCount: prepared.length,
          pickupKind: input.pickupKind,
          tableId: tableRow?.id ?? null,
          tableLabel: tableRow?.label ?? null,
          paymentMode: isKioskPayment ? 'PAY_AT_KIOSK' : 'PAY_AT_PICKUP',
          autoConfirmed: Boolean(tableRow) && !isKioskPayment,
        },
      });
      // 10. Publish. Dine-in goes straight to the kitchen (unless kiosk
      // payment is gating it), so wake up the ticket + floor channels.
      await deps.pubsub.publish(onlineOrdersChannelName(location.id), {
        kind: 'OnlineOrderRequestCreated',
        requestId: result.requestId,
      });
      if (tableRow && !isKioskPayment) {
        await deps.pubsub.publish(ticketChannelName(location.id), {
          kind: 'TicketChanged',
          ticketId: result.ticketId,
        });
        await deps.pubsub.publish(floorChannelName(location.id), {
          kind: 'TableChanged',
          tableId: tableRow.id,
        });
      }

      // PAY_AT_KIOSK: push the payment intent to the connected POS terminal.
      // dispatchPaymentRequest throws ConflictError when no terminal is
      // online — bubbles up unchanged so the kiosk shows "POS terminal
      // offline" and the order request is left in PENDING/PENDING.
      if (isKioskPayment) {
        dispatchPaymentRequest({
          prisma: ctx.prisma as PrismaClient,
          tenantSlug: input.tenantSlug,
          locationSlug: input.locationSlug,
          payload: {
            intentId: result.requestId,
            kind: 'kiosk_order',
            amountCents: totals.totalCents,
            currency: 'USD',
            shortNumber: result.shortNumber,
            customerName: input.customerName,
            tableLabel: tableRow?.label ?? null,
            items: prepared.map((p) => ({
              name: p.nameSnapshot,
              qty: p.quantity,
              lineTotalCents: p.lineSubtotalCents,
              modifiers: p.modifiers.map((m) => m.nameSnapshot),
            })),
          },
        });
      }
      break;
    } catch (err) {
      lastErr = err;
      const code = (err as { code?: string }).code;
      if (code !== 'P2002') break;
    }
  }
  if (!ticketId) {
    throw new ConflictError(
      `Failed to allocate a unique ticket number after retries: ${String(lastErr)}`,
    );
  }

  // Fire-and-forget customer notifications. Both helpers swallow any failure
  // so the submit mutation never fails because email/SMS infra is down.
  // Kiosk-paid orders skip both — the customer is standing right there.
  const trackingUrl = `${env.AUTH_URL}/order/${input.tenantSlug}/${input.locationSlug}/track/${token}`;
  if (!isKioskPayment) {
    if (input.customerEmail) {
      void sendOrderEmailSafely(
        input.customerEmail,
        renderOrderReceived({
          customerName: input.customerName,
          customerEmail: input.customerEmail,
          customerPhone: input.customerPhone,
          shortNumber,
          tenantName: tenant.name,
          locationName: location.name,
          trackingUrl,
        }),
        { kind: 'received', shortNumber },
      );
    }
    void sendSmsSafely(
      {
        to: input.customerPhone,
        body: smsOrderReceived({
          customerName: input.customerName,
          shortNumber,
          tenantName: tenant.name,
          trackingUrl,
        }),
      },
      { kind: 'order.received' },
    );
  }

  const estimated = estimateReadyAt({
    pickupAt,
    confirmedAt: now,
  });
  return {
    trackingToken: token,
    trackingUrl: `/order/${input.tenantSlug}/${input.locationSlug}/track/${token}`,
    shortNumber,
    estimatedReadyAt: estimated,
  };
}

builder.mutationField('submitOnlineOrder', (t) =>
  t.field({
    type: SubmitOnlineOrderResultRef,
    description:
      'Anonymous public submit. Rate-limited per IP (10/min). Creates a Ticket + OnlineOrderRequest, auto-links Guest by phone.',
    args: { input: t.arg({ type: SubmitOnlineOrderInput, required: true }) },
    validate: { schema: z.object({ input: submitOnlineOrderSchema }) },
    resolve: (_root, args, ctx) =>
      resolveSubmitOnlineOrder(
        args.input as unknown as SubmitOnlineOrderArgs,
        ctx,
      ),
  }),
);
