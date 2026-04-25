'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from 'urql';
import {
  Button,
  MoneyInput,
  formatMoney,
  useSortableItem,
} from '@repo/ui';
import { GripVertical, ImageOff, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  RemoveItemFromMenuSectionDocument,
  UpdateMenuSectionItemDocument,
  type LocationMenuQuery,
} from '@/lib/graphql/generated/graphql';
import { useLocationCurrency } from '@/lib/location-currency';

type SectionItem = NonNullable<
  NonNullable<NonNullable<NonNullable<LocationMenuQuery['locationMenu']>['sections']>[number]>['items']
>[number];

interface MenuSectionItemRowProps {
  item: NonNullable<SectionItem>;
  onChanged: () => void;
}

const PRICE_DEBOUNCE_MS = 600;

export function MenuSectionItemRow({ item, onChanged }: MenuSectionItemRowProps): React.JSX.Element {
  const currency = useLocationCurrency();
  const id = item.id ?? '';
  const { ref, attributes, listeners, style } = useSortableItem(id);
  const [, updateItem] = useMutation(UpdateMenuSectionItemDocument);
  const [, removeItem] = useMutation(RemoveItemFromMenuSectionDocument);

  const [override, setOverride] = useState<number | null>(item.priceOverrideCents ?? null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync if upstream value changes (e.g. another tab) and we don't have an
  // in-flight edit pending.
  useEffect(() => {
    if (debounceRef.current) return;
    setOverride(item.priceOverrideCents ?? null);
  }, [item.priceOverrideCents]);

  const onPriceChange = (cents: number | null): void => {
    setOverride(cents);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await updateItem({
        input: { id, priceOverrideCents: cents },
      });
      debounceRef.current = null;
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onChanged();
    }, PRICE_DEBOUNCE_MS);
  };

  const onRemove = async (): Promise<void> => {
    const result = await removeItem({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item removed from section');
    onChanged();
  };

  const menuItem = item.menuItem;
  const basePrice = menuItem?.basePriceCents ?? 0;
  const hasOverride = override !== null && override !== undefined;

  return (
    <li
      ref={ref}
      style={style}
      className="flex items-center gap-3 rounded-md border bg-surface px-2 py-2"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${menuItem?.name ?? ''}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      {menuItem?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={menuItem.imageUrl}
          alt=""
          className="h-16 w-16 shrink-0 rounded object-cover bg-muted"
          width={64}
          height={64}
        />
      ) : (
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
          <ImageOff className="h-5 w-5" aria-hidden />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="truncate font-medium">{menuItem?.name ?? '—'}</p>
        <p className="text-xs text-muted-foreground">
          Base{' '}
          <span className={hasOverride ? 'line-through' : ''}>
            {formatMoney(basePrice, currency)}
          </span>
        </p>
      </div>
      <div className="grid w-32 gap-1">
        <label className="text-xs text-muted-foreground" htmlFor={`item-price-${id}`}>
          Price override
        </label>
        <MoneyInput
          id={`item-price-${id}`}
          value={override}
          onChange={onPriceChange}
          placeholder="Use base"
        />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Remove ${menuItem?.name ?? ''} from section`}
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </li>
  );
}
