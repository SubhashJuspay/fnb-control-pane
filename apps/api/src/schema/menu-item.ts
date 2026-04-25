import type { RequestContext } from '../context.js';
import { ForbiddenError } from '../errors.js';
import { resolveItemAvailability, resolveItemPrice } from '../menu/pricing.js';
import { builder } from './builder.js';
import { ItemCourseEnum } from './enums.js';

export type MenuItemRow = {
  id: string;
  tenantId: string;
  basePriceCents: number;
  archivedAt: Date | null;
};

export type LocationItemRow = {
  id: string;
  locationId: string;
  menuItemId: string;
  hidden: boolean;
  available: boolean;
  priceCents: number | null;
};

/**
 * Per-request DataLoader for `LocationItem` rows keyed by `(menuItemId, locationId)`.
 * The loader is created lazily on first access on the request context to avoid
 * leaking state across requests.
 */
async function loadLocationOverride(
  ctx: RequestContext,
  menuItemId: string,
  locationId: string,
): Promise<LocationItemRow | null> {
  type LoaderKey = string; // `${menuItemId}|${locationId}`
  type LoaderState = {
    pending: Map<LoaderKey, { menuItemId: string; locationId: string }>;
    resolvers: Map<LoaderKey, Array<(v: LocationItemRow | null) => void>>;
    timer: NodeJS.Immediate | null;
    cache: Map<LoaderKey, LocationItemRow | null>;
  };
  const holder = ctx as RequestContext & {
    __locationItemLoader?: LoaderState;
  };
  if (!holder.__locationItemLoader) {
    holder.__locationItemLoader = {
      pending: new Map(),
      resolvers: new Map(),
      timer: null,
      cache: new Map(),
    };
  }
  const state = holder.__locationItemLoader;
  const key: LoaderKey = `${menuItemId}|${locationId}`;
  if (state.cache.has(key)) {
    return state.cache.get(key) ?? null;
  }
  return new Promise<LocationItemRow | null>((resolve) => {
    state.pending.set(key, { menuItemId, locationId });
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
        // Fetch all matching rows in one query.
        const rows = (await ctx.prisma.locationItem.findMany({
          where: {
            OR: pending.map((p) => ({
              menuItemId: p.menuItemId,
              locationId: p.locationId,
            })),
          },
          select: {
            id: true,
            locationId: true,
            menuItemId: true,
            hidden: true,
            available: true,
            priceCents: true,
          },
        })) as LocationItemRow[];
        const byKey = new Map<string, LocationItemRow>();
        for (const r of rows) {
          byKey.set(`${r.menuItemId}|${r.locationId}`, r);
        }
        for (const p of pending) {
          const k = `${p.menuItemId}|${p.locationId}`;
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
 * Resolves the effective price for the viewer. If the viewer is anonymous or
 * has no resolved location, returns `basePriceCents` unchanged.
 */
export async function resolveEffectivePrice(
  parent: MenuItemRow,
  ctx: RequestContext,
): Promise<number> {
  if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) {
    return parent.basePriceCents;
  }
  const override = await loadLocationOverride(ctx, parent.id, ctx.auth.location.id);
  return resolveItemPrice({
    basePriceCents: parent.basePriceCents,
    locationOverride: override ? { priceCents: override.priceCents } : null,
    sectionOverride: null,
  });
}

/**
 * Resolves whether the item is available for the viewer's location. Anonymous
 * or location-less viewers see "available iff not archived".
 */
export async function resolveAvailability(
  parent: MenuItemRow,
  ctx: RequestContext,
): Promise<boolean> {
  if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) {
    return parent.archivedAt === null;
  }
  const override = await loadLocationOverride(ctx, parent.id, ctx.auth.location.id);
  return resolveItemAvailability({
    archivedAt: parent.archivedAt,
    locationOverride: override
      ? { hidden: override.hidden, available: override.available }
      : null,
  });
}

/** Returns the LocationItem row for the viewer's location (or null). */
export async function resolveLocationOverride(
  parent: MenuItemRow,
  ctx: RequestContext,
): Promise<LocationItemRow | null> {
  if (ctx.auth.kind !== 'authenticated' || !ctx.auth.location) return null;
  return loadLocationOverride(ctx, parent.id, ctx.auth.location.id);
}

/** Returns ordered ModifierGroups attached to this MenuItem. */
export async function resolveItemModifierGroups(
  query: object,
  parent: { id: string },
  ctx: RequestContext,
): Promise<unknown[]> {
  const attachments = await ctx.prisma.menuItemModifierGroup.findMany({
    where: { menuItemId: parent.id },
    orderBy: { sortOrder: 'asc' },
    select: { modifierGroupId: true, sortOrder: true },
  });
  if (attachments.length === 0) return [];
  const ids = attachments.map((a) => a.modifierGroupId);
  const rows = await ctx.prisma.modifierGroup.findMany({
    ...query,
    where: { id: { in: ids } },
  });
  // Restore the join-table sortOrder.
  const order = new Map(attachments.map((a, i) => [a.modifierGroupId, i] as const));
  return [...rows].sort(
    (a, b) =>
      (order.get((a as { id: string }).id) ?? 0) -
      (order.get((b as { id: string }).id) ?? 0),
  );
}

export const LocationItemRef = builder.prismaObject('LocationItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    locationId: t.exposeID('locationId'),
    menuItemId: t.exposeID('menuItemId'),
    hidden: t.exposeBoolean('hidden'),
    available: t.exposeBoolean('available'),
    priceCents: t.exposeInt('priceCents', { nullable: true }),
  }),
});

