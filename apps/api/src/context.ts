import { randomUUID } from 'node:crypto';
import type { Role } from '@repo/db';
import { prisma } from './prisma.js';
import { verifySession } from './auth.js';
import { childLogger, type Logger } from './logger.js';

export type AuthContext =
  | { kind: 'anonymous' }
  | {
      kind: 'authenticated';
      user: { id: string; email: string };
      tenant: { id: string; slug: string };
      location: { id: string; timezone: string; currency: string } | null;
      role: Role;
    };

export interface RequestContext {
  auth: AuthContext;
  prisma: typeof prisma;
  requestId: string;
  log: Logger;
}

export interface ContextRequest {
  headers: {
    cookie?: string;
    'x-tenant-slug'?: string;
    'x-location-id'?: string;
    'x-request-id'?: string;
  };
}

function anonymousContext(
  requestId: string,
  bindings: Record<string, unknown> = {},
): RequestContext {
  return {
    auth: { kind: 'anonymous' },
    prisma,
    requestId,
    log: childLogger({ requestId, ...bindings }),
  };
}

export async function buildContext(req: ContextRequest): Promise<RequestContext> {
  const requestId = req.headers['x-request-id'] ?? randomUUID();
  const session = await verifySession(req.headers.cookie);

  if (!session) {
    return anonymousContext(requestId);
  }

  const tenantSlug = req.headers['x-tenant-slug'];
  const locationId = req.headers['x-location-id'] ?? null;

  if (!tenantSlug) {
    return anonymousContext(requestId, { userId: session.userId });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, slug: true },
  });
  if (!tenant) {
    return anonymousContext(requestId, { userId: session.userId });
  }

  const membership = await prisma.membership.findFirst({
    where: {
      userId: session.userId,
      tenantId: tenant.id,
      status: 'ACTIVE',
      OR: locationId
        ? [{ locationId }, { locationId: null }]
        : [{ locationId: null }],
    },
    orderBy: { locationId: 'desc' },
    select: {
      id: true,
      role: true,
      locationId: true,
      user: { select: { id: true, email: true } },
    },
  });
  if (!membership) {
    return anonymousContext(requestId, {
      userId: session.userId,
      tenantId: tenant.id,
    });
  }

  let location: { id: string; timezone: string; currency: string } | null = null;
  if (locationId) {
    const loc = await prisma.location.findFirst({
      where: { id: locationId, tenantId: tenant.id, status: 'ACTIVE' },
      select: { id: true, timezone: true, currency: true },
    });
    if (loc) location = loc;
  }

  return {
    auth: {
      kind: 'authenticated',
      user: membership.user,
      tenant: { id: tenant.id, slug: tenant.slug },
      location,
      role: membership.role,
    },
    prisma,
    requestId,
    log: childLogger({
      requestId,
      userId: membership.user.id,
      tenantId: tenant.id,
      locationId: location?.id ?? null,
    }),
  };
}
