import { z } from 'zod';
import { writeAudit } from '../audit.js';
import type { RequestContext } from '../context.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
} from '../errors.js';
import { builder } from './builder.js';
import { StockMovementKindEnum } from './enums.js';

/**
 * Inventory domain.
 *
 * Tenant-scoped entities:
 *   - Vendor (supplier directory)
 *   - Ingredient (raw stock catalog: name + unit + cost/unit + default vendor)
 *   - RecipeItem (menuItem → ingredient + quantity-per-unit-sold)
 *
 * Per-location state:
 *   - IngredientStock (current quantity-on-hand, low-stock threshold)
 *   - StockMovement (ledger of every change: RESTOCK / SALE_DEDUCT / WASTE /
 *     COUNT_ADJUST / TRANSFER_IN / TRANSFER_OUT)
 *
 * SALE_DEDUCT movements are written automatically by processPayment via
 * `deductInventoryForTicket`. Everything else is recorded via
 * `recordStockMovement` (manager+).
 *
 * Recipes are configured per menu item by `setRecipe` (manager+).
 */

const MANAGER_ROLES: readonly string[] = ['OWNER', 'ADMIN', 'MANAGER'];

function requireManager(ctx: RequestContext): {
  tenantId: string;
  locationId: string | null;
} {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!MANAGER_ROLES.includes(ctx.auth.role))
    throw new ForbiddenError('Only managers can manage inventory.');
  return {
    tenantId: ctx.auth.tenant.id,
    locationId: ctx.auth.location?.id ?? null,
  };
}

function requireStaff(ctx: RequestContext): {
  tenantId: string;
  locationId: string;
} {
  if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
  if (!ctx.auth.location)
    throw new ForbiddenError('A location context is required');
  return { tenantId: ctx.auth.tenant.id, locationId: ctx.auth.location.id };
}

const upsertVendorSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  contactName: z.string().trim().max(120).optional().nullable(),
  contactPhone: z.string().trim().max(40).optional().nullable(),
  contactEmail: z.string().trim().email().max(254).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

const upsertIngredientSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().min(1).max(20),
  costPerUnitCents: z.number().int().min(0).max(1_000_000).optional().nullable(),
  defaultVendorId: z.string().uuid().optional().nullable(),
});

const recipeItemSchema = z.object({
  ingredientId: z.string().uuid(),
  quantity: z.number().positive().max(10_000),
});

const setRecipeSchema = z.object({
  menuItemId: z.string().uuid(),
  items: z.array(recipeItemSchema).max(100),
});

const recordMovementSchema = z.object({
  ingredientId: z.string().uuid(),
  kind: z.enum(['RESTOCK', 'WASTE', 'COUNT_ADJUST', 'TRANSFER_IN', 'TRANSFER_OUT']),
  /** Signed quantity. RESTOCK / TRANSFER_IN must be positive,
   *  WASTE / TRANSFER_OUT must be negative; COUNT_ADJUST can be either. */
  quantity: z.number().refine((v) => v !== 0, 'Quantity cannot be zero'),
  note: z.string().trim().max(500).optional().nullable(),
  vendorId: z.string().uuid().optional().nullable(),
  costPerUnitCents: z.number().int().min(0).max(1_000_000).optional().nullable(),
});

const setLowStockThresholdSchema = z.object({
  ingredientId: z.string().uuid(),
  lowStockThreshold: z.number().min(0).max(1_000_000).optional().nullable(),
});

// ── Object types ───────────────────────────────────────

builder.prismaObject('Vendor', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    contactName: t.exposeString('contactName', { nullable: true }),
    contactPhone: t.exposeString('contactPhone', { nullable: true }),
    contactEmail: t.exposeString('contactEmail', { nullable: true }),
    notes: t.exposeString('notes', { nullable: true }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
  }),
});

