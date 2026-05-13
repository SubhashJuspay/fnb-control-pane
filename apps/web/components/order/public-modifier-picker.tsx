'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

function isRequired(group: PublicModifierGroup): boolean {
  return (group.minSelections ?? 0) > 0;
}

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
        .filter(
          (m): m is PublicModifier =>
            m != null && Boolean(m.id) && selectedIds.has(m.id ?? ''),
        )
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

  const totalCents = (item.effectivePriceCents ?? 0) + modifiersTotalCents;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] gap-0 overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest p-0 shadow-overlay-soft sm:max-w-xl"
        data-testid="public-modifier-dialog"
      >
        <DialogHeader className="space-y-0 border-b border-outline-variant px-card-padding py-4 text-left">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col">
              <DialogTitle className="font-display text-headline-md font-semibold text-on-surface">
                {item.name ?? 'Choose options'}
              </DialogTitle>
              {item.effectivePriceCents != null ? (
                <DialogDescription className="text-body-customer font-bold text-primary">
                  {formatMoney(item.effectivePriceCents, currency)}
                </DialogDescription>
              ) : null}
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[60vh] space-y-stack-loose overflow-y-auto p-card-padding">
          {groups.length === 0 ? (
            <p className="text-body-staff text-on-surface-variant">
              No options. Confirm to add.
            </p>
          ) : (
            groups.map((group) => {
              const min = group.minSelections ?? 0;
              const max = group.maxSelections ?? 0;
              const required = isRequired(group);
              const mods = (group.modifiers ?? []).filter(
                (m): m is PublicModifier => m != null && Boolean(m.id),
              );
              return (
                <section key={group.id ?? ''} className="flex flex-col gap-stack-tight">
                  <header className="mb-1 flex items-center justify-between gap-2">
                    <h3 className="text-body-customer font-bold text-on-surface">
                      {required ? 'Required: ' : 'Optional: '}
                      {group.name}
                    </h3>
                    <span
                      className={[
                        'rounded-full px-2 py-1 font-status-pill text-status-pill uppercase tracking-wider',
                        required
                          ? 'bg-primary-container text-on-primary-container'
                          : 'bg-surface-container text-on-surface-variant',
                      ].join(' ')}
                    >
                      {summarizeGroup(min, max)}
                    </span>
                  </header>
                  <div className="grid grid-cols-1 gap-stack-tight">
                    {mods.map((m) => {
                      const checked = selectedIds.has(m.id ?? '');
                      const delta = m.priceDeltaCents ?? 0;
                      return (
                        <label
                          key={m.id ?? ''}
                          data-testid={`public-modifier-${m.name}`}
                          data-checked={checked ? 'true' : 'false'}
                          className={[
                            'group flex cursor-pointer items-center justify-between gap-3 rounded-lg p-4 transition-all',
                            checked
                              ? 'border-2 border-primary bg-primary/5'
                              : 'border border-outline-variant hover:border-primary',
                          ].join(' ')}
                        >
                          <div className="flex flex-col">
                            <span
                              className={[
                                'text-body-staff',
                                checked
                                  ? 'font-bold text-primary'
                                  : 'font-medium text-on-surface',
                              ].join(' ')}
                            >
                              {m.name}
                            </span>
                            {delta !== 0 ? (
                              <span
                                className={[
                                  'text-status-pill tabular-nums',
                                  checked ? 'text-primary/80' : 'text-on-surface-variant',
                                ].join(' ')}
                              >
                                {`${delta > 0 ? '+' : ''}${formatMoney(delta, currency)}`}
                              </span>
                            ) : null}
                          </div>
                          <input
                            type={max === 1 ? 'radio' : 'checkbox'}
                            name={group.id ?? ''}
                            checked={checked}
                            onChange={() => toggle(group, m)}
                            className="h-5 w-5 cursor-pointer accent-primary focus:ring-primary"
                          />
                        </label>
                      );
                    })}
                  </div>
                </section>
              );
            })
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-outline-variant bg-surface-container-low p-card-padding sm:flex-row">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-lg border border-primary px-6 py-3 font-bold text-primary transition-colors hover:bg-primary/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={!isValid}
            data-testid="public-modifier-submit"
            className="flex-[2] rounded-lg bg-primary px-6 py-3 font-bold text-on-primary shadow-card-soft transition-all hover:opacity-90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add to cart — {formatMoney(totalCents, currency)}
          </button>
        </div>
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
