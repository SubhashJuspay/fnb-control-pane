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
  const [submitting, setSubmitting] = useState(false);

  // Reset state when the dialog opens with a new item.
  useEffect(() => {
    if (open) {
      setPriceCents(null);
      setHidden(false);
    }
  }, [open, item.id]);

  const onSave = async (): Promise<void> => {
    setSubmitting(true);
    const result = await upsertOverride({
      input: { menuItemId: item.id, priceCents, hidden },
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
