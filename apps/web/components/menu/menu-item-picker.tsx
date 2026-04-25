'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Button, Input, formatMoney } from '@repo/ui';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  AddItemToMenuSectionDocument,
  CatalogItemsDocument,
  type CatalogItemsQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

interface MenuItemPickerProps {
  menuSectionId: string;
  /** Item ids already in the section — excluded from the suggestion list. */
  excludeIds: string[];
  onAdded: () => void;
  placeholder?: string;
}

type CandidateNullable = NonNullable<NonNullable<CatalogItemsQuery['catalogItems']>['edges']>[number];
type Candidate = NonNullable<NonNullable<CandidateNullable>['node']>;

const SEARCH_DEBOUNCE_MS = 250;
const PAGE_SIZE = 20;

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * Typeahead combobox for adding a catalog item to a menu section. Search
 * runs against `catalogItems(filter.search)` with archived items excluded
 * server-side; items already in the section are filtered client-side.
 */
export function MenuItemPicker({
  menuSectionId,
  excludeIds,
  onAdded,
  placeholder,
}: MenuItemPickerProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounced(search.trim(), SEARCH_DEBOUNCE_MS);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const filter = useMemo(
    () => ({
      search: debouncedSearch.length > 0 ? debouncedSearch : undefined,
    }),
    [debouncedSearch],
  );

  const [{ data, fetching }] = useQuery({
    query: CatalogItemsDocument,
    variables: { first: PAGE_SIZE, after: null, filter },
    pause: !open && debouncedSearch.length === 0,
  });
  const [, addItem] = useMutation(AddItemToMenuSectionDocument);

  const excluded = useMemo(() => new Set(excludeIds), [excludeIds]);
  const candidates: Candidate[] = (data?.catalogItems?.edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is Candidate =>
      Boolean(n?.id && n?.name && !n.archivedAt && !excluded.has(n.id)),
    );

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent): void => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const onSelect = async (id: string): Promise<void> => {
    const result = await addItem({ input: { menuSectionId, menuItemId: id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item added');
    setSearch('');
    setOpen(false);
    onAdded();
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? 'Search items…'}
          aria-label="Search catalog items"
          className="flex-1"
        />
      </div>
      {open ? (
        <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md">
          {fetching ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          ) : candidates.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              {debouncedSearch.length > 0 ? 'No items match.' : 'Type to search.'}
            </p>
          ) : (
            <ul className="max-h-72 overflow-y-auto">
              {candidates.map((c) => (
                <li key={c.id}>
                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full justify-between rounded-none px-3 text-left"
                    onClick={() => c.id && onSelect(c.id)}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatMoney(c.basePriceCents ?? 0, currency)}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
