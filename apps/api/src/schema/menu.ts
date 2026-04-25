import { scheduleSchema, type Schedule } from '@repo/validation/schedule';
import type { RequestContext } from '../context.js';
import { ForbiddenError, NotFoundError } from '../errors.js';
import { resolveItemPrice } from '../menu/pricing.js';
import { isMenuLiveAt, nextScheduleWindow, resolveActiveMenus } from '../menu/schedule.js';
import { builder } from './builder.js';
import {
  resolveEffectivePrice as resolveItemEffectivePriceForViewer,
  type LocationItemRow,
  type MenuItemRow,
} from './menu-item.js';

export type MenuRow = {
  id: string;
  locationId: string;
  name: string;
  description: string | null;
  sortOrder: number;
  schedule: unknown;
  isActive: boolean;
  archivedAt: Date | null;
};

export type MenuSectionItemRow = {
  id: string;
  menuSectionId: string;
  menuItemId: string;
  sortOrder: number;
  priceOverrideCents: number | null;
  archivedAt: Date | null;
};

/**
 * Pure helper: parse `schedule` JSON into a typed `Schedule` or null on failure.
 */
export function parseScheduleJson(raw: unknown): Schedule | null {
  if (raw === null || raw === undefined) return { kind: 'always' };
  const result = scheduleSchema.safeParse(raw);
  return result.success ? result.data : null;
}

/**
 * Pure resolver: is the given menu currently live for the viewer?
 * Returns false if the viewer has no resolved location, the menu is not at
 * that location, or the schedule fails to parse.
 */
export function resolveMenuIsLive(args: {
  menu: MenuRow;
  viewerLocation: { id: string; timezone: string } | null;
  at: Date;
}): boolean {
  const { menu, viewerLocation, at } = args;
  if (!viewerLocation) return false;
  if (viewerLocation.id !== menu.locationId) return false;
  const schedule = parseScheduleJson(menu.schedule);
  if (!schedule) return false;
  return isMenuLiveAt({ schedule, timezone: viewerLocation.timezone, at });
}

/**
 * Pure resolver for the `nextWindow` field. Same scoping rules as `resolveMenuIsLive`.
 */
export function resolveMenuNextWindow(args: {
  menu: MenuRow;
  viewerLocation: { id: string; timezone: string } | null;
  at: Date;
}): { start: Date; end: Date } | null {
  const { menu, viewerLocation, at } = args;
  if (!viewerLocation) return null;
  if (viewerLocation.id !== menu.locationId) return null;
  const schedule = parseScheduleJson(menu.schedule);
  if (!schedule) return null;
  return nextScheduleWindow({ schedule, timezone: viewerLocation.timezone, at });
}

/**
 * Pure resolver: filter all `isActive` menus down to those currently live at
 * `at`, in the viewer's timezone, ordered by sortOrder.
 */
export function resolveLocationActiveMenus(args: {
  menus: MenuRow[];
  timezone: string;
  at: Date;
}): MenuRow[] {
  const liveIds = new Set(
    resolveActiveMenus({
      menus: args.menus
        .map((m) => ({
          id: m.id,
          isActive: m.isActive,
          schedule: parseScheduleJson(m.schedule),
        }))
        .filter((m): m is { id: string; isActive: boolean; schedule: Schedule } => m.schedule !== null),
      timezone: args.timezone,
      at: args.at,
    }),
  );
  return args.menus
    .filter((m) => liveIds.has(m.id))
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Pure resolver: effective price for a menu section item. Combines section
 * override (top), location override (middle), base price (bottom).
 */
export function resolveMenuSectionItemEffectivePrice(args: {
  basePriceCents: number;
  locationOverride: { priceCents: number | null } | null;
  sectionOverride: { priceOverrideCents: number | null } | null;
}): number {
  return resolveItemPrice(args);
}

const ScheduleWindowRef = builder.objectRef<{ start: Date; end: Date }>('ScheduleWindow');
ScheduleWindowRef.implement({
  description: 'A concrete time window with absolute UTC bounds.',
  fields: (t) => ({
    start: t.expose('start', { type: 'DateTime' }),
    end: t.expose('end', { type: 'DateTime' }),
  }),
});

export const MenuSectionItemRef = builder.prismaObject('MenuSectionItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    sortOrder: t.exposeInt('sortOrder'),
    priceOverrideCents: t.exposeInt('priceOverrideCents', { nullable: true }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    menuItem: t.relation('menuItem', { authScopes: { manager: true } }),
    effectivePriceCents: t.field({
      type: 'Int',
      authScopes: { authenticated: true },
      resolve: async (parent, _args, ctx) => {
        const row = parent as MenuSectionItemRow;
        const item = (await ctx.prisma.menuItem.findUnique({
          where: { id: row.menuItemId },
          select: { id: true, tenantId: true, basePriceCents: true, archivedAt: true },
        })) as MenuItemRow | null;
        if (!item) throw new NotFoundError('Menu item not found');
        // Reuse the per-request loader by calling the standard helper, then layer
        // the section override on top via `resolveItemPrice`. Anonymous viewers
        // skip the location override.
        let locationOverride: LocationItemRow | null = null;
        if (ctx.auth.kind === 'authenticated' && ctx.auth.location) {
          // Fall through to the in-module loader path used by MenuItem fields.
          // We re-derive via raw query here to keep this resolver self-contained.
          locationOverride = (await ctx.prisma.locationItem.findUnique({
            where: {
              locationId_menuItemId: {
                locationId: ctx.auth.location.id,
                menuItemId: item.id,
              },
            },
            select: {
              id: true,
              locationId: true,
              menuItemId: true,
              hidden: true,
              available: true,
              priceCents: true,
            },
          })) as LocationItemRow | null;
        }
        return resolveItemPrice({
          basePriceCents: item.basePriceCents,
          locationOverride: locationOverride ? { priceCents: locationOverride.priceCents } : null,
          sectionOverride: { priceOverrideCents: row.priceOverrideCents },
        });
      },
    }),
  }),
});

