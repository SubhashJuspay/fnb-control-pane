import type { PrismaClient } from '@repo/db';
import type { RequestContext } from '../context.js';
import { ConflictError, NotFoundError } from '../errors.js';
import { computeBusinessDay, nextShortNumber } from '../order/short-number.js';

export interface OpenTicketBoundToTableArgs {
  prisma: PrismaClient;
  ctx: RequestContext;
  tableId: string;
  customerLabel?: string | null;
  orderType?: 'DINE_IN' | 'TAKEOUT';
}

export interface OpenTicketBoundToTableResult {
  ticketId: string;
  shortNumber: number;
  businessDay: Date;
  locationId: string;
}

/**
 * Open a POS ticket bound to a Table. Reuses the canonical
 * (locationId, businessDay, shortNumber) allocation from the POS subsystem.
 *
 * Caller is responsible for the role check, audit, and pubsub publishes —
 * this helper is the minimal critical-section primitive shared between
 * `openTicketAtTable` (Task 5) and `seatReservation` (Task 6).
 *
 * Throws:
 *   - NotFoundError when the table does not exist or is archived or belongs
 *     to a different location.
 *   - ConflictError when the table already has an OPEN ticket bound to it.
 *   - ConflictError when the (locationId, businessDay, shortNumber) unique
 *     constraint cannot be satisfied after retries.
 */
export async function openTicketBoundToTable(
  args: OpenTicketBoundToTableArgs,
): Promise<OpenTicketBoundToTableResult> {
  const { prisma, ctx, tableId } = args;
  if (ctx.auth.kind !== 'authenticated') {
    throw new NotFoundError('Authentication required');
  }
  if (!ctx.auth.location) {
    throw new NotFoundError('A location context is required');
  }
  const locationId = ctx.auth.location.id;
  const userId = ctx.auth.user.id;

  const table = await prisma.table.findFirst({
    where: { id: tableId, locationId, archivedAt: null },
    select: { id: true },
  });
  if (!table) throw new NotFoundError('Table not found');

  const existingOpen = await prisma.ticket.findFirst({
    where: { tableId, status: 'OPEN' },
    select: { id: true },
  });
  if (existingOpen) {
    throw new ConflictError('Table already has an open ticket');
  }

  const location = await prisma.location.findUnique({
    where: { id: locationId },
    select: { businessDayCutoff: true, timezone: true },
  });
  if (!location) throw new NotFoundError('Location not found');

  const at = new Date();
  const businessDay = computeBusinessDay({
    at,
    businessDayCutoff: location.businessDayCutoff,
    timezone: location.timezone,
  });
  const orderType = args.orderType ?? 'DINE_IN';
  const customerLabel = args.customerLabel ?? null;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const shortNumber = await nextShortNumber({ prisma, locationId, businessDay });
    try {
      const created = (await prisma.ticket.create({
        data: {
          locationId,
          tableId,
          shortNumber,
          businessDay,
          customerLabel,
          orderType,
          status: 'OPEN',
          openedById: userId,
          subtotalCents: 0,
          discountCents: 0,
          taxCents: 0,
          totalCents: 0,
        },
        select: { id: true, shortNumber: true, businessDay: true },
      })) as { id: string; shortNumber: number; businessDay: Date };
      return {
        ticketId: created.id,
        shortNumber: created.shortNumber,
        businessDay: created.businessDay,
        locationId,
      };
    } catch (err) {
      lastError = err;
      const code = (err as { code?: string }).code;
      if (code !== 'P2002') break;
    }
  }
  throw new ConflictError(
    `Failed to allocate a unique ticket number after retries: ${String(lastError)}`,
  );
}
