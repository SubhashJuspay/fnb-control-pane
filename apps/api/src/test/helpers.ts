import type { PrismaClient, Role } from '@repo/db';
import type { AuthContext, RequestContext } from '../context.js';
import { hashPassword } from '../password.js';

const fakeLog = {
  child: () => fakeLog,
  info() {},
  debug() {},
  warn() {},
  error() {},
} as unknown as RequestContext['log'];

export interface SeedTenantOpts {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName?: string;
  ownerPassword?: string;
  locationName?: string;
  locationSlug?: string;
}

export interface SeededTenant {
  tenantId: string;
  tenantSlug: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerMembershipId: string;
  locationId: string;
  locationSlug: string;
}

/**
 * Seed a tenant with a single tenant-wide OWNER user and one ACTIVE location.
 * Returns IDs for the seeded entities so tests can build contexts.
 */
export async function seedTenant(
  prisma: PrismaClient,
  opts: SeedTenantOpts,
): Promise<SeededTenant> {
  const tenant = await prisma.tenant.create({
    data: {
      name: opts.name,
      slug: opts.slug,
    },
  });
  const owner = await prisma.user.create({
    data: {
      email: opts.ownerEmail,
      name: opts.ownerName ?? `${opts.name} Owner`,
      passwordHash: hashPassword(opts.ownerPassword ?? 'password1'),
      emailVerified: new Date(),
    },
  });
  const ownership = await prisma.membership.create({
    data: {
      userId: owner.id,
      tenantId: tenant.id,
      role: 'OWNER' as Role,
    },
  });
  const location = await prisma.location.create({
    data: {
      tenantId: tenant.id,
      name: opts.locationName ?? `${opts.name} Main`,
      slug: opts.locationSlug ?? 'main',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
    },
  });
  return {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    ownerUserId: owner.id,
    ownerEmail: owner.email,
    ownerMembershipId: ownership.id,
    locationId: location.id,
    locationSlug: location.slug,
  };
}

export interface MakeContextOpts {
  prisma: PrismaClient;
  userId?: string;
  userEmail?: string;
  tenantId?: string;
  tenantSlug?: string;
  locationId?: string | null;
  role?: Role;
}

/** Build a synthetic RequestContext for use in integration tests. */
export function makeContext(opts: MakeContextOpts): RequestContext {
  let auth: AuthContext;
  if (!opts.userId || !opts.tenantId) {
    auth = { kind: 'anonymous' };
  } else {
    auth = {
      kind: 'authenticated',
      user: { id: opts.userId, email: opts.userEmail ?? 'u@test' },
      tenant: { id: opts.tenantId, slug: opts.tenantSlug ?? 'tenant' },
      location: opts.locationId
        ? { id: opts.locationId, timezone: 'America/Los_Angeles', currency: 'USD' }
        : null,
      role: opts.role ?? 'VIEWER',
    };
  }
  return {
    auth,
    prisma: opts.prisma as unknown as RequestContext['prisma'],
    requestId: 'test',
    log: fakeLog,
  };
}
