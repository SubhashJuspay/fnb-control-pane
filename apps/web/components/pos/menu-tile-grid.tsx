'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Search } from 'lucide-react';
import { formatMoney } from '@repo/ui';
import { toast } from 'sonner';
import {
  AddTicketItemDocument,
  CatalogItemsDocument,
  type CatalogItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { ModifierPicker } from './modifier-picker';

type ItemEdge = NonNullable<NonNullable<CatalogItemsQuery['catalogItems']>['edges']>[number];
type CatalogItemRow = NonNullable<NonNullable<ItemEdge>['node']>;

interface MenuTileGridProps {
  /** Active ticket id from the URL search param. `null` disables tap-to-add. */
  activeTicketId: string | null;
  /**
   * Fired after a successful direct-add (no modifiers) or after the modifier
   * picker confirms. Lets the workspace force-refresh the active ticket panel
   * — urql's default cache invalidation does not trigger a refetch when a
   * mutation returns a brand-new TicketItem because the parent Ticket entity
   * is unchanged.
   */
  onItemAdded?: () => void;
}

const PAGE_SIZE = 250;

// Category-coded gradients. Mapped deterministically from category id (or
// item id when uncategorized) so an item keeps the same colour across renders.
const TILE_PALETTE: readonly string[] = [
  'from-amber-400 to-orange-500',
  'from-rose-400 to-pink-600',
  'from-sky-500 to-blue-600',
  'from-emerald-400 to-teal-600',
  'from-violet-500 to-purple-600',
  'from-cyan-400 to-sky-600',
  'from-lime-500 to-green-600',
  'from-fuchsia-500 to-rose-500',
  'from-indigo-500 to-blue-700',
  'from-yellow-400 to-amber-600',
];

function gradientAt(index: number): string {
  return TILE_PALETTE[index % TILE_PALETTE.length] as string;
}

// Old demo seeds embedded the item name into placehold.co URLs, which then
// rendered the name twice on the tile (once from the image, once from our
// label). Treat any placeholder service URL as "no image" so the colored
// gradient takes over.
function isUsableImageUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  return !/(^https?:\/\/)?(placehold\.co|via\.placeholder\.com|placekitten\.com|picsum\.photos)\b/i.test(
    url,
  );
}

/**
 * Touch-friendly grid of catalog items with a sticky search + category pill
 * toolbar. Tapping a tile:
 *   • adds the item directly when it has zero attached modifier groups; or
 *   • opens the {@link ModifierPicker} dialog otherwise. The picker enforces
 *     the per-group min/max rules; for items where every attached group is
 *     optional (min === 0) the user can simply submit with no selection.
 */
