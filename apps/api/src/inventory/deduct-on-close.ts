import type { Prisma } from '@repo/db';

/**
 * Inventory auto-deduction hook.
 *
 * Called inside the same `$transaction` that closes a ticket (from
 * `processPayment`). For every non-voided TicketItem whose menu item has a
 * recipe, write a SALE_DEDUCT StockMovement and decrement the matching
 * IngredientStock row.
 *
 * Side effects only — caller doesn't read a return value. If a stock row
 * doesn't exist yet for the (ingredient, location) pair we upsert it to 0
 * minus the deduction; that surfaces as a negative quantity which the UI
 * flags so staff can do a count adjustment.
 *
 * Implementation note: the inner queries use the transaction client `tx`
 * passed in, NOT `prisma`. Calling `prisma.x` here would skip the txn and
 * the inventory deduction wouldn't roll back if a later tender errored.
 */
export async function deductInventoryForTicket(args: {
  tx: Prisma.TransactionClient;
  ticketId: string;
  locationId: string;
  tenantId: string;
}): Promise<void> {
  const { tx, ticketId, locationId, tenantId } = args;

  // Pull non-voided ticket items with their menuItem.id, then resolve
  // recipe items per menuItem in one go. Two queries vs. an include because
  // RecipeItem joins to Ingredient → cost capture.
  const lines = await tx.ticketItem.findMany({
    where: { ticketId, status: { not: 'VOIDED' } },
    select: { quantity: true, menuItemId: true },
  });
  if (lines.length === 0) return;
  const menuItemIds = [...new Set(lines.map((l) => l.menuItemId))];

  const recipeItems = await tx.recipeItem.findMany({
    where: { menuItemId: { in: menuItemIds } },
    select: {
      ingredientId: true,
      quantity: true,
      menuItemId: true,
      ingredient: { select: { costPerUnitCents: true } },
    },
  });
  if (recipeItems.length === 0) return;

  // Accumulate deduction per ingredient across all lines. e.g. ticket with
  // two burgers + one fries that share "oil" all deduct in one combined row.
  const byIngredient = new Map<
    string,
    { quantity: number; costPerUnitCents: number | null }
  >();
  for (const line of lines) {
    const recipesForLine = recipeItems.filter(
      (r) => r.menuItemId === line.menuItemId,
    );
    for (const r of recipesForLine) {
      const acc =
        byIngredient.get(r.ingredientId) ?? {
          quantity: 0,
          costPerUnitCents: r.ingredient.costPerUnitCents ?? null,
        };
      acc.quantity += line.quantity * r.quantity;
      byIngredient.set(r.ingredientId, acc);
    }
  }

  for (const [ingredientId, { quantity, costPerUnitCents }] of byIngredient) {
    // Write the ledger row (negative = stock out).
    await tx.stockMovement.create({
      data: {
        tenantId,
        locationId,
        ingredientId,
        kind: 'SALE_DEDUCT',
        quantity: -quantity,
        ticketId,
        costPerUnitCents,
        // createdById intentionally null — this is server-generated.
      },
    });
    // Upsert the running stock row. If it didn't exist, we set the initial
    // quantity to -deduction so the UI can flag a negative balance.
    await tx.ingredientStock.upsert({
      where: { ingredientId_locationId: { ingredientId, locationId } },
      create: {
        ingredientId,
        locationId,
        quantity: -quantity,
      },
      update: { quantity: { decrement: quantity } },
    });
  }
}
