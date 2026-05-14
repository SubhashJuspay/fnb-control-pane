import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { RequestContext } from '../context.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../errors.js';
import { builder } from './builder.js';

/**
 * Tip pool domain.
 *
 * A TipPoolRule defines how the day's tips are split across job roles by
 * integer weights. `recomputeTipPool(businessDay)`:
 *   1. Sums `tipCents` on every ticket closed during that business day.
 *   2. Looks up each user with at least one TimeEntry intersecting the day,
 *      grouped by their EmploymentProfile.jobRoleId at the location.
 *   3. Splits the pool by weights: a role with weight w gets `w/sumWeights`
 *      of the pool; that role-slice is split equally across staff in that
 *      role on shift.
 *   4. Writes one TipAllocation per (rule, day, staff). Re-runs replace
 *      previous rows via the unique (rule, day, staff) index.
 *
 * Rounding strategy: integer cents per allocation; any rounding remainder
 * goes to the staff member with the alphabetically-first user id so the
 * totals always reconcile exactly with `totalTipPoolCents`.
 */

const weightEntrySchema = z.object({
  jobRoleId: z.string().uuid(),
  weight: z.number().int().min(0).max(1000),
});

const upsertRuleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(100),
  isActive: z.boolean().optional(),
  weights: z.array(weightEntrySchema).min(1).max(50),
});

function requireManager(ctx: RequestContext): { tenantId: string; locationId: string } {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  const role = ctx.auth.role;
  if (!(role === 'OWNER' || role === 'ADMIN' || role === 'MANAGER')) {
    throw new ForbiddenError('Only managers can manage tip pool rules.');
  }
  if (!ctx.auth.location)
    throw new ForbiddenError('A location context is required');
  return { tenantId: ctx.auth.tenant.id, locationId: ctx.auth.location.id };
}

function requireStaff(ctx: RequestContext): { tenantId: string; locationId: string } {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location)
    throw new ForbiddenError('A location context is required');
  return { tenantId: ctx.auth.tenant.id, locationId: ctx.auth.location.id };
}

// ── Object types ───────────────────────────────────────

