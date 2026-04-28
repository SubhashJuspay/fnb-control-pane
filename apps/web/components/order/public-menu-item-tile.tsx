'use client';

import { useState } from 'react';
import { formatMoney } from '@repo/ui';
import { useCart } from './cart-state';
import { PublicModifierPicker, type PublicMenuItem } from './public-modifier-picker';

export interface PublicMenuItemTileProps {
  item: PublicMenuItem;
  currency: string;
}

export function PublicMenuItemTile({
  item,
  currency,
}: PublicMenuItemTileProps): React.JSX.Element {
  const { addItem } = useCart();
  const [open, setOpen] = useState(false);
  const hasModifiers =
    Array.isArray(item.modifierGroups) && (item.modifierGroups?.length ?? 0) > 0;

  const onClick = (): void => {
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
        data-testid={`public-menu-tile-${item.name}`}
        className="flex w-full items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50"
      >
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-medium">{item.name}</span>
          {item.description ? (
            <span className="truncate text-xs text-muted-foreground">{item.description}</span>
          ) : null}
        </div>
        <span className="shrink-0 text-sm font-semibold tabular-nums">
          {formatMoney(item.effectivePriceCents ?? 0, currency)}
        </span>
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
