import type { PrismaClient } from '@repo/db';
import { signUpTenantSchema } from '@repo/validation/auth';
import { z } from 'zod';
import { writeAnonymousAudit } from '../../audit.js';
import type { RequestContext } from '../../context.js';
import { ConflictError } from '../../errors.js';
import { TokenBucket } from '../../online-orders/rate-limit.js';
import { hashPassword } from '../../password.js';
import { builder } from '../builder.js';

// Module-level rate limit: 3 attempts/min per IP. Tenant creation is a
// heavy, abusable surface — keep this tighter than reservations / orders.
export const signUpTenantRateLimiter = new TokenBucket({
  capacity: 3,
  refillPerSec: 0.05,
});

export interface SignUpTenantArgs {
  tenantName: string;
  tenantSlug: string;
  locationName: string;
  locationSlug: string;
  timezone: string;
  currency: string;
  ownerName: string;
  ownerEmail: string;
  password: string;
  ipAddress?: string | null;
}

export interface SignUpTenantResultData {
  tenantId: string;
  tenantSlug: string;
  locationSlug: string;
  ownerEmail: string;
}

const SignUpTenantInput = builder.inputType('SignUpTenantInput', {
  fields: (t) => ({
    tenantName: t.string({ required: true }),
    tenantSlug: t.string({ required: true }),
    locationName: t.string({ required: true }),
    locationSlug: t.string({ required: true }),
    timezone: t.string({ required: false }),
    currency: t.string({ required: false }),
    ownerName: t.string({ required: true }),
    ownerEmail: t.string({ required: true }),
    password: t.string({ required: true }),
  }),
});

const SignUpTenantResultRef = builder.objectRef<SignUpTenantResultData>(
  'SignUpTenantResult',
);
SignUpTenantResultRef.implement({
  fields: (t) => ({
    tenantId: t.exposeID('tenantId'),
    tenantSlug: t.exposeString('tenantSlug'),
    locationSlug: t.exposeString('locationSlug'),
    ownerEmail: t.exposeString('ownerEmail'),
  }),
});

export interface SignUpTenantDeps {
  rateLimiter: TokenBucket;
}

export const defaultSignUpTenantDeps: SignUpTenantDeps = {
  rateLimiter: signUpTenantRateLimiter,
};

export async function resolveSignUpTenant(
  input: SignUpTenantArgs,
  ctx: RequestContext,
  deps: SignUpTenantDeps = defaultSignUpTenantDeps,
): Promise<SignUpTenantResultData> {
  const ipKey = input.ipAddress ?? 'anon';
  if (!deps.rateLimiter.consume(ipKey)) {
    throw new ConflictError('Too many sign-up attempts, please try again shortly');
  }

  // Surface friendly errors for the obvious uniqueness collisions before
  // hitting the transaction.
  const existingTenant = await ctx.prisma.tenant.findUnique({
    where: { slug: input.tenantSlug },
    select: { id: true },
  });
  if (existingTenant) {
    throw new ConflictError(`Tenant slug "${input.tenantSlug}" is taken`);
  }
  const existingUser = await ctx.prisma.user.findUnique({
    where: { email: input.ownerEmail },
    select: { id: true },
  });
  if (existingUser) {
    throw new ConflictError(
      'An account with that email already exists. Try signing in instead.',
    );
  }

  const passwordHash = hashPassword(input.password);

  // Atomic tenant + location + user + membership creation. If anything
  // fails the whole row set is rolled back so we never leave a half-built
  // tenant lying around.
  const out = await (ctx.prisma as PrismaClient).$transaction(async (tx) => {
    const tenant = (await tx.tenant.create({
      data: {
        name: input.tenantName,
        slug: input.tenantSlug,
        status: 'ACTIVE',
      },
      select: { id: true, slug: true },
    })) as { id: string; slug: string };

    const location = (await tx.location.create({
      data: {
        tenantId: tenant.id,
        name: input.locationName,
        slug: input.locationSlug,
        timezone: input.timezone,
        currency: input.currency,
      },
      select: { id: true, slug: true },
    })) as { id: string; slug: string };

    const user = (await tx.user.create({
      data: {
        email: input.ownerEmail,
        name: input.ownerName,
        passwordHash,
        // Self-serve flow: trust the email and skip the verification round
        // trip. A real production deployment can wire a verification email
        // via the existing nodemailer transport later.
        emailVerified: new Date(),
      },
      select: { id: true },
    })) as { id: string };

    await tx.membership.create({
      data: {
        userId: user.id,
        tenantId: tenant.id,
        role: 'OWNER',
        status: 'ACTIVE',
      },
    });

    return { tenant, location, userId: user.id };
  });

  await writeAnonymousAudit(ctx, {
    tenantId: out.tenant.id,
    locationId: out.location.id,
    actorUserId: out.userId,
    action: 'tenant.signed_up',
    resourceType: 'tenant',
    resourceId: out.tenant.id,
    metadata: {
      tenantSlug: out.tenant.slug,
      locationSlug: out.location.slug,
      submittedFromIp: input.ipAddress ?? null,
    },
  });

  return {
    tenantId: out.tenant.id,
    tenantSlug: out.tenant.slug,
    locationSlug: out.location.slug,
    ownerEmail: input.ownerEmail,
  };
}

builder.mutationField('signUpTenant', (t) =>
  t.field({
    type: SignUpTenantResultRef,
    description:
      'Anonymous public tenant signup. Creates Tenant + Location + Owner User in one transaction.',
    args: { input: t.arg({ type: SignUpTenantInput, required: true }) },
    validate: { schema: z.object({ input: signUpTenantSchema }) },
    resolve: (_root, args, ctx) =>
      resolveSignUpTenant(args.input as unknown as SignUpTenantArgs, ctx),
  }),
);
