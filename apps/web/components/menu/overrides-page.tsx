'use client';

import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  MoneyInput,
  formatMoney,
  type Column,
} from '@repo/ui';
import { CheckCircle2, ImageOff, Smile } from 'lucide-react';
import { toast } from 'sonner';
import {
  LocationOverridesPageDocument,
  SetItem86Document,
  UpsertLocationItemDocument,
  type LocationOverridesPageQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';
import { AddOverrideDialog } from './add-override-dialog';

type Edge = NonNullable<NonNullable<LocationOverridesPageQuery['catalogItems']>['edges']>[number];
type ItemNode = NonNullable<NonNullable<Edge>['node']>;

interface ItemWithOverride {
  id: string;
  name: string;
  basePriceCents: number;
  imageUrl: string | null;
  override: NonNullable<ItemNode['locationOverride']> | null;
}

/**
 * `true` when a LocationItem row is "non-trivial" enough to surface in the
 * overrides table — i.e. it actually changes something compared to the
 * catalog defaults. All-default rows (priceCents=null, available=true,
 * hidden=false) are skipped.
 */
function hasMeaningfulOverride(o: NonNullable<ItemNode['locationOverride']>): boolean {
  if (o.priceCents != null) return true;
  if (o.hidden === true) return true;
  if (o.available === false) return true;
  return false;
}

function unwrap(edges: ReadonlyArray<Edge> | null | undefined): ItemWithOverride[] {
  return (edges ?? [])
    .map((e) => e?.node)
    .filter((n): n is ItemNode => Boolean(n?.id && n?.name))
    .map((n) => ({
      id: n.id ?? '',
      name: n.name ?? '',
      basePriceCents: n.basePriceCents ?? 0,
      imageUrl: n.imageUrl ?? null,
      override: n.locationOverride ?? null,
    }));
}

const PAGE_SIZE = 250;

export function OverridesPage(): React.JSX.Element {
  const currency = useLocationCurrency();
  const [{ data, fetching, error }, refetch] = useQuery({
    query: LocationOverridesPageDocument,
    variables: { first: PAGE_SIZE, after: null },
  });
  const [, upsertOverride] = useMutation(UpsertLocationItemDocument);
  const [, setItem86] = useMutation(SetItem86Document);
  const [addPickerOpen, setAddPickerOpen] = useState(false);
  const [addDialogTargetId, setAddDialogTargetId] = useState<string | null>(null);

  const items = useMemo(() => unwrap(data?.catalogItems?.edges), [data]);

  const eightySixed = items.filter((i) => i.override?.available === false);
  // Overrides table excludes 86'd items — those live in the 86 board above
  // and are managed there to avoid duplicating the controls.
  const overridden = items.filter(
    (i) =>
      i.override &&
      hasMeaningfulOverride(i.override) &&
      i.override.available !== false,
  );
  const notOverriddenCandidates = items.filter(
    (i) => !i.override || !hasMeaningfulOverride(i.override),
  );

  const refresh = (): void => {
    refetch({ requestPolicy: 'network-only' });
  };

  const onMarkAvailable = async (menuItemId: string): Promise<void> => {
    const result = await setItem86({ input: { menuItemId, available: true } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item is back on the menu');
    refresh();
  };

  const onPriceChange = async (menuItemId: string, priceCents: number | null): Promise<void> => {
    const result = await upsertOverride({ input: { menuItemId, priceCents } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    refresh();
  };

  const onToggleHidden = async (menuItemId: string, hidden: boolean): Promise<void> => {
    const result = await upsertOverride({ input: { menuItemId, hidden } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    refresh();
  };

  const onReset = async (menuItemId: string): Promise<void> => {
    const result = await upsertOverride({
      input: { menuItemId, hidden: false, available: true, priceCents: null },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Override reset');
    refresh();
  };

  const targetItem = addDialogTargetId
    ? items.find((i) => i.id === addDialogTargetId) ?? null
    : null;

  const overrideColumns: Column<ItemWithOverride>[] = [
    {
      key: 'image',
      header: '',
      className: 'w-20',
      cell: (row) =>
        row.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={row.imageUrl}
            alt=""
            className="h-12 w-12 rounded object-cover bg-muted"
            width={48}
            height={48}
          />
        ) : (
          <div className="flex h-12 w-12 items-center justify-center rounded bg-muted text-muted-foreground">
            <ImageOff className="h-4 w-4" aria-hidden />
          </div>
        ),
    },
    {
      key: 'name',
      header: 'Item',
      cell: (row) => <span className="font-medium">{row.name}</span>,
    },
    {
      key: 'base',
      header: 'Base price',
      className: 'text-right tabular-nums',
      cell: (row) => formatMoney(row.basePriceCents, currency),
    },
    {
      key: 'price',
      header: 'Location price',
      cell: (row) => (
        <PriceCell
          value={row.override?.priceCents ?? null}
          onChange={(cents) => onPriceChange(row.id, cents)}
        />
      ),
    },
    {
      key: 'hidden',
      header: 'Hidden',
      className: 'text-center',
      cell: (row) => (
        <input
          type="checkbox"
          checked={Boolean(row.override?.hidden)}
          onChange={(e) => onToggleHidden(row.id, e.target.checked)}
          aria-label={`Hide ${row.name}`}
        />
      ),
    },
    {
      key: 'reset',
      header: '',
      className: 'text-right',
      cell: (row) => (
        <Button type="button" variant="ghost" size="sm" onClick={() => onReset(row.id)}>
          Reset
        </Button>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 86 board */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>86 board</span>
            {eightySixed.length === 0 ? null : (
              <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                {eightySixed.length}
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fetching && eightySixed.length === 0 ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : eightySixed.length === 0 ? (
            <EmptyState
              icon={Smile}
              title="Nothing 86'd"
              description="Everything is available right now."
            />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {eightySixed.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border bg-surface p-2"
                >
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded object-cover bg-muted"
                      width={48}
                      height={48}
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <ImageOff className="h-4 w-4" aria-hidden />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatMoney(item.basePriceCents, currency)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onMarkAvailable(item.id)}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-1" aria-hidden />
                    Mark available
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Overrides table */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Overrides</CardTitle>
          <Button type="button" size="sm" onClick={() => setAddPickerOpen(true)}>
            Add override
          </Button>
        </CardHeader>
        <CardContent>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error.message}
            </p>
          ) : null}
          {addPickerOpen ? (
            <OverrideItemSearch
              candidates={notOverriddenCandidates}
              onSelect={(id) => {
                setAddPickerOpen(false);
                setAddDialogTargetId(id);
              }}
              onCancel={() => setAddPickerOpen(false)}
            />
          ) : null}
          {!fetching && overridden.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No overrides yet. Catalog defaults apply to every item at this location.
            </p>
          ) : (
            <DataTable
              columns={overrideColumns}
              rows={overridden}
              rowKey={(r) => r.id}
              emptyTitle="No overrides"
            />
          )}
        </CardContent>
      </Card>

      {targetItem ? (
        <AddOverrideDialog
          open={Boolean(targetItem)}
          onOpenChange={(o) => {
            if (!o) setAddDialogTargetId(null);
          }}
          item={targetItem}
          onSaved={() => {
            setAddDialogTargetId(null);
            refresh();
          }}
        />
      ) : null}
    </div>
  );
}

interface PriceCellProps {
  value: number | null;
  onChange: (cents: number | null) => void;
}

const PRICE_DEBOUNCE_MS = 600;

function PriceCell({ value, onChange }: PriceCellProps): React.JSX.Element {
  const [draft, setDraft] = useState<number | null>(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <MoneyInput
      value={draft}
      onChange={(cents) => {
        setDraft(cents);
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          timerRef.current = null;
          onChange(cents);
        }, PRICE_DEBOUNCE_MS);
      }}
      placeholder="Use base"
      className="w-32"
    />
  );
}

interface OverrideItemSearchProps {
  candidates: ItemWithOverride[];
  onSelect: (id: string) => void;
  onCancel: () => void;
}

function OverrideItemSearch({
  candidates,
  onSelect,
  onCancel,
}: OverrideItemSearchProps): React.JSX.Element {
  const [search, setSearch] = useState('');
  const filtered = candidates.filter((c) =>
    c.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  return (
    <div className="mb-3 flex flex-col gap-2 rounded-md border bg-muted/40 p-3">
      <div className="flex items-center gap-2">
        <input
          type="search"
          placeholder="Search items…"
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 h-9 rounded-md border bg-background px-3 text-sm"
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
      <ul className="max-h-64 overflow-y-auto rounded-md border bg-background">
        {filtered.length === 0 ? (
          <li className="px-3 py-2 text-sm text-muted-foreground">
            {search.trim().length > 0 ? 'No matches.' : 'Type to search.'}
          </li>
        ) : (
          filtered.slice(0, 25).map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => onSelect(c.id)}
              >
                {c.name}
              </button>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