builder.prismaObject('TipPoolRule', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    isActive: t.exposeBoolean('isActive'),
    /** Weights expressed as { jobRoleId, weight }[]. Serialised JSON. */
    weights: t.field({
      type: 'JSON',
      resolve: (parent) => parent.weights,
    }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

builder.prismaObject('TipAllocation', {
  fields: (t) => ({
    id: t.exposeID('id'),
    businessDay: t.expose('businessDay', { type: 'DateTime' }),
    amountCents: t.exposeInt('amountCents'),
    totalTipPoolCents: t.exposeInt('totalTipPoolCents'),
    computedAt: t.expose('computedAt', { type: 'DateTime' }),
    staffMember: t.relation('staffMember', { authScopes: { manager: true } }),
    jobRole: t.relation('jobRole', { authScopes: { manager: true }, nullable: true }),
    rule: t.relation('rule', { authScopes: { manager: true } }),
  }),
});

// ── Queries ───────────────────────────────────────────

builder.queryField('tipPoolRules', (t) =>
  t.prismaField({
    type: ['TipPoolRule'],
    description:
      "Tip pool rules at the viewer's location. Manager+ only — rule definitions are configuration.",
    authScopes: { manager: true },
    resolve: async (query, _root, _args, ctx) => {
      const { locationId } = requireManager(ctx);
      return ctx.prisma.tipPoolRule.findMany({
        ...query,
        where: { locationId, archivedAt: null },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      });
    },
  }),
);

builder.queryField('dailyTipAllocations', (t) =>
  t.prismaField({
    type: ['TipAllocation'],
    description:
      "All tip allocations computed for a given business day at the viewer's location. Manager+ only.",
    authScopes: { manager: true },
    args: {
      businessDay: t.arg({ type: 'DateTime', required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireManager(ctx);
      const day = args.businessDay as Date;
      return ctx.prisma.tipAllocation.findMany({
        ...query,
        where: { locationId, businessDay: day },
        orderBy: [{ amountCents: 'desc' }],
      });
    },
  }),
);

builder.queryField('myTipAllocations', (t) =>
  t.prismaField({
    type: ['TipAllocation'],
    description:
      'Tip allocations for the signed-in user across recent business days. Staff-visible self-view.',
    authScopes: { staff: true },
    args: {
      from: t.arg({ type: 'DateTime', required: false }),
      to: t.arg({ type: 'DateTime', required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireStaff(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const where: {
        locationId: string;
        staffMemberId: string;
        businessDay?: { gte?: Date; lte?: Date };
      } = {
        locationId,
        staffMemberId: ctx.auth.user.id,
      };
      if (args.from || args.to) {
        where.businessDay = {};
        if (args.from) where.businessDay.gte = args.from as Date;
        if (args.to) where.businessDay.lte = args.to as Date;
      }
      return ctx.prisma.tipAllocation.findMany({
        ...query,
        where,
        orderBy: { businessDay: 'desc' },
        take: 60,
      });
    },
  }),
);

// ── Mutations ─────────────────────────────────────────

builder.mutationField('upsertTipPoolRule', (t) =>
  t.prismaField({
    type: 'TipPoolRule',
    description:
      'Create a new rule or update an existing one. Manager+ only. Weights are { jobRoleId, weight: int }[] with at least one positive weight.',
    authScopes: { manager: true },
    args: {
      id: t.arg({ type: 'UUID', required: false }),
      name: t.arg.string({ required: true }),
      isActive: t.arg.boolean({ required: false }),
      weights: t.arg({ type: 'JSON', required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireManager(ctx);
      const parsed = upsertRuleSchema.safeParse({
        id: args.id ?? null,
        name: args.name,
        isActive: args.isActive ?? undefined,
        weights: args.weights,
      });
      if (!parsed.success) {
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );
      }
      const totalWeight = parsed.data.weights.reduce((s, w) => s + w.weight, 0);
      if (totalWeight <= 0) {
        throw new AppError(
          'BAD_INPUT',
          'At least one weight must be positive.',
        );
      }
      // Verify every jobRoleId belongs to this tenant. Avoid leaking foreign
      // role ids through silent allocation later.
      const jobRoleIds = parsed.data.weights.map((w) => w.jobRoleId);
      const validRoleCount = await ctx.prisma.jobRole.count({
        where: { tenantId, id: { in: jobRoleIds } },
      });
      if (validRoleCount !== new Set(jobRoleIds).size) {
        throw new AppError('BAD_INPUT', 'Unknown jobRoleId in weights.');
      }

      const upserted = parsed.data.id
        ? await ctx.prisma.tipPoolRule.update({
            ...query,
            where: { id: parsed.data.id },
            data: {
              name: parsed.data.name,
              isActive: parsed.data.isActive ?? true,
              weights: parsed.data.weights,
            },
          })
        : await ctx.prisma.tipPoolRule.create({
            ...query,
            data: {
              tenantId,
              locationId,
              name: parsed.data.name,
              isActive: parsed.data.isActive ?? true,
              weights: parsed.data.weights,
            },
          });
      await writeAudit(ctx, {
        action: parsed.data.id ? 'update_tip_pool_rule' : 'create_tip_pool_rule',
        resourceType: 'TipPoolRule',
        resourceId: upserted.id,
        metadata: { name: parsed.data.name, weights: parsed.data.weights },
      });
      return upserted;
    },
  }),
);

builder.mutationField('archiveTipPoolRule', (t) =>
  t.prismaField({
    type: 'TipPoolRule',
    description: 'Soft-archive a tip pool rule (sets archivedAt). Manager+ only.',
    authScopes: { manager: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireManager(ctx);
      const rule = await ctx.prisma.tipPoolRule.findFirst({
        where: { id: args.id, locationId },
        select: { id: true },
      });
      if (!rule) throw new NotFoundError('Rule not found.');
      const updated = await ctx.prisma.tipPoolRule.update({
        ...query,
        where: { id: rule.id },
        data: { archivedAt: new Date(), isActive: false },
      });
      await writeAudit(ctx, {
        action: 'archive_tip_pool_rule',
        resourceType: 'TipPoolRule',
        resourceId: rule.id,
      });
      return updated;
    },
  }),
);

builder.mutationField('recomputeTipPool', (t) =>
  t.prismaField({
    type: ['TipAllocation'],
    description:
      "Compute (or recompute) tip allocations for the given business day using the rule's current weights. Idempotent: rerunning replaces existing allocations for that (rule, day).",
    authScopes: { manager: true },
    args: {
      ruleId: t.arg({ type: 'UUID', required: true }),
      businessDay: t.arg({ type: 'DateTime', required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireManager(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const rule = await ctx.prisma.tipPoolRule.findFirst({
        where: { id: args.ruleId, locationId, archivedAt: null },
      });
      if (!rule) throw new NotFoundError('Active rule not found.');
      const day = args.businessDay as Date;

      // Sum tips from tickets closed on this business day.
      const tipAgg = await ctx.prisma.ticket.aggregate({
        where: {
          locationId,
          businessDay: day,
          status: 'CLOSED',
        },
        _sum: { tipCents: true },
      });
      const totalTipPoolCents = tipAgg._sum.tipCents ?? 0;

      // Find every TimeEntry that overlapped this business day. Each entry
      // joined to its Shift tells us the role the user was working in.
      // (We treat the day as [day, day+24h); time entries that span the
      // boundary still count toward both days — same semantics as labor
      // reports elsewhere in the api.)
      const dayStart = new Date(day);
      const dayEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000);
      const entries = await ctx.prisma.timeEntry.findMany({
        where: {
          locationId,
          // Overlap: clocked in before dayEnd AND (still open OR clocked out after dayStart).
          clockedInAt: { lt: dayEnd },
          OR: [{ clockedOutAt: null }, { clockedOutAt: { gt: dayStart } }],
        },
        select: {
          userId: true,
          shift: { select: { jobRoleId: true } },
        },
      });

      // Group users by role. If a user clocked into multiple shifts with
      // different roles, they're counted in each role (more shifts → bigger
      // share). Entries without a linked shift are skipped — staff can't be
      // tipped without an assigned role.
      const rolePeople = new Map<string, Set<string>>(); // jobRoleId → unique userIds
      for (const e of entries) {
        const role = e.shift?.jobRoleId ?? null;
        if (!role) continue;
        const set = rolePeople.get(role) ?? new Set<string>();
        set.add(e.userId);
        rolePeople.set(role, set);
      }

      // Compute role slices per the rule's weights.
      const weights = (rule.weights as Array<{ jobRoleId: string; weight: number }>) ?? [];
      const sumWeight = weights.reduce((s, w) => s + w.weight, 0) || 1;

      type AllocSpec = {
        staffMemberId: string;
        jobRoleId: string;
        amountCents: number;
      };
      const allocSpecs: AllocSpec[] = [];
      for (const w of weights) {
        const peopleSet = rolePeople.get(w.jobRoleId);
        const people = peopleSet ? [...peopleSet] : [];
        if (people.length === 0 || w.weight === 0) continue;
        const roleSliceCents = Math.floor((totalTipPoolCents * w.weight) / sumWeight);
        const perPerson = Math.floor(roleSliceCents / people.length);
        for (const uid of people) {
          allocSpecs.push({
            staffMemberId: uid,
            jobRoleId: w.jobRoleId,
            amountCents: perPerson,
          });
        }
      }

      // Distribute any rounding remainder to the alphabetically-first user
      // so the sum of allocations exactly equals totalTipPoolCents.
      const allocated = allocSpecs.reduce((s, a) => s + a.amountCents, 0);
      const remainder = totalTipPoolCents - allocated;
      if (remainder !== 0 && allocSpecs.length > 0) {
        allocSpecs.sort((a, b) => a.staffMemberId.localeCompare(b.staffMemberId));
        const first = allocSpecs[0];
        if (first) first.amountCents += remainder;
      }

      // Write rows atomically. Delete previous (rule, day) allocations first;
      // then re-insert. Single transaction so a partial failure doesn't leave
      // the day half-allocated.
      const userId = ctx.auth.user.id;
      const written = await ctx.prisma.$transaction(async (tx) => {
        await tx.tipAllocation.deleteMany({
          where: { ruleId: rule.id, businessDay: day },
        });
        if (allocSpecs.length === 0) return [];
        await tx.tipAllocation.createMany({
          data: allocSpecs.map((a) => ({
            tenantId,
            locationId,
            ruleId: rule.id,
            businessDay: day,
            staffMemberId: a.staffMemberId,
            jobRoleId: a.jobRoleId,
            amountCents: a.amountCents,
            totalTipPoolCents,
            computedById: userId,
          })),
        });
        return tx.tipAllocation.findMany({
          ...query,
          where: { ruleId: rule.id, businessDay: day },
          orderBy: { amountCents: 'desc' },
        });
      });

      await writeAudit(ctx, {
        action: 'recompute_tip_pool',
        resourceType: 'TipPoolRule',
        resourceId: rule.id,
        metadata: {
          businessDay: day.toISOString().slice(0, 10),
          totalTipPoolCents,
          allocations: written.length,
        },
      });
      return written;
    },
  }),
);
