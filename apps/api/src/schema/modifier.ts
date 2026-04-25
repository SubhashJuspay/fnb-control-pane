import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { resolveModifierPrice } from '../menu/pricing.js';
import { builder } from './builder.js';

export type ModifierRow = {
  id: string;
  modifierGroupId: string;
  basePriceDeltaCents: number;
  priceDeltaCents: number;
  archivedAt: Date | null;
};

export type LocationModifierRow = {
  id: string;
  locationId: string;
  modifierId: string;
  hidden: boolean;
  available: boolean;
  priceDeltaOverrideCents: number | null;
};

/**
 * Per-request loader for `LocationModifier` rows keyed by `(modifierId, locationId)`.
 */
async function loadLocationModifierOverride(
  ctx: RequestContext,
  modifierId: string,
  locationId: string,
): Promise<LocationModifierRow | null> {
  type LoaderKey = string;
  type LoaderState = {
    pending: Map<LoaderKey, { modifierId: string; locationId: string }>;
    resolvers: Map<LoaderKey, Array<(v: LocationModifierRow | null) => void>>;
    timer: NodeJS.Immediate | null;
    cache: Map<LoaderKey, LocationModifierRow | null>;
  };
  const holder = ctx as RequestContext & {
    __locationModifierLoader?: LoaderState;
  };
  if (!holder.__locationModifierLoader) {
    holder.__locationModifierLoader = {
      pending: new Map(),
      resolvers: new Map(),
      timer: null,
      cache: new Map(),
    };
  }
  const state = holder.__locationModifierLoader;
  const key: LoaderKey = `${modifierId}|${locationId}`;
  if (state.cache.has(key)) {
    return state.cache.get(key) ?? null;
  }
  return new Promise<LocationModifierRow | null>((resolve) => {
    state.pending.set(key, { modifierId, locationId });
    const list = state.resolvers.get(key) ?? [];
    list.push(resolve);
    state.resolvers.set(key, list);
    if (!state.timer) {
      state.timer = setImmediate(async () => {
        const pending = Array.from(state.pending.values());
        state.pending.clear();
        state.timer = null;
        const resolversCopy = state.resolvers;
        state.resolvers = new Map();
        if (pending.length === 0) return;
        const rows = (await ctx.prisma.locationModifier.findMany({
          where: {
            OR: pending.map((p) => ({
              modifierId: p.modifierId,
              locationId: p.locationId,
            })),
          },
          select: {
            id: true,
            locationId: true,
            modifierId: true,
            hidden: true,
            available: true,
            priceDeltaOverrideCents: true,
          },
        })) as LocationModifierRow[];
        const byKey = new Map<string, LocationModifierRow>();
        for (const r of rows) {
          byKey.set(`${r.modifierId}|${r.locationId}`, r);
        }
        for (const p of pending) {
          const k = `${p.modifierId}|${p.locationId}`;
          const v = byKey.get(k) ?? null;
          state.cache.set(k, v);
          const callbacks = resolversCopy.get(k) ?? [];
          for (const cb of callbacks) cb(v);
        }
      });
    }
  });
}

/**
 * Effective modifier price delta for the viewer. Anonymous / location-less
 * viewers see the base delta unchanged.
 */
export async function resolveEffectivePriceDelta(
  parent: { id: string; priceDeltaCents: number },
  ctx: RequestContext,
): Promise<number> {
  if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) {
    return parent.priceDeltaCents;
  }
  const override = await loadLocationModifierOverride(
    ctx,
    parent.id,
    ctx.auth.location.id,
  );
  return resolveModifierPrice({
    basePriceDeltaCents: parent.priceDeltaCents,
    locationOverride: override
      ? { priceDeltaOverrideCents: override.priceDeltaOverrideCents }
      : null,
  });
}

/**
 * Mirror of resolveItemAvailability for modifiers: archived → false;
 * locationOverride.hidden → false; locationOverride.available=false → false.
 */
