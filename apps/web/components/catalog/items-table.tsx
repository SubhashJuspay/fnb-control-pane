'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  DataTable,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  formatMoney,
  type Column,
} from '@repo/ui';
import { ImageOff, MoreHorizontal, UtensilsCrossed } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveMenuItemDocument,
  CatalogItemsDocument,
  ItemCourse,
  UnarchiveMenuItemDocument,
  type CatalogItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

type ItemEdge = NonNullable<NonNullable<CatalogItemsQuery['catalogItems']>['edges']>[number];
export type CatalogItemRow = NonNullable<NonNullable<ItemEdge>['node']>;

interface ItemsTableProps {
  tenantSlug: string;
}

const PAGE_SIZE = 25;

const COURSE_LABELS: Record<ItemCourse, string> = {
  [ItemCourse.Appetizer]: 'Appetizer',
  [ItemCourse.Main]: 'Main',
  [ItemCourse.Dessert]: 'Dessert',
  [ItemCourse.Side]: 'Side',
  [ItemCourse.Beverage]: 'Beverage',
  [ItemCourse.Other]: 'Other',
};

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Catalog items list page (client component). Owns search/archive toggles,
 * pagination cursor, and row-level archive/unarchive actions.
 */
export function ItemsTable({ tenantSlug }: ItemsTableProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const debouncedSearch = useDebounced(search.trim(), 250);

  const filter = useMemo(
    () => ({
      search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
      includeArchived: showArchived || undefined,
    }),
    [debouncedSearch, showArchived],
  );

  const [accumulated, setAccumulated] = useState<CatalogItemRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);

  // Reset pagination whenever filter changes.
  useEffect(() => {
    setAccumulated([]);
    setCursor(null);
  }, [filter]);

  const [{ data, fetching, error }, refetch] = useQuery({
    query: CatalogItemsDocument,
    variables: { first: PAGE_SIZE, after: cursor, filter },
  });

  // Fold the page into the accumulated list. We dedupe by id to handle the
  // first page fetch + subsequent "load more" rounds.
  useEffect(() => {
    const edges = data?.catalogItems?.edges ?? [];
    const fresh = edges
      .map((e) => e?.node)
      .filter((n): n is CatalogItemRow => n != null && Boolean(n.id));
    if (fresh.length === 0) return;
    setAccumulated((prev) => {
      const seen = new Set(prev.map((p) => p.id));
      const merged = [...prev];
      for (const node of fresh) {
        if (!seen.has(node.id)) merged.push(node);
      }
      return merged;
    });
  }, [data]);

  const [, archiveItem] = useMutation(ArchiveMenuItemDocument);
  const [, unarchiveItem] = useMutation(UnarchiveMenuItemDocument);

  const refresh = (): void => {
    setAccumulated([]);
    setCursor(null);
    refetch({ requestPolicy: 'network-only' });
  };

  const onArchive = async (id: string): Promise<void> => {
    const result = await archiveItem({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item archived');
    refresh();
  };

  const onUnarchive = async (id: string): Promise<void> => {
    const result = await unarchiveItem({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item unarchived');
    refresh();
  };

  const columns: Column<CatalogItemRow>[] = [
    {
      key: 'image',
      header: '',
      className: 'w-20',
      cell: (row) =>
        row.imageUrl ? (
          // Plain <img> rather than next/image so we don't have to whitelist
          // every external CDN host.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            className="h-16 w-16 rounded object-cover bg-muted"
            width={64}
            height={64}
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded bg-muted text-muted-foreground">
            <ImageOff className="h-5 w-5" aria-hidden />
          </div>
        ),
    },
    {
      key: 'name',
      header: 'Name',
      cell: (row) => (
        <div className="flex flex-col">
          <Link
            href={`/${tenantSlug}/admin/catalog/items/${row.id ?? ''}`}
            className="font-medium hover:underline"
          >
            {row.name ?? '—'}
          </Link>
          {row.shortDescription ? (
            <span className="text-xs text-muted-foreground line-clamp-1">
              {row.shortDescription}
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'category',
      header: 'Category',
      cell: (row) => row.category?.name ?? <span className="text-muted-foreground">—</span>,
    },
    {
      key: 'course',
      header: 'Course',
      cell: (row) => (row.course ? COURSE_LABELS[row.course] : '—'),
    },
    {
      key: 'price',
      header: 'Base price',
      className: 'text-right tabular-nums',
      cell: (row) => formatMoney(row.basePriceCents ?? 0, currency),
    },
    {
      key: 'tags',
      header: 'Dietary',
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {(row.dietaryTags ?? []).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs text-secondary-foreground"
            >
              {tag.replace(/_/g, ' ').toLowerCase()}
            </span>
          ))}
        </div>
      ),
    },
    {
      key: 'modifiers',
      header: 'Modifiers',
      className: 'text-center',
      cell: (row) => (
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-muted px-2 text-xs">
          {row.modifierGroups?.length ?? 0}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row) =>
        row.archivedAt ? (
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs">
            Archived
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Active</span>
        ),
    },
    {
      key: 'actions',
      header: '',
      className: 'w-12 text-right',
      cell: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Item actions">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/${tenantSlug}/admin/catalog/items/${row.id ?? ''}`}>Edit</Link>
            </DropdownMenuItem>
            {row.archivedAt ? (
              <DropdownMenuItem onSelect={() => row.id && onUnarchive(row.id)}>
                Unarchive
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => row.id && onArchive(row.id)}
              >
                Archive
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const conn = data?.catalogItems;
  const hasNext = Boolean(conn?.pageInfo?.hasNextPage);
  const isInitialLoad = fetching && accumulated.length === 0;
  const showEmpty = !isInitialLoad && accumulated.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="catalog-search">Search</Label>
            <Input
              id="catalog-search"
              type="search"
              placeholder="Search items…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            Show archived
          </label>
        </div>
        <Button asChild>
          <Link href={`/${tenantSlug}/admin/catalog/items/new`}>New item</Link>
        </Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      {showEmpty ? (
        <EmptyState
          icon={UtensilsCrossed}
          title="No items yet"
          description={
            debouncedSearch.length > 0
              ? 'No items matched your search. Try a different term.'
              : 'Get started by creating your first menu item.'
          }
          action={
            <Button asChild>
              <Link href={`/${tenantSlug}/admin/catalog/items/new`}>New item</Link>
            </Button>
          }
        />
      ) : (
        <DataTable
          columns={columns}
          rows={accumulated}
          rowKey={(r) => r.id ?? ''}
          emptyTitle="No items"
        />
      )}
      {hasNext ? (
        <div className="flex justify-center">
          <Button
            variant="outline"
            onClick={() => setCursor(conn?.pageInfo?.endCursor ?? null)}
            disabled={fetching}
          >
            {fetching ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
