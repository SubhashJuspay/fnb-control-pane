import type { PrismaClient } from '@repo/db';
import { computeOpenStatus, parseOpeningHours } from '@repo/types';
import { submitReservationRequestSchema } from '@repo/validation/reservation';
import { z } from 'zod';
import { writeAnonymousAudit } from '../../../audit.js';
import type { RequestContext } from '../../../context.js';
import { ConflictError, NotFoundError } from '../../../errors.js';
import { TokenBucket } from '../../../online-orders/rate-limit.js';
import { ensureSystemUser } from '../../../online-orders/system-user.js';
import { floorChannelName, pubsub as defaultPubsub } from '../../../pubsub.js';
import { builder } from '../../builder.js';
import { SubmitReservationRequestInput } from './inputs.js';

// 5 reservation requests per IP per minute is plenty for human use, low enough
// that abusive scripts get blocked quickly.
export const submitReservationRateLimiter = new TokenBucket({
  capacity: 5,
  refillPerSec: 0.083,
});

export interface SubmitReservationRequestArgs {
  tenantSlug: string;
  locationSlug: string;
  guestName: string;
  guestPhone: string;
  guestEmail?: string | null;
  partySize: number;
  requestedTime: Date;
  notes?: string | null;
  ipAddress?: string | null;
}

export interface SubmitReservationRequestResultData {
  reservationId: string;
  /** Tracking-ish surfacing for the customer. We don't need a token here
   *  because confirmation flows happen on the staff side; we return the id
   *  so the customer-facing confirmation page can echo it back to them. */
  status: 'PENDING';
  partySize: number;
  requestedTime: Date;
}

const SubmitReservationRequestResultRef =
  builder.objectRef<SubmitReservationRequestResultData>(
    'SubmitReservationRequestResult',
  );
SubmitReservationRequestResultRef.implement({
  fields: (t) => ({
    reservationId: t.exposeID('reservationId'),
    status: t.exposeString('status'),
    partySize: t.exposeInt('partySize'),
    requestedTime: t.expose('requestedTime', { type: 'DateTime' }),
  }),
});

export interface SubmitReservationRequestDeps {
  rateLimiter: TokenBucket;
  pubsub: Pick<typeof defaultPubsub, 'publish'>;
  now: () => Date;
}

export const defaultSubmitReservationDeps: SubmitReservationRequestDeps = {
  rateLimiter: submitReservationRateLimiter,
  pubsub: defaultPubsub,
  now: () => new Date(),
};

export async function resolveSubmitReservationRequest(
  input: SubmitReservationRequestArgs,
  ctx: RequestContext,
  deps: SubmitReservationRequestDeps = defaultSubmitReservationDeps,
): Promise<SubmitReservationRequestResultData> {
  const ipKey = input.ipAddress ?? 'anon';
  if (!deps.rateLimiter.consume(ipKey)) {
    throw new ConflictError('Too many requests, please try again shortly');
  }

  const tenant = await ctx.prisma.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true, slug: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') {
    throw new NotFoundError('Tenant not found');
  }
  const location = await ctx.prisma.location.findFirst({
    where: { tenantId: tenant.id, slug: input.locationSlug, status: 'ACTIVE' },
    select: { id: true, timezone: true, openingHours: true },
  });
  if (!location) throw new NotFoundError('Location not found');

  // Reject when the requested time is in the past or > 90 days out.
  const now = deps.now();
  const requested = input.requestedTime;
  if (requested.getTime() < now.getTime() - 60_000) {
    throw new ConflictError('Requested time is in the past');
  }
  const ninetyDaysOut = now.getTime() + 90 * 24 * 60 * 60 * 1000;
  if (requested.getTime() > ninetyDaysOut) {
    throw new ConflictError('Requested time is more than 90 days out');
  }

  // Reject when the requested time falls outside the location's opening hours.
  // If hours aren't set the location is treated as always open.
  const hours = parseOpeningHours(location.openingHours);
  if (hours) {
    const status = computeOpenStatus(hours, location.timezone, requested);
    if (!status.isOpen) {
      throw new ConflictError(
        'The location is closed at the requested time. Please pick a time during opening hours.',
      );
    }
  }

  // Reservation.createdById is required (Restrict FK to User). For an
  // anonymous public submission we attribute it to the tenant's system user,
  // mirroring the online-order flow.
  const systemUserId = await ensureSystemUser(
    ctx.prisma as PrismaClient,
    tenant.id,
    tenant.slug,
  );

  const reservation = (await ctx.prisma.reservation.create({
    data: {
      locationId: location.id,
      kind: 'RESERVATION',
      status: 'PENDING',
      guestName: input.guestName,
      guestPhone: input.guestPhone,
      partySize: input.partySize,
      requestedTime: requested,
      durationMinutes: 90,
      notes: input.notes ?? null,
      createdById: systemUserId,
    },
    select: { id: true },
  })) as { id: string };

  await writeAnonymousAudit(ctx, {
    tenantId: tenant.id,
    locationId: location.id,
    actorUserId: null,
    action: 'reservation.requested',
    resourceType: 'reservation',
    resourceId: reservation.id,
    metadata: {
      partySize: input.partySize,
      requestedTime: requested,
      hasEmail: Boolean(input.guestEmail),
      submittedFromIp: input.ipAddress ?? null,
    },
  });

  await deps.pubsub.publish(floorChannelName(location.id), {
    kind: 'ReservationChanged',
    reservationId: reservation.id,
  });

  return {
    reservationId: reservation.id,
    status: 'PENDING',
    partySize: input.partySize,
    requestedTime: requested,
  };
}

builder.mutationField('submitReservationRequest', (t) =>
  t.field({
    type: SubmitReservationRequestResultRef,
    description:
      'Anonymous public booking submit. Rate-limited per IP (5/min). Creates a PENDING reservation that staff confirm or cancel from the reservations console.',
    args: {
      input: t.arg({ type: SubmitReservationRequestInput, required: true }),
    },
    validate: { schema: z.object({ input: submitReservationRequestSchema }) },
    resolve: (_root, args, ctx) =>
      resolveSubmitReservationRequest(
        args.input as unknown as SubmitReservationRequestArgs,
        ctx,
      ),
  }),
);
