import type { PrismaClient } from '@repo/db';
import type { RequestContext } from '../context.js';
import { NotFoundError } from '../errors.js';
import { resolveItemPrice, resolveModifierPrice } from '../menu/pricing.js';
import { builder } from './builder.js';
import {
  parseScheduleJson,
  resolveLocationActiveMenus,
  type MenuRow,
} from './menu.js';

// Internal types for the projection layer.
export interface PublicLocationData {
  id: string;
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  tenantName: string;
  tenantId: string;
  locationId: string;
}

export interface PublicMenuData {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  sections: PublicMenuSectionData[];
}

export interface PublicMenuSectionData {
  id: string;
  name: string;
  sortOrder: number;
  items: PublicMenuItemData[];
}

export interface PublicMenuItemData {
  id: string;
  name: string;
  shortDescription: string | null;
  description: string | null;
  imageUrl: string | null;
  effectivePriceCents: number;
  available: boolean;
  dietaryTags: string[];
  modifierGroups: PublicModifierGroupData[];
}

export interface PublicModifierGroupData {
  id: string;
  name: string;
  minSelections: number;
  maxSelections: number;
  modifiers: PublicModifierData[];
}

export interface PublicModifierData {
  id: string;
  name: string;
  priceDeltaCents: number;
  available: boolean;
}

/** Pure resolver for `Query.publicLocationBySlug`. Anonymous-allowed lookup. */
export async function resolvePublicLocationBySlug(
  prisma: Pick<PrismaClient, 'tenant' | 'location'>,
  tenantSlug: string,
  locationSlug: string,
): Promise<PublicLocationData | null> {
  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug },
    select: { id: true, name: true, status: true },
  });
  if (!tenant || tenant.status !== 'ACTIVE') return null;
  const location = await prisma.location.findFirst({
    where: { tenantId: tenant.id, slug: locationSlug, status: 'ACTIVE' },
    select: { id: true, name: true, slug: true, timezone: true, currency: true },
  });
  if (!location) return null;
  return {
    id: location.id,
    name: location.name,
    slug: location.slug,
    timezone: location.timezone,
    currency: location.currency,
    tenantName: tenant.name,
    tenantId: tenant.id,
    locationId: location.id,
  };
}

