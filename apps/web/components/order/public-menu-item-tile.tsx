'use client';

import { useState } from 'react';
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
          'group flex flex-col overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left shadow-card-soft transition-all',
          isAvailable
            ? 'hover:-translate-y-0.5 hover:shadow-md'
            : 'cursor-not-allowed opacity-60',
          inCartCount > 0 ? 'ring-2 ring-primary/60' : '',
        ].join(' ')}
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden bg-surface-container">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
              loading="lazy"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-full w-full items-center justify-center text-on-surface-variant/50"
            >
              <span className="material-symbols-outlined text-[48px]">restaurant</span>
            </span>
          )}

          {dietary.length > 0 ? (
            <div className="absolute left-3 top-3 flex gap-1">
              {dietary.slice(0, 1).map((tag) => {
                const meta = DIETARY_LABEL[tag] ?? { short: tag, full: tag };
                return (
                  <span
                    key={`d-badge-${tag}`}
                    title={meta.full}
                    className="rounded bg-surface-container-lowest/90 px-2 py-0.5 font-status-pill text-[10px] uppercase tracking-wider text-on-surface backdrop-blur-sm"
                  >
                    {meta.short}
                  </span>
                );
              })}
            </div>
          ) : null}

          {inCartCount > 0 ? (
            <span
              className="absolute right-3 top-3 inline-flex min-w-7 items-center justify-center rounded-full bg-primary px-2 py-0.5 font-status-pill text-status-pill text-on-primary shadow"
              data-testid={`public-menu-tile-incart-${item.name}`}
            >
              ×{inCartCount}
            </span>
          ) : null}

          {!isAvailable ? (
            <span className="absolute inset-0 flex items-center justify-center bg-on-surface/55 font-label-caps text-label-caps uppercase text-surface-container-lowest">
              Sold out
            </span>
          ) : (
            <span
              aria-hidden
              className="pointer-events-none absolute bottom-3 right-3 inline-flex size-10 items-center justify-center rounded-full bg-primary text-on-primary shadow-lg transition-transform group-active:scale-95"
            >
              <span className="material-symbols-outlined">add</span>
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-card-padding">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-body-customer font-bold leading-tight text-on-surface">
              {item.name}
            </h3>
            <span className="shrink-0 text-body-customer font-bold tabular-nums text-primary">
              {formatMoney(item.effectivePriceCents ?? 0, currency)}
            </span>
          </div>
          {description ? (
            <p className="line-clamp-2 text-body-staff text-on-surface-variant">
              {description}
            </p>
          ) : null}
          {dietary.length + allergens.length > 0 ? (
            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
              {dietary.map((tag) => {
                const meta = DIETARY_LABEL[tag] ?? { short: tag, full: tag };
                return (
                  <span
                    key={`d-${tag}`}
                    title={meta.full}
                    aria-label={meta.full}
                    data-testid={`dietary-tag-${tag}`}
                    className="rounded-md bg-secondary-container px-2 py-1 font-status-pill text-status-pill text-secondary-on-container"
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
                    className="rounded-md bg-error-container px-2 py-1 font-status-pill text-status-pill text-error-on-container"
                  >
                    {meta.short}
                  </span>
                );
              })}
            </div>
          ) : null}
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