export async function resolveModifierAvailability(
  parent: { id: string; archivedAt: Date | null },
  ctx: RequestContext,
): Promise<boolean> {
  if (parent.archivedAt !== null) return false;
  if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return true;
  const override = await loadLocationModifierOverride(
    ctx,
    parent.id,
    ctx.auth.location.id,
  );
  if (!override) return true;
  if (override.hidden) return false;
  if (!override.available) return false;
  return true;
}

export const ModifierRef = builder.prismaObject('Modifier', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    priceDeltaCents: t.exposeInt('priceDeltaCents'),
    isDefault: t.exposeBoolean('isDefault'),
    sortOrder: t.exposeInt('sortOrder'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    effectivePriceDeltaCents: t.field({
      type: 'Int',
      authScopes: { authenticated: true },
      resolve: (parent, _args, ctx) =>
        resolveEffectivePriceDelta(
          parent as { id: string; priceDeltaCents: number },
          ctx,
        ),
    }),
    availableAtViewerLocation: t.field({
      type: 'Boolean',
      authScopes: { authenticated: true },
      resolve: (parent, _args, ctx) =>
        resolveModifierAvailability(
          parent as { id: string; archivedAt: Date | null },
          ctx,
        ),
    }),
  }),
});

/** Returns items that have this modifier group attached, ordered by name. */
export async function resolveAttachedItems(
  query: object,
  parent: { id: string },
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  const attachments = await ctx.prisma.menuItemModifierGroup.findMany({
    where: { modifierGroupId: parent.id },
    select: { menuItemId: true },
  });
  if (attachments.length === 0) return [];
  const ids = attachments.map((a) => a.menuItemId);
  return ctx.prisma.menuItem.findMany({
    ...query,
    where: { id: { in: ids }, tenantId: ctx.auth.tenant.id },
    orderBy: { name: 'asc' },
  });
}

export const ModifierGroupRef = builder.prismaObject('ModifierGroup', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    minSelections: t.exposeInt('minSelections'),
    maxSelections: t.exposeInt('maxSelections'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    modifiers: t.prismaField({
      type: ['Modifier'],
      authScopes: { manager: true },
      resolve: (query, parent, _args, ctx) =>
        ctx.prisma.modifier.findMany({
          ...query,
          where: { modifierGroupId: (parent as { id: string }).id },
          orderBy: { sortOrder: 'asc' },
        }) as never,
    }),
    attachedItems: t.prismaField({
      type: ['MenuItem'],
      authScopes: { manager: true },
      resolve: (query, parent, _args, ctx) =>
        resolveAttachedItems(query, parent as { id: string }, ctx) as never,
    }),
  }),
});

/** Pure resolver for catalogModifierGroups. */
export async function resolveCatalogModifierGroups(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.modifierGroup.findMany({
    ...query,
    where: { tenantId: ctx.auth.tenant.id, archivedAt: null },
    orderBy: { name: 'asc' },
  });
}

/** Pure resolver for catalogModifierGroup(id). */
export async function resolveCatalogModifierGroup(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.modifierGroup.findFirst({
    ...query,
    where: { id, tenantId: ctx.auth.tenant.id },
  });
}

builder.queryField('catalogModifierGroups', (t) =>
  t.prismaConnection({
    type: 'ModifierGroup',
    cursor: 'id',
    description: 'Modifier groups within the current tenant. Requires manager role.',
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      return ctx.prisma.modifierGroup.findMany({
        ...query,
        where: { tenantId: ctx.auth.tenant.id, archivedAt: null },
        orderBy: { name: 'asc' },
      });
    },
    totalCount: (_root, _args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      return ctx.prisma.modifierGroup.count({
        where: { tenantId: ctx.auth.tenant.id, archivedAt: null },
      });
    },
  }),
);

builder.queryField('catalogModifierGroup', (t) =>
  t.prismaField({
    type: 'ModifierGroup',
    nullable: true,
    authScopes: { manager: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveCatalogModifierGroup(query, ctx, args.id as string) as never,
  }),
);