/** Pure: load active menus + sanitize for public consumption. */
export async function loadPublicActiveMenus(
  prisma: Pick<
    PrismaClient,
    'menu' | 'menuSection' | 'menuSectionItem' | 'menuItem' | 'locationItem' | 'menuItemModifierGroup' | 'modifier' | 'locationModifier'
  >,
  args: { tenantId: string; locationId: string; timezone: string; at: Date },
): Promise<PublicMenuData[]> {
  const rows = (await prisma.menu.findMany({
    where: { locationId: args.locationId, archivedAt: null, isActive: true },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      locationId: true,
      name: true,
      description: true,
      sortOrder: true,
      schedule: true,
      isActive: true,
      archivedAt: true,
    },
  })) as Array<MenuRow & { name: string; description: string | null }>;
  const live = resolveLocationActiveMenus({
    menus: rows,
    timezone: args.timezone,
    at: args.at,
  });
  if (live.length === 0) return [];

  const sections = (await prisma.menuSection.findMany({
    where: {
      menuId: { in: live.map((m) => m.id) },
      archivedAt: null,
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      menuId: true,
      name: true,
      sortOrder: true,
    },
  })) as Array<{ id: string; menuId: string; name: string; sortOrder: number }>;

  const sectionItems = (await prisma.menuSectionItem.findMany({
    where: {
      menuSectionId: { in: sections.map((s) => s.id) },
      archivedAt: null,
    },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true,
      menuSectionId: true,
      menuItemId: true,
      sortOrder: true,
      priceOverrideCents: true,
    },
  })) as Array<{
    id: string;
    menuSectionId: string;
    menuItemId: string;
    sortOrder: number;
    priceOverrideCents: number | null;
  }>;

  const itemIds = Array.from(new Set(sectionItems.map((si) => si.menuItemId)));
  if (itemIds.length === 0) {
    return live.map((m) => ({
      id: m.id,
      name: (m as { name: string }).name,
      description: (m as { description: string | null }).description,
      sortOrder: m.sortOrder,
      sections: [],
    }));
  }

  const menuItems = (await prisma.menuItem.findMany({
    where: { id: { in: itemIds }, tenantId: args.tenantId, archivedAt: null },
    select: {
      id: true,
      name: true,
      shortDescription: true,
      description: true,
      imageUrl: true,
      basePriceCents: true,
      dietaryTags: true,
    },
  })) as Array<{
    id: string;
    name: string;
    shortDescription: string | null;
    description: string | null;
    imageUrl: string | null;
    basePriceCents: number;
    dietaryTags: string[];
  }>;
  const itemById = new Map(menuItems.map((mi) => [mi.id, mi]));

  const locItems = (await prisma.locationItem.findMany({
    where: { locationId: args.locationId, menuItemId: { in: itemIds } },
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

  const groupAttachments = (await prisma.menuItemModifierGroup.findMany({
    where: { menuItemId: { in: itemIds } },
    select: {
      menuItemId: true,
      modifierGroup: {
        select: {
          id: true,
          name: true,
          minSelections: true,
          maxSelections: true,
        },
      },
    },
  })) as Array<{
    menuItemId: string;
    modifierGroup: {
      id: string;
      name: string;
      minSelections: number;
      maxSelections: number;
    };
  }>;
  const groupIds = Array.from(
    new Set(groupAttachments.map((g) => g.modifierGroup.id)),
  );

  const modifiers =
    groupIds.length === 0
      ? []
      : ((await prisma.modifier.findMany({
          where: {
            modifierGroupId: { in: groupIds },
            archivedAt: null,
          },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            modifierGroupId: true,
            name: true,
            priceDeltaCents: true,
          },
        })) as Array<{
          id: string;
          modifierGroupId: string;
          name: string;
          priceDeltaCents: number;
        }>);

  const locMods =
    modifiers.length === 0
      ? []
      : ((await prisma.locationModifier.findMany({
          where: {
            locationId: args.locationId,
            modifierId: { in: modifiers.map((m) => m.id) },
          },
          select: {
            modifierId: true,
            priceDeltaOverrideCents: true,
            available: true,
            hidden: true,
          },
        })) as Array<{
          modifierId: string;
          priceDeltaOverrideCents: number | null;
          available: boolean;
          hidden: boolean;
        }>);
  const locModBy = new Map(locMods.map((lm) => [lm.modifierId, lm]));

  // Build public modifier groups per item.
  const groupsByItem = new Map<string, PublicModifierGroupData[]>();
  for (const att of groupAttachments) {
    const groupModifiers = modifiers
      .filter((m) => m.modifierGroupId === att.modifierGroup.id)
      .map((m) => {
        const lm = locModBy.get(m.id);
        const delta = resolveModifierPrice({
          basePriceDeltaCents: m.priceDeltaCents,
          locationOverride: lm
            ? { priceDeltaOverrideCents: lm.priceDeltaOverrideCents }
            : null,
        });
        const available = !(lm?.hidden ?? false) && (lm?.available ?? true);
        return {
          id: m.id,
          name: m.name,
          priceDeltaCents: delta,
          available,
        } satisfies PublicModifierData;
      })
      .filter((m) => m.available);
    const list = groupsByItem.get(att.menuItemId) ?? [];
    list.push({
      id: att.modifierGroup.id,
      name: att.modifierGroup.name,
      minSelections: att.modifierGroup.minSelections,
      maxSelections: att.modifierGroup.maxSelections,
      modifiers: groupModifiers,
    });
    groupsByItem.set(att.menuItemId, list);
  }

  const itemsBySection = new Map<string, PublicMenuItemData[]>();
  for (const si of sectionItems) {
    const mi = itemById.get(si.menuItemId);
    if (!mi) continue; // archived; skip
    const li = locItemBy.get(si.menuItemId);
    if (li?.hidden) continue;
    const available = !(li?.hidden ?? false) && (li?.available ?? true);
    const price = resolveItemPrice({
      basePriceCents: mi.basePriceCents,
      locationOverride: li ? { priceCents: li.priceCents } : null,
      sectionOverride: { priceOverrideCents: si.priceOverrideCents },
    });
    const arr = itemsBySection.get(si.menuSectionId) ?? [];
    arr.push({
      id: mi.id,
      name: mi.name,
      shortDescription: mi.shortDescription,
      description: mi.description,
      imageUrl: mi.imageUrl,
      effectivePriceCents: price,
      available,
      dietaryTags: mi.dietaryTags,
      modifierGroups: groupsByItem.get(mi.id) ?? [],
    });
    itemsBySection.set(si.menuSectionId, arr);
  }

  const sectionsByMenu = new Map<string, PublicMenuSectionData[]>();
  for (const s of sections) {
    const arr = sectionsByMenu.get(s.menuId) ?? [];
    arr.push({
      id: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      items: itemsBySection.get(s.id) ?? [],
    });
    sectionsByMenu.set(s.menuId, arr);
  }

  return live.map((m) => ({
    id: m.id,
    name: (m as { name: string }).name,
    description: (m as { description: string | null }).description,
    sortOrder: m.sortOrder,
    sections: sectionsByMenu.get(m.id) ?? [],
  }));
}

// Mark unused import as referenced (stable RequestContext type).
void parseScheduleJson;
void ({} as RequestContext);

// ─── GraphQL types ────────────────────────────────────────────────

const PublicModifierRef = builder.objectRef<PublicModifierData>('PublicModifier');
PublicModifierRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    priceDeltaCents: t.exposeInt('priceDeltaCents'),
    available: t.exposeBoolean('available'),
  }),
});