export function MenuTileGrid({
  activeTicketId,
  onItemAdded,
}: MenuTileGridProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }] = useQuery({
    query: CatalogItemsDocument,
    variables: { first: PAGE_SIZE, after: null, filter: { includeArchived: false } },
  });
  const [, addTicketItem] = useMutation(AddTicketItemDocument);
  const [pickerTargetId, setPickerTargetId] = useState<string | null>(null);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  // QTY prefix selector — Clover-style. Tap a number, then tap a tile, and
  // that quantity is added in one shot. Resets to 1 after every successful add.
  const [qty, setQty] = useState<number>(1);

  const items: CatalogItemRow[] = useMemo(
    () =>
      (data?.catalogItems?.edges ?? [])
        .map((e) => e?.node)
        .filter((n): n is CatalogItemRow => n != null && Boolean(n.id) && !n.archivedAt),
    [data],
  );

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
    const list: Array<{ id: string | null; name: string; count: number }> = [
      { id: null, name: 'All', count: items.length },
      ...categoryTabs,
    ];
    if (uncategorized > 0) {
      list.push({ id: '__uncategorized__', name: 'Other', count: uncategorized });
    }
    return list;
  }, [items]);

  // Assign a palette slot per category (sorted by name) so adjacent categories
  // never collide on the same colour. Uncategorized items share the last slot.
  const colorByCategory = useMemo(() => {
    const map = new Map<string, number>();
    let i = 0;
    for (const tab of tabs) {
      if (tab.id && tab.id !== '__uncategorized__') {
        map.set(tab.id, i);
        i += 1;
      }
    }
    return map;
  }, [tabs]);

  const searchQuery = search.trim().toLowerCase();

  const visibleItems = useMemo(() => {
    let pool = items;
    if (activeCategoryId === '__uncategorized__') {
      pool = pool.filter((i) => !i.category?.id);
    } else if (activeCategoryId !== null) {
      pool = pool.filter((i) => i.category?.id === activeCategoryId);
    }
    if (searchQuery) {
      pool = pool.filter((i) => (i.name ?? '').toLowerCase().includes(searchQuery));
    }
    return pool;
  }, [items, activeCategoryId, searchQuery]);

  const sections = useMemo(() => {
    if (activeCategoryId !== null || searchQuery) {
      return [{ id: activeCategoryId ?? '__results__', name: '', items: visibleItems }];
    }
    const map = new Map<string, { id: string; name: string; items: CatalogItemRow[] }>();
    const orphans: CatalogItemRow[] = [];
    for (const item of visibleItems) {
      if (item.category?.id && item.category.name) {
        const prev = map.get(item.category.id);
        if (prev) prev.items.push(item);
        else
          map.set(item.category.id, {
            id: item.category.id,
            name: item.category.name,
            items: [item],
          });
      } else {
        orphans.push(item);
      }
    }
    const groups = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
    if (orphans.length > 0) {
      groups.push({ id: '__uncategorized__', name: 'Other', items: orphans });
    }
    return groups;
  }, [visibleItems, activeCategoryId, searchQuery]);

  const onTileTap = async (item: CatalogItemRow): Promise<void> => {
    if (!activeTicketId || !item.id) return;
    const groups = item.modifierGroups ?? [];
    if (groups.length === 0) {
      const result = await addTicketItem({
        input: { ticketId: activeTicketId, menuItemId: item.id, quantity: qty, modifiers: [] },
      });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      toast.success(
        qty > 1
          ? `Added: ${qty} × ${item.name ?? 'item'}`
          : `Added: ${item.name ?? 'item'}`,
      );
      setQty(1);
      onItemAdded?.();
      return;
    }
    setPickerTargetId(item.id);
  };

  const noResults = !fetching && sections.every((s) => s.items.length === 0);

  return (
    <div className="relative flex h-full flex-col">
      <div className="sticky top-0 z-10 flex flex-col gap-2 border-b bg-background/95 px-3 py-2.5 backdrop-blur">
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search menu…"
            data-testid="pos-menu-search"
            className="h-9 w-full rounded-md border border-border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
        {/* QTY prefix strip — tap a number, then tap an item to add that
            quantity in one shot. Hidden when no ticket is active because there
            is nothing to add to. */}
        {activeTicketId ? (
          <div
            className="flex items-center gap-1 overflow-x-auto"
            role="group"
            aria-label="Quantity"
            data-testid="pos-qty-strip"
          >
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Qty
            </span>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const active = qty === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setQty(n)}
                  data-testid={`pos-qty-${n}`}
                  aria-pressed={active}
                  className={[
                    'inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-xs font-semibold tabular-nums transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                  ].join(' ')}
                >
                  {n}
                </button>
              );
            })}
            {qty > 1 ? (
              <span className="ml-1 inline-flex shrink-0 items-center rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                Next add: ×{qty}
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {tabs.map((tab) => {
            const active = tab.id === activeCategoryId;
            return (
              <button
                key={tab.id ?? '__all__'}
                type="button"
                onClick={() => setActiveCategoryId(tab.id)}
                aria-pressed={active}
                className={[
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-primary/5',
                ].join(' ')}
              >
                <span>{tab.name}</span>
                <span
                  className={[
                    'inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] tabular-nums',
                    active
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-muted text-muted-foreground',
                  ].join(' ')}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error ? (
        <p className="px-3 py-2 text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}

      <div className="relative flex-1 overflow-y-auto">
        {fetching && items.length === 0 ? (
          <p className="px-3 py-3 text-sm text-muted-foreground">Loading menu…</p>
        ) : (
          <div className="flex flex-col gap-5 p-3">
            {sections.map((section) => (
              <section key={section.id} className="flex flex-col gap-2">
                {section.name ? (
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {section.name}
                  </h3>
                ) : null}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                  {section.items.map((item) => (
                    <Tile
                      key={item.id ?? ''}
                      item={item}
                      currency={currency}
                      disabled={!activeTicketId}
                      paletteIndex={
                        item.category?.id ? (colorByCategory.get(item.category.id) ?? 0) : 9
                      }
                      onTap={() => void onTileTap(item)}
                    />
                  ))}
                </div>
              </section>
            ))}
            {noResults ? (
              <p className="px-3 py-10 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? `No items matching “${searchQuery}”.`
                  : 'No items in this category.'}
              </p>
            ) : null}
          </div>
        )}
        {!activeTicketId ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/80"
          >
            <p className="rounded-md border bg-card px-4 py-2 text-sm font-medium shadow">
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
          onSubmitted={() => {
            setPickerTargetId(null);
            onItemAdded?.();
          }}
        />
      ) : null}
    </div>
  );
}

interface TileProps {
  item: CatalogItemRow;
  currency: string;
  disabled: boolean;
  paletteIndex: number;
  onTap: () => void;
}

function Tile({ item, currency, disabled, paletteIndex, onTap }: TileProps): React.JSX.Element {
  const gradient = gradientAt(paletteIndex);
  const hasImage = isUsableImageUrl(item.imageUrl);
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      data-testid={`pos-tile-${item.name ?? ''}`}
      aria-label={item.name ?? undefined}
      className={[
        'group relative aspect-square overflow-hidden rounded-lg shadow-sm ring-1 ring-black/5 transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'hover:-translate-y-0.5 hover:shadow-md active:scale-[0.98]',
      ].join(' ')}
    >
      {hasImage ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.imageUrl ?? ''}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            loading="lazy"
          />
          <span
            aria-hidden
            className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent"
          />
        </>
      ) : (
        <span
          aria-hidden
          className={`absolute inset-0 bg-gradient-to-br ${gradient}`}
        />
      )}
      <span className="relative flex h-full flex-col justify-between gap-1 p-2 text-white">
        <span className="line-clamp-3 break-words text-left text-[12px] font-semibold leading-tight drop-shadow">
          {item.name}
        </span>
        <span className="flex items-center justify-between gap-1">
          {(item.modifierGroups?.length ?? 0) > 0 ? (
            <span
              aria-hidden
              title="Has options"
              className="inline-block size-1.5 rounded-full bg-white/85 shadow"
            />
          ) : (
            <span aria-hidden className="size-1.5" />
          )}
          <span className="rounded-md bg-black/30 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums backdrop-blur-sm">
            {formatMoney(item.basePriceCents ?? 0, currency)}
          </span>
        </span>
      </span>
    </button>
  );
}
