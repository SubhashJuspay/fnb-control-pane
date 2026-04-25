'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  cn,
} from '@repo/ui';
import { ChevronDown, ChevronRight, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import {
  CatalogTaxCategoriesDocument,
  CreateTaxCategoryDocument,
  SetTaxRateDocument,
  TaxCategoryKind,
  type CatalogTaxCategoriesQuery,
} from '@/lib/graphql/generated/graphql';
import { LocationTaxRates } from './location-tax-rates';

type TaxCategory = NonNullable<NonNullable<CatalogTaxCategoriesQuery['catalogTaxCategories']>[number]>;

const KIND_OPTIONS = ['FOOD', 'NON_ALCOHOL_BEV', 'ALCOHOL', 'RETAIL', 'OTHER'] as const;

interface LocationLite {
  id: string;
  name: string;
}

interface TaxesTableProps {
  locations: LocationLite[];
}

export function TaxesTable({ locations }: TaxesTableProps): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: CatalogTaxCategoriesDocument,
  });
  const [, createTaxCategory] = useMutation(CreateTaxCategoryDocument);
  const [, setTaxRate] = useMutation(SetTaxRateDocument);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [setRateFor, setSetRateFor] = useState<{
    taxCategoryId: string;
    taxCategoryName: string;
    locationId: string;
    locationName: string;
  } | null>(null);

  const taxCategories: TaxCategory[] = (data?.catalogTaxCategories ?? []).filter(
    (t): t is TaxCategory => t != null && Boolean(t.id) && !t.archivedAt,
  );

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const refresh = (): void => refetch({ requestPolicy: 'network-only' });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Tax categories & rates</h2>
          <p className="text-sm text-muted-foreground">
            Manage tax categories at the tenant level; set rates per location with effective-from
            dates.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>New tax category</Button>
      </div>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      {!fetching && taxCategories.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No tax categories yet"
          description="Create one to start assigning rates to your menu items."
          action={<Button onClick={() => setCreateOpen(true)}>New tax category</Button>}
        />
      ) : (
        <Card>
          <CardContent className="pt-6">
            <ul className="flex flex-col gap-2">
              {taxCategories.map((cat) => {
                const id = cat.id ?? '';
                const open = expanded.has(id);
                return (
                  <li key={id} className="rounded-md border">
                    <button
                      type="button"
                      onClick={() => toggle(id)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-left',
                        open ? 'border-b' : '',
                      )}
                      aria-expanded={open}
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">{cat.name ?? '—'}</span>
                      <span className="ml-2 text-xs uppercase tracking-wide text-muted-foreground">
                        {cat.kind ?? '—'}
                      </span>
                    </button>
                    {open ? (
                      <div className="bg-muted/30 px-3 py-3">
                        {locations.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Add a location before setting tax rates.
                          </p>
                        ) : (
                          <LocationTaxRates
                            taxCategoryId={id}
                            taxCategoryName={cat.name ?? ''}
                            locations={locations}
                            onSetRateClick={setSetRateFor}
                          />
                        )}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
      <CreateTaxCategoryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={async (input) => {
          const result = await createTaxCategory({ input });
          if (result.error) {
            toast.error(result.error.message);
            return false;
          }
          toast.success('Tax category created');
          refresh();
          return true;
        }}
      />
      <SetTaxRateDialog
        config={setRateFor}
        onClose={() => setSetRateFor(null)}
        onSubmit={async (rateInput) => {
          const result = await setTaxRate({ input: rateInput });
          if (result.error) {
            toast.error(result.error.message);
            return false;
          }
          toast.success('Tax rate set');
          refresh();
          return true;
        }}
      />
    </div>
  );
}

interface CreateTaxCategoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (input: { name: string; kind: TaxCategoryKind }) => Promise<boolean>;
}

function CreateTaxCategoryDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateTaxCategoryDialogProps): React.JSX.Element {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TaxCategoryKind>(TaxCategoryKind.Food);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit({ name: name.trim(), kind });
    setSubmitting(false);
    if (ok) {
      setName('');
      setKind(TaxCategoryKind.Food);
      onOpenChange(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setName('');
          setKind(TaxCategoryKind.Food);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New tax category</DialogTitle>
          <DialogDescription>
            Tax categories live at the tenant level; rates are set per location.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="tc-name">Name</Label>
            <Input id="tc-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="tc-kind">Kind</Label>
            <select
              id="tc-kind"
              className={cn(
                'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              value={kind}
              onChange={(e) => setKind(e.target.value as TaxCategoryKind)}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creating…' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface SetTaxRateDialogConfig {
  taxCategoryId: string;
  taxCategoryName: string;
  locationId: string;
  locationName: string;
}

interface SetTaxRateDialogProps {
  config: SetTaxRateDialogConfig | null;
  onClose: () => void;
  onSubmit: (input: {
    taxCategoryId: string;
    locationId: string;
    ratePermille: number;
    effectiveFrom?: Date;
  }) => Promise<boolean>;
}

function SetTaxRateDialog({ config, onClose, onSubmit }: SetTaxRateDialogProps): React.JSX.Element {
  const [percent, setPercent] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (!config) return;
    const pct = Number(percent);
    if (Number.isNaN(pct) || pct < 0) {
      toast.error('Enter a non-negative percentage');
      return;
    }
    // Permille = pct * 10. e.g. 8.25% -> 82.5 -> rounded to 83 permille is wrong,
    // so we accept up to 4 digits after dot: ratePermille is integer 0..10000.
    const ratePermille = Math.round(pct * 10);
    if (ratePermille > 10_000) {
      toast.error('Rate must be ≤ 1000%');
      return;
    }
    setSubmitting(true);
    const ok = await onSubmit({
      taxCategoryId: config.taxCategoryId,
      locationId: config.locationId,
      ratePermille,
      effectiveFrom: new Date(effectiveFrom),
    });
    setSubmitting(false);
    if (ok) {
      setPercent('');
      onClose();
    }
  };

  const open = config !== null;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set tax rate</DialogTitle>
          <DialogDescription>
            {config ? (
              <>
                Setting rate for <strong>{config.taxCategoryName}</strong> at{' '}
                <strong>{config.locationName}</strong>.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={handleSubmit} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="rate-pct">Rate (%)</Label>
            <Input
              id="rate-pct"
              type="number"
              step="0.1"
              min="0"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              placeholder="e.g. 8.25"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="rate-from">Effective from</Label>
            <Input
              id="rate-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Setting…' : 'Set rate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