const PublicModifierGroupRef = builder.objectRef<PublicModifierGroupData>(
  'PublicModifierGroup',
);
PublicModifierGroupRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    minSelections: t.exposeInt('minSelections'),
    maxSelections: t.exposeInt('maxSelections'),
    modifiers: t.field({
      type: [PublicModifierRef],
      resolve: (p) => p.modifiers,
    }),
  }),
});

const PublicMenuItemRef = builder.objectRef<PublicMenuItemData>('PublicMenuItem');
PublicMenuItemRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    shortDescription: t.exposeString('shortDescription', { nullable: true }),
    description: t.exposeString('description', { nullable: true }),
    imageUrl: t.exposeString('imageUrl', { nullable: true }),
    effectivePriceCents: t.exposeInt('effectivePriceCents'),
    available: t.exposeBoolean('available'),
    dietaryTags: t.exposeStringList('dietaryTags'),
    modifierGroups: t.field({
      type: [PublicModifierGroupRef],
      resolve: (p) => p.modifierGroups,
    }),
  }),
});

const PublicMenuSectionRef = builder.objectRef<PublicMenuSectionData>(
  'PublicMenuSection',
);
PublicMenuSectionRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    items: t.field({
      type: [PublicMenuItemRef],
      resolve: (p) => p.items,
    }),
  }),
});

const PublicMenuRef = builder.objectRef<PublicMenuData>('PublicMenu');
PublicMenuRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    description: t.exposeString('description', { nullable: true }),
    sections: t.field({
      type: [PublicMenuSectionRef],
      resolve: (p) => p.sections,
    }),
  }),
});

const PublicLocationRef = builder.objectRef<PublicLocationData>('PublicLocation');
PublicLocationRef.implement({
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    slug: t.exposeString('slug'),
    timezone: t.exposeString('timezone'),
    currency: t.exposeString('currency'),
    tenantName: t.exposeString('tenantName'),
    activeMenus: t.field({
      type: [PublicMenuRef],
      args: { at: t.arg({ type: 'DateTime', required: false }) },
      resolve: async (parent, args, ctx) => {
        const at = (args.at as Date | null | undefined) ?? new Date();
        return loadPublicActiveMenus(ctx.prisma, {
          tenantId: parent.tenantId,
          locationId: parent.locationId,
          timezone: parent.timezone,
          at,
        });
      },
    }),
  }),
});

builder.queryField('publicLocationBySlug', (t) =>
  t.field({
    type: PublicLocationRef,
    nullable: true,
    description:
      'Anonymous lookup of a tenant + location by slug, returning a sanitized public projection.',
    args: {
      tenantSlug: t.arg.string({ required: true }),
      locationSlug: t.arg.string({ required: true }),
    },
    resolve: async (_root, args, ctx) => {
      const out = await resolvePublicLocationBySlug(
        ctx.prisma,
        args.tenantSlug as string,
        args.locationSlug as string,
      );
      if (!out) return null;
      void NotFoundError; // kept for symmetry with other resolvers
      return out;
    },
  }),
);