export const MenuSectionRef = builder.prismaObject('MenuSection', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    sortOrder: t.exposeInt('sortOrder'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    items: t.relation('items', {
      authScopes: { manager: true },
      query: { orderBy: { sortOrder: 'asc' } },
    }),
  }),
});

export const MenuRef = builder.prismaObject('Menu', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description', { nullable: true }),
    sortOrder: t.exposeInt('sortOrder'),
    schedule: t.expose('schedule', { type: 'JSON', nullable: true }),
    isActive: t.exposeBoolean('isActive'),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    sections: t.relation('sections', {
      authScopes: { manager: true },
      query: { orderBy: { sortOrder: 'asc' } },
    }),
    isLive: t.field({
      type: 'Boolean',
      authScopes: { authenticated: true },
      resolve: (parent, _args, ctx) =>
        resolveMenuIsLive({
          menu: parent as MenuRow,
          viewerLocation:
            ctx.auth.kind === 'authenticated' && ctx.auth.location
              ? { id: ctx.auth.location.id, timezone: ctx.auth.location.timezone }
              : null,
          at: new Date(),
        }),
    }),
    nextWindow: t.field({
      type: ScheduleWindowRef,
      nullable: true,
      authScopes: { authenticated: true },
      resolve: (parent, _args, ctx) =>
        resolveMenuNextWindow({
          menu: parent as MenuRow,
          viewerLocation:
            ctx.auth.kind === 'authenticated' && ctx.auth.location
              ? { id: ctx.auth.location.id, timezone: ctx.auth.location.timezone }
              : null,
          at: new Date(),
        }),
    }),
  }),
});

// Mark the unused import as referenced so TS doesn't complain.
void resolveItemEffectivePriceForViewer;

/** Pure resolver for `Query.locationMenus`. */
export async function resolveLocationMenus(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.menu.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id, archivedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
}

/** Pure resolver for `Query.locationMenu(id)`. */
export async function resolveLocationMenu(
  query: object,
  ctx: RequestContext,
  id: string,
): Promise<unknown | null> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.menu.findFirst({
    ...query,
    where: { id, locationId: ctx.auth.location.id },
  });
}

/** Pure resolver for `Query.locationActiveMenus(at)`. */
export async function resolveLocationActiveMenusQuery(
  query: object,
  ctx: RequestContext,
  at: Date | null | undefined,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  const now = at ?? new Date();
  const rows = (await ctx.prisma.menu.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id, archivedAt: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
  })) as MenuRow[];
  return resolveLocationActiveMenus({
    menus: rows,
    timezone: ctx.auth.location.timezone,
    at: now,
  });
}

/** Pure resolver for `Query.locationOverrides`. */
export async function resolveLocationOverrides(
  query: object,
  ctx: RequestContext,
): Promise<unknown[]> {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location) throw new ForbiddenError('A location context is required');
  return ctx.prisma.locationItem.findMany({
    ...query,
    where: { locationId: ctx.auth.location.id },
    orderBy: { createdAt: 'desc' },
  });
}

builder.queryField('locationMenus', (t) =>
  t.prismaField({
    type: ['Menu'],
    description: "All non-archived menus at the viewer's location. Requires manager role.",
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => resolveLocationMenus(query, ctx) as never,
  }),
);

builder.queryField('locationMenu', (t) =>
  t.prismaField({
    type: 'Menu',
    nullable: true,
    description: "Single menu by id, scoped to the viewer's location. Requires manager role.",
    authScopes: { manager: true },
    args: { id: t.arg({ type: 'UUID', required: true }) },
    resolve: (query, _root, args, ctx) =>
      resolveLocationMenu(query, ctx, args.id as string) as never,
  }),
);

builder.queryField('locationActiveMenus', (t) =>
  t.prismaField({
    type: ['Menu'],
    description: 'Menus that are active and live at the given moment. Defaults to now.',
    authScopes: { manager: true },
    args: { at: t.arg({ type: 'DateTime', required: false }) },
    resolve: (query, _root, args, ctx) =>
      resolveLocationActiveMenusQuery(query, ctx, args.at as Date | null | undefined) as never,
  }),
);

builder.queryField('locationOverrides', (t) =>
  t.prismaField({
    type: ['LocationItem'],
    description: "All LocationItem rows at the viewer's location. Requires manager role.",
    authScopes: { manager: true },
    resolve: (query, _root, _args, ctx) => resolveLocationOverrides(query, ctx) as never,
  }),
);
