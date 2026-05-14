'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'urql';
import { Button, formatMoney } from '@repo/ui';
import { toast } from 'sonner';
import {
  IngredientStocksDocument,
  IngredientsDocument,
  RecordStockMovementDocument,
  StockMovementKind,
  StockMovementsDocument,
  UpsertIngredientDocument,
  type IngredientStocksQuery,
  type IngredientsQuery,
  type StockMovementsQuery,
} from '@/lib/graphql/generated/graphql';

export interface InventoryWorkspaceProps {
  locationName: string;
  currency: string;
}

type Stock = NonNullable<IngredientStocksQuery['ingredientStocks']>[number];
type Ingredient = NonNullable<IngredientsQuery['ingredients']>[number];
type Movement = NonNullable<StockMovementsQuery['stockMovements']>[number];

type Tab = 'stock' | 'ingredients' | 'movements';

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'stock', label: 'Stock' },
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'movements', label: 'Movements' },
];

export function InventoryWorkspace({
  locationName,
  currency,
}: InventoryWorkspaceProps): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('stock');

  return (
    <div className="flex flex-col gap-stack-loose px-container-margin py-gutter">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-headline-md font-bold text-on-surface">
          Inventory · {locationName}
        </h1>
        <p className="text-body-staff text-on-surface-variant">
          Track ingredient stock, record restocks and waste, and review every
          movement. Sales auto-deduct based on recipes attached to menu items.
        </p>
      </header>

      <nav
        className="flex flex-wrap gap-1 border-b border-outline-variant"
        aria-label="Inventory sections"
      >
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={[
                'rounded-t-lg px-4 py-2 font-label-caps text-label-caps uppercase tracking-wider transition-colors',
                active
                  ? 'border-b-2 border-primary text-primary'
                  : 'text-on-surface-variant hover:text-on-surface',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      {tab === 'stock' ? <StockTab currency={currency} /> : null}
      {tab === 'ingredients' ? <IngredientsTab currency={currency} /> : null}
      {tab === 'movements' ? <MovementsTab /> : null}
    </div>
  );
}

// ── Stock tab ─────────────────────────────────────────

function StockTab({ currency }: { currency: string }): React.JSX.Element {
  const [{ data, fetching }, refetchStocks] = useQuery({
    query: IngredientStocksDocument,
    requestPolicy: 'cache-and-network',
  });
  const [{ data: ingData }, refetchIng] = useQuery({
    query: IngredientsDocument,
    requestPolicy: 'cache-and-network',
  });
  const [movementTarget, setMovementTarget] = useState<{
    ingredientId: string;
    name: string;
    unit: string;
    kind: StockMovementKind;
  } | null>(null);

  const stocks: Stock[] = (data?.ingredientStocks ?? []).filter(
    (s): s is Stock => Boolean(s),
  );
  const ingredients: Ingredient[] = (ingData?.ingredients ?? []).filter(
    (i): i is Ingredient => Boolean(i),
  );

  // Ingredients that exist but have no stock row yet at this location.
  const stockIngredientIds = new Set(stocks.map((s) => s.ingredient?.id ?? ''));
  const orphanIngredients = ingredients.filter(
    (i) => !stockIngredientIds.has(i.id ?? ''),
  );

  const lowStockCount = stocks.filter(
    (s) =>
      s.lowStockThreshold != null && (s.quantity ?? 0) < (s.lowStockThreshold ?? 0),
  ).length;

  const refreshAll = (): void => {
    refetchStocks({ requestPolicy: 'network-only' });
    refetchIng({ requestPolicy: 'network-only' });
  };

  return (
    <div className="flex flex-col gap-gutter">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="Tracked ingredients" value={String(stocks.length)} />
        <Kpi label="Low stock" value={String(lowStockCount)} tone={lowStockCount > 0 ? 'warning' : 'neutral'} />
        <Kpi
          label="Not yet stocked here"
          value={String(orphanIngredients.length)}
          tone={orphanIngredients.length > 0 ? 'info' : 'neutral'}
        />
      </div>

      {fetching && stocks.length === 0 ? (
        <p className="text-body-staff text-on-surface-variant">Loading…</p>
      ) : stocks.length === 0 && orphanIngredients.length === 0 ? (
        <EmptyState
          title="No ingredients in the catalog yet"
          description={'Switch to the "Ingredients" tab to create your first ingredient, then it will appear here once stocked.'}
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
          <table className="w-full text-body-staff">
            <thead className="border-b border-outline-variant bg-surface-container-low">
              <tr className="text-left">
                <Th>Ingredient</Th>
                <Th align="right">On hand</Th>
                <Th align="right">Low threshold</Th>
                <Th align="right">Cost / unit</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {stocks.map((s) => {
                const low =
                  s.lowStockThreshold != null &&
                  (s.quantity ?? 0) < (s.lowStockThreshold ?? 0);
                const negative = (s.quantity ?? 0) < 0;
                return (
                  <tr
                    key={s.id}
                    className={negative ? 'bg-error-container/40' : ''}
                  >
                    <Td>
                      <div className="flex flex-col">
                        <span className="font-semibold text-on-surface">
                          {s.ingredient?.name ?? '—'}
                        </span>
                        <span className="font-status-pill text-status-pill text-on-surface-variant">
                          unit: {s.ingredient?.unit ?? '—'}
                        </span>
                      </div>
                    </Td>
                    <Td align="right">
                      <span
                        className={[
                          'font-display font-bold tabular-nums',
                          negative
                            ? 'text-error'
                            : low
                              ? 'text-warning'
                              : 'text-on-surface',
                        ].join(' ')}
                      >
                        {(s.quantity ?? 0).toFixed(2)} {s.ingredient?.unit}
                      </span>
                      {low && !negative ? (
                        <span className="ml-2 rounded-full bg-warning-container px-2 py-0.5 font-status-pill text-status-pill uppercase tracking-wider text-on-warning-container">
                          Low
                        </span>
                      ) : null}
                      {negative ? (
                        <span className="ml-2 rounded-full bg-error-container px-2 py-0.5 font-status-pill text-status-pill uppercase tracking-wider text-on-error-container">
                          Negative
                        </span>
                      ) : null}
                    </Td>
                    <Td align="right" className="tabular-nums text-on-surface-variant">
                      {s.lowStockThreshold != null
                        ? s.lowStockThreshold.toFixed(2)
                        : '—'}
                    </Td>
                    <Td align="right" className="tabular-nums text-on-surface-variant">
                      {s.ingredient?.costPerUnitCents != null
                        ? formatMoney(s.ingredient.costPerUnitCents, currency)
                        : '—'}
                    </Td>
                    <Td align="right">
                      <div className="flex flex-wrap justify-end gap-1.5">
                        <RowAction
                          onClick={() =>
                            setMovementTarget({
                              ingredientId: s.ingredient?.id ?? '',
                              name: s.ingredient?.name ?? '',
                              unit: s.ingredient?.unit ?? '',
                              kind: StockMovementKind.Restock,
                            })
                          }
                        >
                          Restock
                        </RowAction>
                        <RowAction
                          tone="warning"
                          onClick={() =>
                            setMovementTarget({
                              ingredientId: s.ingredient?.id ?? '',
                              name: s.ingredient?.name ?? '',
                              unit: s.ingredient?.unit ?? '',
                              kind: StockMovementKind.Waste,
                            })
                          }
                        >
                          Waste
                        </RowAction>
                        <RowAction
                          tone="neutral"
                          onClick={() =>
                            setMovementTarget({
                              ingredientId: s.ingredient?.id ?? '',
                              name: s.ingredient?.name ?? '',
                              unit: s.ingredient?.unit ?? '',
                              kind: StockMovementKind.CountAdjust,
                            })
                          }
                        >
                          Adjust
                        </RowAction>
                      </div>
                    </Td>
                  </tr>
                );
              })}
              {orphanIngredients.map((i) => (
                <tr key={i.id} className="bg-surface-container-low/60">
                  <Td>
                    <div className="flex flex-col">
                      <span className="font-medium text-on-surface-variant">
                        {i.name}
                      </span>
                      <span className="font-status-pill text-status-pill text-on-surface-variant">
                        unit: {i.unit}
                      </span>
                    </div>
                  </Td>
                  <Td align="right" className="italic text-on-surface-variant">
                    not stocked here
                  </Td>
                  <Td align="right" className="text-on-surface-variant">
                    —
                  </Td>
                  <Td align="right" className="tabular-nums text-on-surface-variant">
                    {i.costPerUnitCents != null
                      ? formatMoney(i.costPerUnitCents, currency)
                      : '—'}
                  </Td>
                  <Td align="right">
                    <RowAction
                      onClick={() =>
                        setMovementTarget({
                          ingredientId: i.id ?? '',
                          name: i.name ?? '',
                          unit: i.unit ?? '',
                          kind: StockMovementKind.Restock,
                        })
                      }
                    >
                      Stock here
                    </RowAction>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {movementTarget ? (
        <MovementDialog
          target={movementTarget}
          currency={currency}
          onClose={() => setMovementTarget(null)}
          onSaved={() => {
            setMovementTarget(null);
            refreshAll();
          }}
        />
      ) : null}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'warning' | 'info';
}): React.JSX.Element {
  const cls =
    tone === 'warning'
      ? 'border-warning/40 bg-warning-container text-on-warning-container'
      : tone === 'info'
        ? 'border-secondary/40 bg-secondary-container text-on-secondary-container'
        : 'border-outline-variant bg-surface-container-lowest text-on-surface';
  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-card-padding shadow-card-soft ${cls}`}>
      <p className="font-label-caps text-label-caps uppercase tracking-wider opacity-80">
        {label}
      </p>
      <p className="font-display text-headline-md font-bold tabular-nums">
        {value}
      </p>
    </div>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: 'right';
}): React.JSX.Element {
  return (
    <th
      className={[
        'px-card-padding py-3 font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant',
        align === 'right' ? 'text-right' : '',
      ].join(' ')}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  className,
}: {
  children: React.ReactNode;
  align?: 'right';
  className?: string;
}): React.JSX.Element {
  return (
    <td
      className={[
        'px-card-padding py-3',
        align === 'right' ? 'text-right' : '',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </td>
  );
}

function RowAction({
  children,
  onClick,
  tone = 'primary',
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: 'primary' | 'warning' | 'neutral';
}): React.JSX.Element {
  const cls =
    tone === 'primary'
      ? 'border-primary text-primary hover:bg-primary/5'
      : tone === 'warning'
        ? 'border-warning text-warning hover:bg-warning/10'
        : 'border-outline-variant text-on-surface-variant hover:bg-surface-container';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-md border px-2.5 py-1 font-status-pill text-status-pill uppercase tracking-wider transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}): React.JSX.Element {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-card-padding py-10 text-center">
      <span
        aria-hidden
        className="material-symbols-outlined text-[40px] text-on-surface-variant/60"
      >
        inventory_2
      </span>
      <p className="text-body-customer font-semibold text-on-surface">{title}</p>
      <p className="max-w-md text-body-staff text-on-surface-variant">
        {description}
      </p>
    </div>
  );
}

// ── Movement dialog ───────────────────────────────────

function MovementDialog({
  target,
  currency,
  onClose,
  onSaved,
}: {
  target: {
    ingredientId: string;
    name: string;
    unit: string;
    kind: StockMovementKind;
  };
  currency: string;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [qty, setQty] = useState('');
  const [note, setNote] = useState('');
  const [cost, setCost] = useState('');
  const [{ fetching }, record] = useMutation(RecordStockMovementDocument);

  const verb =
    target.kind === StockMovementKind.Restock
      ? 'Restock'
      : target.kind === StockMovementKind.Waste
        ? 'Waste'
        : 'Adjust count';
  const hint =
    target.kind === StockMovementKind.Restock
      ? 'Quantity received (positive).'
      : target.kind === StockMovementKind.Waste
        ? 'Quantity wasted (positive; the system records it as outgoing).'
        : 'Delta from current count. Positive to add, negative to remove.';

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    const n = Number.parseFloat(qty);
    if (!Number.isFinite(n) || n === 0) {
      toast.error('Enter a non-zero quantity.');
      return;
    }
    // Convert the user-facing positive number into the signed value the
    // resolver expects.
    const signed =
      target.kind === StockMovementKind.Waste ? -Math.abs(n) : n;
    const costParsed = cost ? Math.round(Number.parseFloat(cost) * 100) : null;
    const result = await record({
      ingredientId: target.ingredientId,
      kind: target.kind,
      quantity: signed,
      note: note || null,
      costPerUnitCents:
        Number.isFinite(costParsed as number) ? (costParsed as number) : null,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(`${verb} recorded`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-overlay-soft"
      >
        <header className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-headline-md font-semibold text-on-surface">
              {verb}: {target.name}
            </h2>
            <p className="text-body-staff text-on-surface-variant">{hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1 text-on-surface-variant hover:bg-surface-container"
          >
            <span aria-hidden className="material-symbols-outlined">
              close
            </span>
          </button>
        </header>
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Quantity ({target.unit})
          </span>
          <input
            type="number"
            step="any"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder={
              target.kind === StockMovementKind.CountAdjust ? '+/-' : '0.00'
            }
            className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        {target.kind === StockMovementKind.Restock ? (
          <label className="flex flex-col gap-2">
            <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
              Cost per {target.unit} ({currency}) — optional
            </span>
            <input
              type="number"
              step="0.01"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="e.g. 2.50"
              className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Note (optional)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              target.kind === StockMovementKind.Waste
                ? 'e.g. spoiled produce, kitchen breakage'
                : target.kind === StockMovementKind.CountAdjust
                  ? 'e.g. weekly count correction'
                  : 'e.g. delivery from vendor X'
            }
            className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-outline-variant px-4 py-2 text-body-staff font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={fetching}
            className="bg-primary text-on-primary hover:opacity-90"
          >
            {fetching ? 'Saving…' : `Record ${verb.toLowerCase()}`}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Ingredients tab ───────────────────────────────────

function IngredientsTab({ currency }: { currency: string }): React.JSX.Element {
  const [{ data, fetching }, refetch] = useQuery({
    query: IngredientsDocument,
    requestPolicy: 'cache-and-network',
  });
  const [editing, setEditing] = useState<Ingredient | null>(null);
  const [adding, setAdding] = useState(false);
  const ingredients: Ingredient[] = (data?.ingredients ?? []).filter(
    (i): i is Ingredient => Boolean(i),
  );

  return (
    <div className="flex flex-col gap-gutter">
      <div className="flex items-center justify-between">
        <p className="text-body-staff text-on-surface-variant">
          Ingredients are shared across all locations of this tenant. Stock is
          tracked per-location on the Stock tab.
        </p>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setAdding(true);
          }}
          className="bg-primary text-on-primary hover:opacity-90"
        >
          + New ingredient
        </Button>
      </div>
      {fetching && ingredients.length === 0 ? (
        <p className="text-body-staff text-on-surface-variant">Loading…</p>
      ) : ingredients.length === 0 && !adding ? (
        <EmptyState
          title="No ingredients yet"
          description='Create your first ingredient — e.g. "Beef patty 6oz" with unit "each", or "Olive oil" with unit "L".'
        />
      ) : (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
          <table className="w-full text-body-staff">
            <thead className="border-b border-outline-variant bg-surface-container-low">
              <tr>
                <Th>Name</Th>
                <Th>Unit</Th>
                <Th align="right">Cost / unit</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/40">
              {ingredients.map((i) => (
                <tr key={i.id ?? ''}>
                  <Td>
                    <span className="font-semibold text-on-surface">
                      {i.name}
                    </span>
                  </Td>
                  <Td className="text-on-surface-variant">{i.unit}</Td>
                  <Td align="right" className="tabular-nums text-on-surface-variant">
                    {i.costPerUnitCents != null
                      ? formatMoney(i.costPerUnitCents, currency)
                      : '—'}
                  </Td>
                  <Td align="right">
                    <RowAction
                      onClick={() => {
                        setAdding(false);
                        setEditing(i);
                      }}
                    >
                      Edit
                    </RowAction>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {adding || editing ? (
        <IngredientForm
          initial={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
          onSaved={() => {
            setAdding(false);
            setEditing(null);
            refetch({ requestPolicy: 'network-only' });
          }}
        />
      ) : null}
    </div>
  );
}

function IngredientForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: Ingredient | null;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const [name, setName] = useState(initial?.name ?? '');
  const [unit, setUnit] = useState(initial?.unit ?? '');
  const [cost, setCost] = useState(
    initial?.costPerUnitCents != null
      ? (initial.costPerUnitCents / 100).toFixed(2)
      : '',
  );
  const [{ fetching }, upsert] = useMutation(UpsertIngredientDocument);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim() || !unit.trim()) {
      toast.error('Name and unit are required.');
      return;
    }
    const costCents = cost ? Math.round(Number.parseFloat(cost) * 100) : null;
    const result = await upsert({
      id: initial?.id ?? null,
      name: name.trim(),
      unit: unit.trim(),
      costPerUnitCents: Number.isFinite(costCents as number) ? costCents : null,
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(initial ? 'Ingredient updated' : 'Ingredient created');
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-on-background/40 p-4 backdrop-blur-sm">
      <form
        onSubmit={submit}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-card-padding shadow-overlay-soft"
      >
        <h2 className="font-display text-headline-md font-semibold text-on-surface">
          {initial ? `Edit ${initial.name}` : 'New ingredient'}
        </h2>
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Name
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder='e.g. "Beef patty 6oz"'
            className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Unit
          </span>
          <input
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            placeholder='each, lb, kg, L, ml…'
            className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className="font-label-caps text-label-caps uppercase tracking-wider text-on-surface-variant">
            Cost / unit (optional)
          </span>
          <input
            type="number"
            step="0.01"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
            placeholder="e.g. 2.50"
            className="h-12 rounded-lg border border-outline-variant bg-surface-container-lowest px-4 text-body-staff text-on-surface focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </label>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-outline-variant px-4 py-2 text-body-staff font-semibold text-on-surface-variant hover:bg-surface-container"
          >
            Cancel
          </button>
          <Button
            type="submit"
            disabled={fetching}
            className="bg-primary text-on-primary hover:opacity-90"
          >
            {fetching ? 'Saving…' : initial ? 'Save changes' : 'Create'}
          </Button>
        </div>
      </form>
    </div>
  );
}

// ── Movements tab ─────────────────────────────────────

function MovementsTab(): React.JSX.Element {
  const [{ data, fetching }] = useQuery({
    query: StockMovementsDocument,
    variables: { ingredientId: null, limit: 100 },
    requestPolicy: 'cache-and-network',
  });
  const movements: Movement[] = (data?.stockMovements ?? []).filter(
    (m): m is Movement => Boolean(m),
  );

  const KIND_PILL: Record<string, string> = {
    RESTOCK: 'bg-success-container text-on-success-container',
    SALE_DEDUCT: 'bg-primary-container text-on-primary-container',
    WASTE: 'bg-error-container text-on-error-container',
    COUNT_ADJUST: 'bg-secondary-container text-on-secondary-container',
    TRANSFER_IN: 'bg-success-container text-on-success-container',
    TRANSFER_OUT: 'bg-warning-container text-on-warning-container',
  };

  if (fetching && movements.length === 0) {
    return <p className="text-body-staff text-on-surface-variant">Loading…</p>;
  }
  if (movements.length === 0) {
    return (
      <EmptyState
        title="No movements yet"
        description="Record a restock on the Stock tab, or close a ticket whose menu items have recipes — the system writes movements automatically on sale."
      />
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest shadow-card-soft">
      <table className="w-full text-body-staff">
        <thead className="border-b border-outline-variant bg-surface-container-low">
          <tr>
            <Th>When</Th>
            <Th>Ingredient</Th>
            <Th>Kind</Th>
            <Th align="right">Quantity</Th>
            <Th>By</Th>
            <Th>Note</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/40">
          {movements.map((m) => {
            const q = m.quantity ?? 0;
            const positive = q > 0;
            return (
              <tr key={m.id}>
                <Td className="font-status-pill text-status-pill tabular-nums text-on-surface-variant">
                  {new Date(m.createdAt).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Td>
                <Td>
                  <span className="font-semibold text-on-surface">
                    {m.ingredient?.name ?? '—'}
                  </span>
                </Td>
                <Td>
                  <span
                    className={`rounded-full px-2 py-0.5 font-status-pill text-status-pill uppercase tracking-wider ${KIND_PILL[m.kind ?? ''] ?? ''}`}
                  >
                    {(m.kind ?? '').replace('_', ' ').toLowerCase()}
                  </span>
                </Td>
                <Td
                  align="right"
                  className={[
                    'font-display font-bold tabular-nums',
                    positive ? 'text-success' : 'text-on-surface',
                  ].join(' ')}
                >
                  {positive ? '+' : ''}
                  {q.toFixed(2)} {m.ingredient?.unit ?? ''}
                </Td>
                <Td className="text-on-surface-variant">
                  {m.createdBy?.name ?? <em className="italic">system</em>}
                </Td>
                <Td className="text-on-surface-variant">{m.note ?? '—'}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
