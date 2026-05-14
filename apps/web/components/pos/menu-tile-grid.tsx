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
  // Per-tile pending state — set when the cashier taps a no-modifier item,
  // cleared on response. Drives the "Adding…" badge so they see something
  // happen during the ~200-400ms before the parent refetches and the new
  // line shows up on the right.
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);
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
      // Mark the tile as pending immediately so the user sees feedback
      // before the network round-trip + parent refetch lands.
      setPendingItemId(item.id);
      try {
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
      } finally {
        setPendingItemId(null);
      }
      return;
    }
    setPickerTargetId(item.id);
  };

  const noResults = !fetching && sections.every((s) => s.items.length === 0);

  return (
    <div className="relative flex h-full flex-col bg-surface">
      <div className="sticky top-0 z-10 flex flex-col gap-3 border-b border-outline-variant bg-surface px-4 py-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-outline"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search menu…"
              data-testid="pos-menu-search"
              className="h-10 w-full rounded-lg border-none bg-surface-container-high pl-10 pr-3 text-body-staff text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
          {activeTicketId ? (
            <div
              className="flex items-center gap-1 rounded-lg bg-surface-container-high p-1"
              role="group"
              aria-label="Quantity"
              data-testid="pos-qty-strip"
            >
              <span className="px-2 font-label-caps text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                Qty:
              </span>
              {[1, 2, 3, 4, 5].map((n) => {
                const active = qty === n;
                return (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setQty(n)}
                    data-testid={`pos-qty-${n}`}
                    aria-pressed={active}
                    className={[
                      'rounded px-3 py-1 font-bold tabular-nums transition-colors',
                      active
                        ? 'bg-primary text-on-primary shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-variant',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
        <div className="no-scrollbar flex gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const active = tab.id === activeCategoryId;
            return (
              <button
                key={tab.id ?? '__all__'}
                type="button"
                onClick={() => setActiveCategoryId(tab.id)}
                aria-pressed={active}
                className={[
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-5 py-2 font-bold transition-colors',
                  'font-status-pill text-[11px] uppercase tracking-wider',
                  active
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-high text-on-surface-variant hover:bg-outline-variant',
                ].join(' ')}
              >
                <span>{tab.name}</span>
                <span
                  className={[
                    'inline-flex min-w-[1.25rem] justify-center rounded-full px-1 text-[10px] tabular-nums',
                    active ? 'bg-on-primary/20' : 'bg-surface-container-lowest/50',
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
        <p
          className="border-b border-error/30 bg-error-container px-4 py-2 text-body-staff text-error-on-container"
          role="alert"
        >
          {error.message}
        </p>
      ) : null}

      <div className="relative flex-1 overflow-y-auto bg-background">
        {fetching && items.length === 0 ? (
          <p className="px-3 py-3 text-body-staff text-on-surface-variant">
            Loading menu…
          </p>
        ) : (
          <div className="flex flex-col gap-stack-loose p-gutter">
            {sections.map((section) => (
              <section key={section.id} className="flex flex-col gap-3">
                {section.name ? (
                  <h3 className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
                    {section.name}
                  </h3>
                ) : null}
                <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
                  {section.items.map((item) => (
                    <Tile
                      key={item.id ?? ''}
                      item={item}
                      currency={currency}
                      disabled={!activeTicketId || pendingItemId !== null}
                      pending={pendingItemId === item.id}
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
              <p className="py-10 text-center text-body-staff text-on-surface-variant">
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
            className="pointer-events-none absolute inset-0 flex items-center justify-center bg-surface/80 backdrop-blur-sm"
          >
            <p className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-2 text-body-staff font-semibold text-on-surface shadow-card-soft">
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
  /** True while this specific tile's `addTicketItem` mutation is in flight.
   *  Drives the "Adding…" overlay so cashiers see the tap was registered. */
  pending?: boolean;
  paletteIndex: number;
  onTap: () => void;
}

function Tile({
  item,
  currency,
  disabled,
  pending = false,
  paletteIndex,
  onTap,
}: TileProps): React.JSX.Element {
  const gradient = gradientAt(paletteIndex);
  const hasImage = isUsableImageUrl(item.imageUrl);
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={disabled}
      data-testid={`pos-tile-${item.name ?? ''}`}
      data-pending={pending ? 'true' : undefined}
      aria-label={item.name ?? undefined}
      aria-busy={pending}
      className={[
        'group relative flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest text-left shadow-sm transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
        disabled
          ? 'cursor-not-allowed opacity-60'
          : 'cursor-pointer hover:shadow-md active:scale-[0.97]',
        pending ? 'ring-2 ring-primary' : '',
      ].join(' ')}
    >
      {pending ? (
        <span
          aria-hidden
          className="absolute inset-0 z-10 flex items-center justify-center bg-on-background/40 backdrop-blur-sm"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 font-status-pill text-status-pill uppercase tracking-wider text-on-primary shadow-md">
            <span className="size-1.5 animate-pulse rounded-full bg-on-primary" />
            Adding
          </span>
        </span>
      ) : null}
      <div className="relative h-32 overflow-hidden">
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageUrl ?? ''}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden
            className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${gradient}`}
          >
            <span className="material-symbols-outlined text-[36px] text-white/95">
              restaurant
            </span>
          </span>
        )}
        <span className="absolute right-2 top-2 rounded bg-white/90 px-2 py-1 font-status-pill text-[10px] font-bold text-primary shadow-sm backdrop-blur">
          {formatMoney(item.basePriceCents ?? 0, currency)}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-body-staff font-bold text-on-surface">{item.name}</h3>
          {(item.modifierGroups?.length ?? 0) > 0 ? (
            <span
              aria-hidden
              title="Has options"
              className="mt-1 inline-block size-1.5 shrink-0 rounded-full bg-primary"
            />
          ) : null}
        </div>
        {item.shortDescription ? (
          <p className="line-clamp-1 text-[10px] text-on-surface-variant">
            {item.shortDescription}
          </p>
        ) : null}
      </div>
    </button>
  );
}