builder.prismaObject('Ingredient', {
  fields: (t) => ({
    id: t.exposeID('id'),
    name: t.exposeString('name'),
    unit: t.exposeString('unit'),
    costPerUnitCents: t.exposeInt('costPerUnitCents', { nullable: true }),
    defaultVendor: t.relation('defaultVendor', {
      authScopes: { manager: true },
      nullable: true,
    }),
    archivedAt: t.expose('archivedAt', { type: 'DateTime', nullable: true }),
  }),
});

builder.prismaObject('RecipeItem', {
  fields: (t) => ({
    id: t.exposeID('id'),
    quantity: t.exposeFloat('quantity'),
    ingredient: t.relation('ingredient', { authScopes: { manager: true } }),
  }),
});

builder.prismaObject('IngredientStock', {
  fields: (t) => ({
    id: t.exposeID('id'),
    quantity: t.exposeFloat('quantity'),
    lowStockThreshold: t.exposeFloat('lowStockThreshold', { nullable: true }),
    ingredient: t.relation('ingredient', { authScopes: { staff: true } }),
    updatedAt: t.expose('updatedAt', { type: 'DateTime' }),
  }),
});

builder.prismaObject('StockMovement', {
  fields: (t) => ({
    id: t.exposeID('id'),
    kind: t.field({ type: StockMovementKindEnum, resolve: (p) => p.kind }),
    quantity: t.exposeFloat('quantity'),
    note: t.exposeString('note', { nullable: true }),
    costPerUnitCents: t.exposeInt('costPerUnitCents', { nullable: true }),
    createdAt: t.expose('createdAt', { type: 'DateTime' }),
    ingredient: t.relation('ingredient', { authScopes: { staff: true } }),
    vendor: t.relation('vendor', { authScopes: { manager: true }, nullable: true }),
    createdBy: t.relation('createdBy', {
      authScopes: { manager: true },
      nullable: true,
    }),
    ticket: t.relation('ticket', { authScopes: { manager: true }, nullable: true }),
  }),
});

// ── Queries ───────────────────────────────────────────

builder.queryField('vendors', (t) =>
  t.prismaField({
    type: ['Vendor'],
    description: 'Active vendors for the tenant. Manager+ only.',
    authScopes: { manager: true },
    resolve: async (query, _root, _args, ctx) => {
      const { tenantId } = requireManager(ctx);
      return ctx.prisma.vendor.findMany({
        ...query,
        where: { tenantId, archivedAt: null },
        orderBy: { name: 'asc' },
      });
    },
  }),
);

builder.queryField('ingredients', (t) =>
  t.prismaField({
    type: ['Ingredient'],
    description: 'Active ingredients catalog for the tenant. Manager+ only.',
    authScopes: { manager: true },
    resolve: async (query, _root, _args, ctx) => {
      const { tenantId } = requireManager(ctx);
      return ctx.prisma.ingredient.findMany({
        ...query,
        where: { tenantId, archivedAt: null },
        orderBy: { name: 'asc' },
      });
    },
  }),
);

builder.queryField('recipeForMenuItem', (t) =>
  t.prismaField({
    type: ['RecipeItem'],
    description: "Recipe items defined for a menu item. Manager+ only.",
    authScopes: { manager: true },
    args: { menuItemId: t.arg({ type: 'UUID', required: true }) },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId } = requireManager(ctx);
      // Confirm the menu item belongs to this tenant.
      const menuItem = await ctx.prisma.menuItem.findFirst({
        where: { id: args.menuItemId, tenantId },
        select: { id: true },
      });
      if (!menuItem) throw new NotFoundError('Menu item not found.');
      return ctx.prisma.recipeItem.findMany({
        ...query,
        where: { menuItemId: menuItem.id },
        orderBy: { createdAt: 'asc' },
      });
    },
  }),
);

