'use client';

import {
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  formatMoney,
} from '@repo/ui';
import { Trash2 } from 'lucide-react';
import { useCart } from './cart-state';

export interface CartDrawerProps {
  tenantSlug: string;
  locationSlug: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CartDrawer({
  tenantSlug,
  locationSlug,
  currency,
  open,
  onOpenChange,
}: CartDrawerProps): React.JSX.Element {
  const { items, totalCents, removeItem, setQuantity } = useCart();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle>Your cart</SheetTitle>
          <SheetDescription>
            Review your items before checkout. Pay on pickup.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-3">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your cart is empty.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {items.map((item) => {
                const lineTotal =
                  (item.unitPriceCents + item.modifiersTotalCents) * item.quantity;
                return (
                  <li
                    key={item.lineId}
                    className="flex flex-col gap-1 rounded-md border p-3"
                    data-testid={`cart-line-${item.name}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.name}</p>
                        {item.modifiers.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {item.modifiers.map((m) => m.name).join(', ')}
                          </p>
                        ) : null}
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMoney(lineTotal, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setQuantity(item.lineId, item.quantity - 1)}
                          aria-label="Decrease quantity"
                        >
                          −
                        </Button>
                        <span className="w-8 text-center text-sm tabular-nums">
                          {item.quantity}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setQuantity(item.lineId, item.quantity + 1)}
                          aria-label="Increase quantity"
                        >
                          +
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.lineId)}
                        aria-label="Remove item"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <SheetFooter className="flex flex-col gap-2 sm:flex-col">
          <div className="flex items-center justify-between text-sm">
            <span>Subtotal</span>
            <span className="font-semibold tabular-nums">
              {formatMoney(totalCents, currency)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Tax and final total are confirmed at pickup.
          </p>
          <Button
            type="button"
            disabled={items.length === 0}
            data-testid="cart-checkout-button"
            onClick={() => {
              if (items.length === 0) return;
              window.location.href = `/order/${tenantSlug}/${locationSlug}/checkout`;
            }}
          >
            Checkout
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
