'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { formatMoney } from '@repo/ui';
import { ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import {
  AddTicketItemDocument,
  CatalogItemsDocument,
  type CatalogItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { CategoryTabs } from './category-tabs';
import { ModifierPicker } from './modifier-picker';

type ItemEdge = NonNullable<NonNullable<CatalogItemsQuery['catalogItems']>['edges']>[number];
type CatalogItemRow = NonNullable<NonNullable<ItemEdge>['node']>;

interface MenuTileGridProps {
  /** Active ticket id from the URL search param. `null` disables tap-to-add. */
  activeTicketId: string | null;
}

const PAGE_SIZE = 250;

/**
 * Touch-friendly grid of catalog items, grouped by category. Tapping a tile:
 *   • adds the item directly when it has zero attached modifier groups; or
 *   • opens the {@link ModifierPicker} dialog otherwise. The picker enforces
 *     the per-group min/max rules; for items where every attached group is
 *     optional (min === 0) the user can simply submit with no selection.
 */
export function MenuTileGrid({ activeTicketId }: MenuTileGridProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }] = useQuery({
    query: CatalogItemsDocument,
    variables: { first: PAGE_SIZE, after: null, filter: { includeArchived: false } },
  });
  const [, addTicketItem] = useMutation(AddTicketItemDocument);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);

  const items: CatalogItemRow[] = useMemo(
    () =>
      (data?.catalogItems?.edges ?? [])
        .map((e) => e?.node)
        .filter((n): n is CatalogItemRow => n != null && Boolean(n.id) && !n.archivedAt),
    [data],
  );

  // Build category tabs (with counts) from the loaded set.
  const tabs = useMemo(() => {
    const counts = new Map<string, { id: string; name: string; count: number }>();
    let uncategorized = 0;
    for (const item of items) {
      if (item.category?.id && item.category.name) {
        const prev = counts.get(item.category.id);
        counts.set(item.category.id, {
          id: item.category.id,
          name: item.category.name,
          count: (prev?.count ?? 0) + 1,
        });
      } else {
        uncategorized += 1;
      }
    }
    const categoryTabs = [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
    const all = { id: null as string | null, name: 'All', count: items.length };
    const tabsList = [all, ...categoryTabs];
    if (uncategorized > 0) {
      tabsList.push({ id: '__uncategorized__', name: 'Other', count: uncategorized });
    }
    return tabsList;
  }, [items]);

  const filtered = useMemo(() => {
    if (activeCategoryId === null) return items;
    if (activeCategoryId === '__uncategorized__') {
      return items.filter((i) => !i.category?.id);
    }
    return items.filter((i) => i.category?.id === activeCategoryId);
  }, [items, activeCategoryId]);

  const sections = useMemo(() => {
    if (activeCategoryId !== null) {
      const tabName = tabs.find((t) => t.id === activeCategoryId)?.name ?? '';
      return [{ id: activeCategoryId, name: tabName, items: filtered }];
    }
    const map = new Map<string, { id: string; name: string; items: CatalogItemRow[] }>();
    const orphans: CatalogItemRow[] = [];
    for (const item of filtered) {
      if (item.category?.id && item.category.name) {
        const prev = map.get(item.category.id);
        if (prev) prev.items.push(item);
        else map.set(item.category.id, { id: item.category.id, name: item.category.name, items: [item] });
      } else {
        orphans.push(item);
      }
    }
    const groups = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (orphans.length > 0) {
      groups.push({ id: '__uncategorized__', name: 'Other', items: orphans });
    }
    return groups;
  }, [filtered, activeCategoryId, tabs]);

  const onTileTap = async (item: CatalogItemRow): Promise<void> => {
    if (!activeTicketId || !item.id) return;
    const groups = item.modifierGroups ?? [];
    if (groups.length === 0) {
      const result = await addTicketItem({
        input: { ticketId: activeTicketId, menuItemId: item.id, quantity: 1, modifiers: [] },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success(`Added: ${item.name ?? 'item'}`);
      return;
    }
    setPickerTargetId(item.id);
  };

  return (
    <div className="relative flex h-full flex-col">
      <CategoryTabs tabs={tabs} activeId={activeCategoryId} onSelect={setActiveCategoryId} />
      {error ? (
        <p className="px-3 py-2 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <div className="relative flex-1 overflow-y-auto">
        {fetching && items.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Loading menu…</p>
        ) : (
          <div className="flex flex-col gap-6 p-3">
            {sections.map((section) => (
              <section key={section.id ?? ''} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {section.name}
                </h3>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {section.items.map((item) => (
                    <button
                      key={item.id ?? ''}
                      type="button"
                      onClick={() => onTileTap(item)}
                      disabled={!activeTicketId}
                      className="group flex aspect-square flex-col overflow-hidden rounded-md border bg-background text-left shadow-sm transition-all hover:border-primary hover:shadow disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {item.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.imageUrl}
                          alt=""
                          className="h-2/3 w-full object-cover bg-muted"
                        />
                      ) : (
                        <div className="flex h-2/3 w-full items-center justify-center bg-muted text-muted-foreground">
                          <ImageOff className="h-6 w-6" aria-hidden />
                        </div>
                      )}
                      <div className="flex flex-1 flex-col justify-between gap-1 p-2">
                        <span className="line-clamp-2 text-sm font-medium">{item.name}</span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatMoney(item.basePriceCents ?? 0, currency)}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {sections.length > 0 && sections.every((s) => s.items.length === 0) ? (
              <p className="px-3 py-3 text-sm text-muted-foreground">No items in this category.</p>
            ) : null}
          </div>
        )}
        {!activeTicketId ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80"
          >
            <p className="rounded-md border bg-surface px-4 py-2 text-sm font-medium shadow">
              Open a ticket first
            </p>
          </div>
        ) : null}
      </div>
      {pickerTargetId && activeTicketId ? (
        <ModifierPicker
          open
          onOpenChange={(o) => {
            if (!o) setPickerTargetId(null);
          }}
          menuItemId={pickerTargetId}
          mode={{ kind: 'add', ticketId: activeTicketId }}
          onSubmitted={() => setPickerTargetId(null)}
        />
      ) : null}
    </div>
  );
}
