'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  formatMoney,
} from '@repo/ui';
import { useCart } from './cart-state';

export interface PublicModifier {
  id?: string | null;
  name?: string | null;
  priceDeltaCents?: number | null;
  available?: boolean | null;
}

export interface PublicModifierGroup {
  id?: string | null;
  name?: string | null;
  minSelections?: number | null;
  maxSelections?: number | null;
  modifiers?: (PublicModifier | null)[] | null;
}

export interface PublicMenuItem {
  id?: string | null;
  name?: string | null;
  shortDescription?: string | null;
  description?: string | null;
  imageUrl?: string | null;
  effectivePriceCents?: number | null;
  available?: boolean | null;
  dietaryTags?: readonly string[] | null;
  allergenTags?: readonly string[] | null;
  modifierGroups?: (PublicModifierGroup | null)[] | null;
}

export interface PublicModifierPickerProps {
  item: PublicMenuItem;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
}

export function summarizeGroup(min: number, max: number): string {
  if (min === max && min === 1) return 'Required, exactly 1';
  if (min === max && min > 1) return `Required, exactly ${min}`;
  if (min === 0 && max === 1) return 'Optional, up to 1';
  if (min === 0) return `Optional, up to ${max}`;
  return `Required, ${min}–${max}`;
}

/**
 * Customer-facing modifier picker. Mirrors the POS picker but consumes the
 * sanitized `PublicModifierGroup` shape (no internal cost/availability data),
 * and adds the chosen line to the cart instead of a ticket.
 */
export function PublicModifierPicker({
  item,
  open,
  onOpenChange,
  currency,
}: PublicModifierPickerProps): React.JSX.Element {
  const { addItem } = useCart();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const groups: PublicModifierGroup[] = useMemo(
    () => (item.modifierGroups ?? []).filter((g): g is PublicModifierGroup => g != null),
    [item],
  );

  useEffect(() => {
    if (open) setSelectedIds(new Set());
  }, [open, item.id]);

  const toggle = (group: PublicModifierGroup, modifier: PublicModifier): void => {
    if (!modifier.id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(modifier.id ?? '')) {
        next.delete(modifier.id ?? '');
        return next;
      }
      const max = group.maxSelections ?? Number.MAX_SAFE_INTEGER;
      if (max === 1) {
        for (const m of group.modifiers ?? []) {
          if (m?.id) next.delete(m.id);
        }
      } else if (countSelectedIn(group, prev) >= max) {
        return prev;
      }
      next.add(modifier.id ?? '');
      return next;
    });
  };

  const isValid = useMemo(() => {
    return groups.every((group) => {
      const count = countSelectedIn(group, selectedIds);
      const min = group.minSelections ?? 0;
      const max = group.maxSelections ?? Number.MAX_SAFE_INTEGER;
      return count >= min && count <= max;
    });
  }, [groups, selectedIds]);

  const modifiersTotalCents = useMemo(() => {
    let total = 0;
    for (const g of groups) {
      for (const m of g.modifiers ?? []) {
        if (m?.id && selectedIds.has(m.id)) total += m.priceDeltaCents ?? 0;
      }
    }
    return total;
  }, [groups, selectedIds]);

  const onSubmit = (): void => {
    if (!isValid || !item.id || !item.name) return;
    const snapshots = groups.flatMap((g) =>
      (g.modifiers ?? [])
        .filter((m): m is PublicModifier => m != null && Boolean(m.id) && selectedIds.has(m.id ?? ''))
        .map((m) => ({
          id: m.id ?? '',
          name: m.name ?? '',
          priceDeltaCents: m.priceDeltaCents ?? 0,
        })),
    );
    addItem({
      menuItemId: item.id,
      name: item.name,
      unitPriceCents: item.effectivePriceCents ?? 0,
      modifiersTotalCents,
      quantity: 1,
      modifierIds: [...selectedIds],
      modifiers: snapshots,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg" data-testid="public-modifier-dialog">
        <DialogHeader>
          <DialogTitle>{item.name ?? 'Choose options'}</DialogTitle>
          {item.effectivePriceCents != null ? (
            <DialogDescription>
              {formatMoney(item.effectivePriceCents, currency)}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="flex flex-col gap-5">
          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">No options. Confirm to add.</p>
          ) : (
            groups.map((group) => {
              const min = group.minSelections ?? 0;
              const max = group.maxSelections ?? 0;
              const mods = (group.modifiers ?? []).filter(
                (m): m is PublicModifier => m != null && Boolean(m.id),
              );
              return (
                <section key={group.id ?? ''} className="flex flex-col gap-2">
                  <header className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{group.name}</h3>
                    <span className="text-xs text-muted-foreground">
                      {summarizeGroup(min, max)}
                    </span>
                  </header>
                  <div className="grid grid-cols-2 gap-2">
                    {mods.map((m) => {
                      const checked = selectedIds.has(m.id ?? '');
                      const delta = m.priceDeltaCents ?? 0;
                      return (
                        <button
                          key={m.id ?? ''}
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          data-testid={`public-modifier-${m.name}`}
                          data-checked={checked ? 'true' : 'false'}
                          onClick={() => toggle(group, m)}
                          className={[
                            'group/mod relative flex flex-col items-start gap-1 rounded-lg border-2 px-3 py-2.5 text-left text-sm transition-all',
                            checked
                              ? 'border-primary bg-primary text-primary-foreground shadow-sm ring-2 ring-primary/30'
                              : 'border-border bg-background hover:border-primary/40 hover:bg-primary/5',
                          ].join(' ')}
                        >
                          {checked ? (
                            <span
                              aria-hidden
                              className="absolute right-2 top-2 inline-flex size-4 items-center justify-center rounded-full bg-primary-foreground/20"
                            >
                              <Check className="size-3" strokeWidth={3} />
                            </span>
                          ) : null}
                          <span className="pr-5 font-semibold">{m.name}</span>
                          <span
                            className={[
                              'text-xs tabular-nums',
                              checked
                                ? 'text-primary-foreground/85'
                                : 'text-muted-foreground',
                            ].join(' ')}
                          >
                            {delta === 0
                              ? 'No charge'
                              : `${delta > 0 ? '+' : ''}${formatMoney(delta, currency)}`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={!isValid}
            data-testid="public-modifier-submit"
          >
            Add to cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function countSelectedIn(group: PublicModifierGroup, selected: Set<string>): number {
  let n = 0;
  for (const m of group.modifiers ?? []) {
    if (m?.id && selected.has(m.id)) n += 1;
  }
  return n;
}