export const MenuItemRef = builder.prismaObject('MenuItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    shortDescription: t.exposeString('shortDescription', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    basePriceCents: t.exposeInt('basePriceCents'),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    course: t.field({
      type: ItemCourseEnum,
      resolve: (parent) => parent.course,
    }),
    printerStation: t.exposeString('printerStation', { nullable: true }),
    dietaryTags: t.exposeStringList('dietaryTags'),
    allergenTags: t.exposeStringList('allergenTags'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    category: t.relation('category', {
      authScopes: { manager: true },
      nullable: true,
    }),
    taxCategory: t.relation('taxCategory', { authScopes: { manager: true } }),
    effectivePriceCents: t.field({
      type: 'Int',
      authScopes: { authenticated: true },
      resolve: (parent, _args, ctx) =>
        resolveEffectivePrice(parent as MenuItemRow, ctx),
    }),
    availableAtViewerLocation: t.field({
      type: 'Boolean',
      authScopes: { authenticated: true },
      resolve: (parent, _args, ctx) =>
        resolveAvailability(parent as MenuItemRow, ctx),
    }),
    locationOverride: t.field({
      type: LocationItemRef,
      nullable: true,
      authScopes: { manager: true },
      resolve: (parent, _args, ctx) =>
        resolveLocationOverride(parent as MenuItemRow, ctx) as never,
    }),
    modifierGroups: t.prismaField({
      type: ['ModifierGroup'],
      authScopes: { manager: true },
      resolve: (query, parent, _args, ctx) =>
        resolveItemModifierGroups(query, parent as { id: string }, ctx) as never,
    }),
  }),
});

export const CatalogItemFilter = builder.inputType('CatalogItemFilter', {
  fields: (t) => ({
    search: t.string({ required: false }),
    categoryId: t.field({ type: 'UUID', required: false }),
    archivedOnly: t.boolean({ required: false }),
    includeArchived: t.boolean({ required: false }),
  }),
});

export interface CatalogItemFilterArgs {
  search?: string | null;
  categoryId?: string | null;
  archivedOnly?: boolean | null;
  includeArchived?: boolean | null;
}

/** Build a Prisma where for catalog item listings, scoped to the tenant. */
export function buildCatalogItemWhere(
  tenantId: string,
  filter: CatalogItemFilterArgs | null | undefined,
): Record<string, unknown> {
  const where: Record<string, unknown> = { tenantId };
  if (filter?.archivedOnly) {
    where.archivedAt = { not: null };
  } else if (!filter?.includeArchived) {
    where.archivedAt = null;
  }
  if (filter?.categoryId) {
    where.categoryId = filter.categoryId;
  }
  if (filter?.search && filter.search.trim().length > 0) {
    where.name = { contains: filter.search.trim(), mode: 'insensitive' };
  }
  return where;
}

/** Pure resolver for catalogItems Relay connection. */
export async function resolveCatalogItems(
  query: object,
  ctx: RequestContext,
  filter: CatalogItemFilterArgs | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  const where = buildCatalogItemWhere(ctx.auth.tenant.id, filter);
  return ctx.prisma.menuItem.findMany({
    ...query,
    where,
    orderBy: { name: 'asc' },
  });
}

/** Pure resolver for catalogItem(id). */
export async function resolveCatalogItem(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  return ctx.prisma.menuItem.findFirst({
    ...query,
    where: { id, tenantId: ctx.auth.tenant.id },
  });
}

builder.queryField('catalogItems', (t) =>
  t.prismaConnection({
    type: 'MenuItem',
    cursor: 'id',
    description: 'Menu items within the current tenant. Requires manager role.',
    authScopes: { manager: true },
    args: { filter: t.arg({ type: CatalogItemFilter, required: false }) },
    resolve: (query, _root, args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const where = buildCatalogItemWhere(
        ctx.auth.tenant.id,
        args.filter as CatalogItemFilterArgs | null | undefined,
      );
      return ctx.prisma.menuItem.findMany({
        ...query,
        where,
        orderBy: { name: 'asc' },
      });
    },
    totalCount: (_root, args, ctx) => {
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const where = buildCatalogItemWhere(
        ctx.auth.tenant.id,
        args.filter as CatalogItemFilterArgs | null | undefined,
      );
      return ctx.prisma.menuItem.count({ where });
    },
  }),
);

builder.queryField('catalogItem', (t) =>
  t.prismaField({
    type: 'MenuItem',
    nullable: true,
    description: 'Single menu item by id (tenant-scoped). Requires manager role.',
    authScopes: { manager: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveCatalogItem(query, ctx, args.id as string) as never,
  }),
);