builder.queryField('ingredientStocks', (t) =>
  t.prismaField({
    type: ['IngredientStock'],
    description:
      "Current stock-on-hand for every active ingredient at the viewer's location. Staff-visible.",
    authScopes: { staff: true },
    resolve: async (query, _root, _args, ctx) => {
      const { locationId } = requireStaff(ctx);
      return ctx.prisma.ingredientStock.findMany({
        ...query,
        where: { locationId, ingredient: { archivedAt: null } },
        orderBy: { quantity: 'asc' },
      });
    },
  }),
);

builder.queryField('stockMovements', (t) =>
  t.prismaField({
    type: ['StockMovement'],
    description:
      "Recent stock-movement ledger entries at the viewer's location, newest first. Manager+ only.",
    authScopes: { manager: true },
    args: {
      ingredientId: t.arg({ type: 'UUID', required: false }),
      limit: t.arg.int({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { locationId } = requireStaff(ctx);
      const limit = Math.max(1, Math.min(500, args.limit ?? 100));
      return ctx.prisma.stockMovement.findMany({
        ...query,
        where: {
          locationId,
          ...(args.ingredientId ? { ingredientId: args.ingredientId } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    },
  }),
);

// ── Mutations ─────────────────────────────────────────

builder.mutationField('upsertVendor', (t) =>
  t.prismaField({
    type: 'Vendor',
    description: 'Create / update a vendor for the tenant. Manager+ only.',
    authScopes: { manager: true },
    args: {
      id: t.arg({ type: 'UUID', required: false }),
      name: t.arg.string({ required: true }),
      contactName: t.arg.string({ required: false }),
      contactPhone: t.arg.string({ required: false }),
      contactEmail: t.arg.string({ required: false }),
      notes: t.arg.string({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId } = requireManager(ctx);
      const parsed = upsertVendorSchema.safeParse({
        id: args.id ?? null,
        name: args.name,
        contactName: args.contactName ?? null,
        contactPhone: args.contactPhone ?? null,
        contactEmail: args.contactEmail ?? null,
        notes: args.notes ?? null,
      });
      if (!parsed.success)
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );
      const data = {
        tenantId,
        name: parsed.data.name,
        contactName: parsed.data.contactName,
        contactPhone: parsed.data.contactPhone,
        contactEmail: parsed.data.contactEmail,
        notes: parsed.data.notes,
      };
      const vendor = parsed.data.id
        ? await ctx.prisma.vendor.update({
            ...query,
            where: { id: parsed.data.id },
            data,
          })
        : await ctx.prisma.vendor.create({ ...query, data });
      await writeAudit(ctx, {
        action: parsed.data.id ? 'update_vendor' : 'create_vendor',
        resourceType: 'Vendor',
        resourceId: vendor.id,
      });
      return vendor;
    },
  }),
);

builder.mutationField('upsertIngredient', (t) =>
  t.prismaField({
    type: 'Ingredient',
    description: 'Create / update an ingredient in the tenant catalog. Manager+ only.',
    authScopes: { manager: true },
    args: {
      id: t.arg({ type: 'UUID', required: false }),
      name: t.arg.string({ required: true }),
      unit: t.arg.string({ required: true }),
      costPerUnitCents: t.arg.int({ required: false }),
      defaultVendorId: t.arg({ type: 'UUID', required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId } = requireManager(ctx);
      const parsed = upsertIngredientSchema.safeParse({
        id: args.id ?? null,
        name: args.name,
        unit: args.unit,
        costPerUnitCents: args.costPerUnitCents ?? null,
        defaultVendorId: args.defaultVendorId ?? null,
      });
      if (!parsed.success)
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );
      // Validate vendor belongs to tenant if provided.
      if (parsed.data.defaultVendorId) {
        const v = await ctx.prisma.vendor.findFirst({
          where: { id: parsed.data.defaultVendorId, tenantId },
          select: { id: true },
        });
        if (!v) throw new AppError('BAD_INPUT', 'Default vendor not found.');
      }
      const data = {
        tenantId,
        name: parsed.data.name,
        unit: parsed.data.unit,
        costPerUnitCents: parsed.data.costPerUnitCents,
        defaultVendorId: parsed.data.defaultVendorId,
      };
      const ing = parsed.data.id
        ? await ctx.prisma.ingredient.update({
            ...query,
            where: { id: parsed.data.id },
            data,
          })
        : await ctx.prisma.ingredient.create({ ...query, data });
      await writeAudit(ctx, {
        action: parsed.data.id ? 'update_ingredient' : 'create_ingredient',
        resourceType: 'Ingredient',
        resourceId: ing.id,
      });
      return ing;
    },
  }),
);

builder.mutationField('setRecipe', (t) =>
  t.prismaField({
    type: ['RecipeItem'],
    description:
      'Replace the recipe for a menu item with the given list (each entry: ingredientId + quantity). Manager+ only.',
    authScopes: { manager: true },
    args: {
      menuItemId: t.arg({ type: 'UUID', required: true }),
      items: t.arg({ type: 'JSON', required: true }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId } = requireManager(ctx);
      const parsed = setRecipeSchema.safeParse({
        menuItemId: args.menuItemId,
        items: args.items,
      });
      if (!parsed.success)
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );

      // Ensure menu item + every ingredient belong to this tenant.
      const menuItem = await ctx.prisma.menuItem.findFirst({
        where: { id: parsed.data.menuItemId, tenantId },
        select: { id: true },
      });
      if (!menuItem) throw new NotFoundError('Menu item not found.');
      const ingredientIds = [...new Set(parsed.data.items.map((i) => i.ingredientId))];
      const valid = await ctx.prisma.ingredient.count({
        where: { tenantId, id: { in: ingredientIds } },
      });
      if (valid !== ingredientIds.length)
        throw new AppError('BAD_INPUT', 'One or more ingredients not found.');

      const updated = await ctx.prisma.$transaction(async (tx) => {
        await tx.recipeItem.deleteMany({ where: { menuItemId: menuItem.id } });
        if (parsed.data.items.length > 0) {
          await tx.recipeItem.createMany({
            data: parsed.data.items.map((it) => ({
              menuItemId: menuItem.id,
              ingredientId: it.ingredientId,
              quantity: it.quantity,
            })),
          });
        }
        return tx.recipeItem.findMany({
          ...query,
          where: { menuItemId: menuItem.id },
          orderBy: { createdAt: 'asc' },
        });
      });
      await writeAudit(ctx, {
        action: 'set_recipe',
        resourceType: 'MenuItem',
        resourceId: menuItem.id,
        metadata: { items: parsed.data.items },
      });
      return updated;
    },
  }),
);

builder.mutationField('recordStockMovement', (t) =>
  t.prismaField({
    type: 'StockMovement',
    description:
      "Record a manual stock movement (RESTOCK / WASTE / COUNT_ADJUST / TRANSFER_*). Updates the ingredient's running stock-on-hand atomically. Manager+ only.",
    authScopes: { manager: true },
    args: {
      ingredientId: t.arg({ type: 'UUID', required: true }),
      kind: t.arg({ type: StockMovementKindEnum, required: true }),
      quantity: t.arg.float({ required: true }),
      note: t.arg.string({ required: false }),
      vendorId: t.arg({ type: 'UUID', required: false }),
      costPerUnitCents: t.arg.int({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireStaff(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      const role = ctx.auth.role;
      if (!MANAGER_ROLES.includes(role))
        throw new ForbiddenError('Only managers can record stock movements.');
      // SALE_DEDUCT is server-internal, never accept it via API.
      if (args.kind === 'SALE_DEDUCT')
        throw new ForbiddenError(
          'SALE_DEDUCT is automatic — record manual movements only.',
        );
      const parsed = recordMovementSchema.safeParse({
        ingredientId: args.ingredientId,
        kind: args.kind,
        quantity: args.quantity,
        note: args.note ?? null,
        vendorId: args.vendorId ?? null,
        costPerUnitCents: args.costPerUnitCents ?? null,
      });
      if (!parsed.success)
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );
      // Sign rules per kind.
      const q = parsed.data.quantity;
      const requirePositive = parsed.data.kind === 'RESTOCK' || parsed.data.kind === 'TRANSFER_IN';
      const requireNegative = parsed.data.kind === 'WASTE' || parsed.data.kind === 'TRANSFER_OUT';
      if (requirePositive && q < 0)
        throw new AppError('BAD_INPUT', `${parsed.data.kind} requires a positive quantity.`);
      if (requireNegative && q > 0)
        throw new AppError('BAD_INPUT', `${parsed.data.kind} requires a negative quantity.`);

      // Ingredient must belong to tenant.
      const ing = await ctx.prisma.ingredient.findFirst({
        where: { id: parsed.data.ingredientId, tenantId },
        select: { id: true, costPerUnitCents: true },
      });
      if (!ing) throw new NotFoundError('Ingredient not found.');

      const result = await ctx.prisma.$transaction(async (tx) => {
        const movement = await tx.stockMovement.create({
          ...query,
          data: {
            tenantId,
            locationId,
            ingredientId: ing.id,
            kind: parsed.data.kind,
            quantity: q,
            note: parsed.data.note,
            vendorId: parsed.data.vendorId,
            costPerUnitCents: parsed.data.costPerUnitCents ?? ing.costPerUnitCents,
            createdById: ctx.auth.kind === 'authenticated' ? ctx.auth.user.id : null,
          },
        });
        await tx.ingredientStock.upsert({
          where: { ingredientId_locationId: { ingredientId: ing.id, locationId } },
          create: {
            ingredientId: ing.id,
            locationId,
            quantity: q,
          },
          update: { quantity: { increment: q } },
        });
        return movement;
      });
      await writeAudit(ctx, {
        action: 'record_stock_movement',
        resourceType: 'StockMovement',
        resourceId: result.id,
        metadata: { kind: parsed.data.kind, quantity: q },
      });
      return result;
    },
  }),
);

builder.mutationField('setLowStockThreshold', (t) =>
  t.prismaField({
    type: 'IngredientStock',
    description:
      "Set or clear the low-stock alert threshold for an ingredient at the viewer's location. Manager+ only.",
    authScopes: { manager: true },
    args: {
      ingredientId: t.arg({ type: 'UUID', required: true }),
      lowStockThreshold: t.arg.float({ required: false }),
    },
    resolve: async (query, _root, args, ctx) => {
      const { tenantId, locationId } = requireStaff(ctx);
      if (ctx.auth.kind !== 'authenticated') throw new ForbiddenError();
      if (!MANAGER_ROLES.includes(ctx.auth.role))
        throw new ForbiddenError('Only managers can change thresholds.');
      const parsed = setLowStockThresholdSchema.safeParse({
        ingredientId: args.ingredientId,
        lowStockThreshold: args.lowStockThreshold ?? null,
      });
      if (!parsed.success)
        throw new AppError(
          'BAD_INPUT',
          parsed.error.issues[0]?.message ?? 'Invalid input',
        );
      const ing = await ctx.prisma.ingredient.findFirst({
        where: { id: parsed.data.ingredientId, tenantId },
        select: { id: true },
      });
      if (!ing) throw new NotFoundError('Ingredient not found.');
      const row = await ctx.prisma.ingredientStock.upsert({
        ...query,
        where: { ingredientId_locationId: { ingredientId: ing.id, locationId } },
        create: {
          ingredientId: ing.id,
          locationId,
          quantity: 0,
          lowStockThreshold: parsed.data.lowStockThreshold,
        },
        update: { lowStockThreshold: parsed.data.lowStockThreshold ?? null },
      });
      await writeAudit(ctx, {
        action: 'set_low_stock_threshold',
        resourceType: 'IngredientStock',
        resourceId: row.id,
        metadata: { threshold: parsed.data.lowStockThreshold },
      });
      return row;
    },
  }),
);
