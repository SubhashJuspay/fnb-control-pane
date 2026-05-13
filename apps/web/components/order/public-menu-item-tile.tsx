'use client';

import { useState } from 'react';
import { ChefHat, Plus } from 'lucide-react';
import { formatMoney } from '@repo/ui';
import { useCart } from './cart-state';
import { PublicModifierPicker, type PublicMenuItem } from './public-modifier-picker';

export interface PublicMenuItemTileProps {
  item: PublicMenuItem;
  currency: string;
}

const DIETARY_LABEL: Record<string, { short: string; full: string }> = {
  VEGETARIAN: { short: 'V', full: 'Vegetarian' },
  VEGAN: { short: 'VG', full: 'Vegan' },
  GLUTEN_FREE: { short: 'GF', full: 'Gluten-free' },
  DAIRY_FREE: { short: 'DF', full: 'Dairy-free' },
  NUT_FREE: { short: 'NF', full: 'Nut-free' },
  KOSHER: { short: 'K', full: 'Kosher' },
  HALAL: { short: 'H', full: 'Halal' },
  SPICY: { short: 'Sp', full: 'Spicy' },
};

const ALLERGEN_LABEL: Record<string, { short: string; full: string }> = {
  CONTAINS_NUTS: { short: 'Nuts', full: 'Contains nuts' },
  CONTAINS_DAIRY: { short: 'Dairy', full: 'Contains dairy' },
  CONTAINS_GLUTEN: { short: 'Gluten', full: 'Contains gluten' },
  CONTAINS_EGGS: { short: 'Eggs', full: 'Contains eggs' },
  CONTAINS_SOY: { short: 'Soy', full: 'Contains soy' },
  CONTAINS_FISH: { short: 'Fish', full: 'Contains fish' },
  CONTAINS_SHELLFISH: { short: 'Shellfish', full: 'Contains shellfish' },
  CONTAINS_SESAME: { short: 'Sesame', full: 'Contains sesame' },
};

export function PublicMenuItemTile({
  item,
  currency,
}: PublicMenuItemTileProps): React.JSX.Element {
  const { addItem, items: cartItems } = useCart();
  const [open, setOpen] = useState(false);
  const hasModifiers =
    Array.isArray(item.modifierGroups) && (item.modifierGroups?.length ?? 0) > 0;
  const isAvailable = item.available !== false;

  const inCartCount = item.id
    ? cartItems
        .filter((c) => c.menuItemId === item.id)
        .reduce((sum, c) => sum + c.quantity, 0)
    : 0;

  const description = item.shortDescription ?? item.description ?? null;
  const dietary = (item.dietaryTags ?? []).filter((t): t is string => Boolean(t));
  const allergens = (item.allergenTags ?? []).filter((t): t is string => Boolean(t));

  const onClick = (): void => {
    if (!isAvailable) return;
    if (hasModifiers) {
      setOpen(true);
      return;
    }
    if (!item.id || !item.name) return;
    addItem({
      menuItemId: item.id,
      name: item.name,
      unitPriceCents: item.effectivePriceCents ?? 0,
      modifiersTotalCents: 0,
      quantity: 1,
      modifierIds: [],
      modifiers: [],
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={!isAvailable}
        aria-disabled={!isAvailable}
        data-testid={`public-menu-tile-${item.name}`}
        className={[
          'group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-all',
          isAvailable
            ? 'hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md'
            : 'cursor-not-allowed opacity-60',
          inCartCount > 0 ? 'border-primary/60 ring-1 ring-primary/30' : '',
        ].join(' ')}
      >
        {/* Photo on top — Clover-style vertical card. */}
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-br from-muted via-muted to-muted/60">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
              loading="lazy"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full w-full items-center justify-center text-muted-foreground/50"
            >
              <ChefHat className="size-10" />
            </span>
          )}
          {inCartCount > 0 ? (
            <span
              className="absolute right-2 top-2 inline-flex min-w-7 items-center justify-center rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground shadow"
              data-testid={`public-menu-tile-incart-${item.name}`}
            >
              ×{inCartCount}
            </span>
          ) : null}
          {!isAvailable ? (
            <span className="absolute inset-0 flex items-center justify-center bg-foreground/55 text-xs font-semibold uppercase tracking-wide text-background">
              Sold out
            </span>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-2 right-2 inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md transition-transform group-hover:scale-110"
            >
              <Plus className="size-4" strokeWidth={2.5} />
            </span>
          )}
        </div>

        {/* Body below the photo. */}
        <div className="flex flex-1 flex-col gap-1.5 p-3">
          <span className="line-clamp-2 text-sm font-semibold leading-tight">
            {item.name}
          </span>
          {description ? (
            <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">
              {description}
            </span>
          ) : null}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
            <span className="text-base font-bold tabular-nums">
              {formatMoney(item.effectivePriceCents ?? 0, currency)}
            </span>
            {dietary.length + allergens.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                {dietary.map((tag) => {
                  const meta = DIETARY_LABEL[tag] ?? { short: tag, full: tag };
                  return (
                    <span
                      key={`d-${tag}`}
                      title={meta.full}
                      aria-label={meta.full}
                      data-testid={`dietary-tag-${tag}`}
                      className="inline-flex h-5 min-w-5 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
                    >
                      {meta.short}
                    </span>
                  );
                })}
                {allergens.map((tag) => {
                  const meta = ALLERGEN_LABEL[tag] ?? { short: tag, full: tag };
                  return (
                    <span
                      key={`a-${tag}`}
                      title={meta.full}
                      aria-label={meta.full}
                      data-testid={`allergen-tag-${tag}`}
                      className="inline-flex h-5 items-center justify-center rounded-full border border-rose-200 bg-rose-50 px-1.5 text-[10px] font-semibold text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
                    >
                      {meta.short}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      </button>
      {hasModifiers ? (
        <PublicModifierPicker
          item={item}
          open={open}
          onOpenChange={setOpen}
          currency={currency}
        />
      ) : null}
    </>
  );
}
