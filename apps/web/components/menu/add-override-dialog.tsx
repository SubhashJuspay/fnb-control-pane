'use client';

import { useEffect, useState } from 'react';
import { useMutation } from 'urql';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  MoneyInput,
  formatMoney,
} from '@repo/ui';
import { ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { UpsertLocationItemDocument } from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

interface AddOverrideItem {
  id: string;
  name: string;
  basePriceCents: number;
  imageUrl: string | null;
  /** Existing override fields, when re-editing. */
  stockOnHand?: number | null;
  lowStockThreshold?: number | null;
}

interface AddOverrideDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: AddOverrideItem;
  onSaved: () => void;
}

export function AddOverrideDialog({
  open,
  onOpenChange,
  item,
  onSaved,
}: AddOverrideDialogProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const [, upsertOverride] = useMutation(UpsertLocationItemDocument);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [available, setAvailable] = useState(true);
  const [trackStock, setTrackStock] = useState(false);
  const [stockOnHand, setStockOnHand] = useState<string>('');
  const [lowStockThreshold, setLowStockThreshold] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Reset state when the dialog opens with a new item.
  useEffect(() => {
    if (open) {
      setPriceCents(null);
      setHidden(false);
      setAvailable(true);
      const tracking = item.stockOnHand != null;
      setTrackStock(tracking);
      setStockOnHand(tracking ? String(item.stockOnHand) : '');
      setLowStockThreshold(
        item.lowStockThreshold != null ? String(item.lowStockThreshold) : '',
      );
    }
  }, [open, item.id, item.stockOnHand, item.lowStockThreshold]);

  const onSave = async (): Promise<void> => {
    setSubmitting(true);
    const stockNum = Number.parseInt(stockOnHand, 10);
    const lowNum = Number.parseInt(lowStockThreshold, 10);
    const result = await upsertOverride({
      input: {
        menuItemId: item.id,
        priceCents,
        hidden,
        available,
        stockOnHand: trackStock && Number.isFinite(stockNum) ? stockNum : null,
        lowStockThreshold:
          trackStock && Number.isFinite(lowNum) ? lowNum : null,
      },
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Override saved');
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Override {item.name}</DialogTitle>
          <DialogDescription>
            Adjust this item&apos;s price or hide it for this location only.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-md border p-3">
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
            <div>
              <p className="font-medium">{item.name}</p>
              <p className="text-xs text-muted-foreground">
                Base {formatMoney(item.basePriceCents, currency)}
              </p>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="override-price">Location price (optional)</Label>
            <MoneyInput
              id="override-price"
              value={priceCents}
              onChange={setPriceCents}
              placeholder="Leave blank to use base price"
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={hidden}
              onChange={(e) => setHidden(e.target.checked)}
            />
            Hide this item at this location
          </label>
          <label className="flex items-center gap-2 text-sm" data-testid="override-mark-86">
            <input
              type="checkbox"
              checked={!available}
              onChange={(e) => setAvailable(!e.target.checked)}
            />
            Mark 86 (out of stock)
          </label>
          <div className="rounded-md border p-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                data-testid="override-track-stock"
                checked={trackStock}
                onChange={(e) => setTrackStock(e.target.checked)}
              />
              Track inventory at this location
            </label>
            {trackStock ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="override-stock">On hand</Label>
                  <input
                    id="override-stock"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={stockOnHand}
                    onChange={(e) => setStockOnHand(e.target.value)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    data-testid="override-stock"
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="override-threshold">Low-stock at</Label>
                  <input
                    id="override-threshold"
                    type="number"
                    min={0}
                    inputMode="numeric"
                    placeholder="e.g. 5"
                    value={lowStockThreshold}
                    onChange={(e) => setLowStockThreshold(e.target.value)}
                    className="h-9 rounded-md border bg-background px-3 text-sm"
                    data-testid="override-threshold"
                  />
                </div>
              </div>
            ) : null}
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={onSave} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save override'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
