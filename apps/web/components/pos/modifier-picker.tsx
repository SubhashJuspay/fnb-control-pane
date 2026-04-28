'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
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
import { toast } from 'sonner';
import {
  AddTicketItemDocument,
  CatalogItemWithModifiersDocument,
  SetTicketItemModifiersDocument,
  type CatalogItemWithModifiersQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

type CatalogItem = NonNullable<CatalogItemWithModifiersQuery['catalogItem']>;
type ModifierGroup = NonNullable<CatalogItem['modifierGroups']>[number];
type Modifier = NonNullable<ModifierGroup['modifiers']>[number];

export interface ModifierPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The catalog item being added (or whose modifiers are being edited). */
  menuItemId: string;
  /**
   * Either "add" (new line) or "edit" (existing ticket item). When "edit",
   * `ticketItemId` is required and the dialog calls `setTicketItemModifiers`
   * instead of `addTicketItem`.
   */
  mode: { kind: 'add'; ticketId: string } | { kind: 'edit'; ticketItemId: string };
  /** Pre-selected modifier ids (used in `edit` mode to seed the picker). */
  initialSelectedIds?: string[];
  onSubmitted: () => void;
}

/**
 * Human-readable summary line under each modifier group header. Matches the
 * spec's `summarizeGroup(min, max)` so customers know what they have to pick
 * before the "Add to ticket" button enables.
 */
export function summarizeGroup(min: number, max: number): string {
  if (min === max && min === 1) return 'Required, exactly 1';
  if (min === max && min > 1) return `Required, exactly ${min}`;
  if (min === 0 && max === 1) return 'Optional, up to 1';
  if (min === 0) return `Optional, up to ${max}`;
  return `Required, ${min}–${max}`;
}

/**
 * Touch-first modifier selector. Each section is rendered for one modifier
 * group attached to the item; tapping a tile toggles selection (single-max
 * groups behave as radio). The submit button stays disabled until every
 * group's selection count satisfies its `min`/`max` rules.
 */
export function ModifierPicker({
  open,
  onOpenChange,
  menuItemId,
  mode,
  initialSelectedIds,
  onSubmitted,
}: ModifierPickerProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }] = useQuery({
    query: CatalogItemWithModifiersDocument,
    variables: { id: menuItemId },
    pause: !open,
  });
  const [, addTicketItem] = useMutation(AddTicketItemDocument);
  const [, setItemModifiers] = useMutation(SetTicketItemModifiersDocument);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(initialSelectedIds ?? []),
  );
  const [submitting, setSubmitting] = useState(false);

  const item = data?.catalogItem ?? null;
  const groups: ModifierGroup[] = useMemo(
    () => (item?.modifierGroups ?? []).filter((g): g is ModifierGroup => g != null),
    [item],
  );

  // Reset whenever the dialog opens against a different item, or its initial
  // seed changes.
  useEffect(() => {
    if (open) setSelectedIds(new Set(initialSelectedIds ?? []));
  }, [open, menuItemId, initialSelectedIds]);

  const toggle = (group: ModifierGroup, modifier: Modifier): void => {
    if (!modifier.id) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(modifier.id ?? '')) {
        next.delete(modifier.id ?? '');
        return next;
      }
      // Single-max group: deselect any other modifier in the same group.
      if ((group.maxSelections ?? 0) === 1) {
        for (const m of group.modifiers ?? []) {
          if (m?.id) next.delete(m.id);
        }
      } else if (
        group.maxSelections != null &&
        countSelectedIn(group, prev) >= group.maxSelections
      ) {
        // Hard cap reached — ignore the click rather than silently swap.
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

  const onSubmit = async (): Promise<void> => {
    if (!isValid) return;
    setSubmitting(true);
    try {
      if (mode.kind === 'add') {
        const result = await addTicketItem({
          input: {
            ticketId: mode.ticketId,
            menuItemId,
            quantity: 1,
            modifiers: [...selectedIds].map((id) => ({ modifierId: id })),
          },
        });
        if (result.error) {
          toast.error(result.error.message);
          return;
        }
        toast.success(item?.name ? `Added: ${item.name}` : 'Item added');
      } else {
        const result = await setItemModifiers({
          input: { ticketItemId: mode.ticketItemId, modifierIds: [...selectedIds] },
        });
        if (result.error) {
          toast.error(result.error.message);
          return;
        }
        toast.success('Modifiers updated');
      }
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item?.name ?? 'Choose modifiers'}</DialogTitle>
          {item?.basePriceCents != null ? (
            <DialogDescription>
              Base price {formatMoney(item.basePriceCents, currency)}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
        ) : null}
        {fetching && !item ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col gap-5">
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No modifier groups attached. Confirm to add the item as-is.
              </p>
            ) : (
              groups.map((group) => {
                const min = group.minSelections ?? 0;
                const max = group.maxSelections ?? 0;
                const mods = (group.modifiers ?? []).filter(
                  (m): m is Modifier => m != null && Boolean(m.id) && !m.archivedAt,
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
                        return (
                          <button
                            key={m.id ?? ''}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggle(group, m)}
                            className={[
                              'flex flex-col items-start gap-1 rounded-md border px-3 py-2 text-left text-sm transition-colors',
                              checked
                                ? 'border-primary bg-primary/10 text-foreground'
                                : 'border-border bg-background hover:bg-muted/40',
                            ].join(' ')}
                          >
                            <span className="font-medium">{m.name}</span>
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {(m.priceDeltaCents ?? 0) === 0
                                ? '—'
                                : `${(m.priceDeltaCents ?? 0) > 0 ? '+' : ''}${formatMoney(m.priceDeltaCents ?? 0, currency)}`}
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
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSubmit} disabled={!isValid || submitting}>
            {submitting
              ? 'Saving…'
              : mode.kind === 'add'
              ? 'Add to ticket'
              : 'Save modifiers'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function countSelectedIn(group: ModifierGroup, selected: Set<string>): number {
  let n = 0;
  for (const m of group.modifiers ?? []) {
    if (m?.id && selected.has(m.id)) n += 1;
  }
  return n;
}
