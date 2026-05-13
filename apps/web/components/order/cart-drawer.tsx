'use client';

import { useEffect, useRef, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
import { Loader2, Trash2 } from 'lucide-react';
import { useCart } from './cart-state';

export interface CartDrawerProps {
  tenantSlug: string;
  locationSlug: string;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When false, the checkout button is disabled. */
  acceptingOrders?: boolean;
  closedReason?: string | null;
}

export function CartDrawer({
  tenantSlug,
  locationSlug,
  currency,
  open,
  onOpenChange,
  acceptingOrders = true,
  closedReason = null,
}: CartDrawerProps): React.JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  // useTransition lets us mark the router.push as pending so the Checkout
  // button can show a spinner until the next page's server-rendered HTML
  // arrives — without that, the drawer just closes and the customer stares
  // at nothing for the network round-trip, often clicking twice.
  const [navigating, startNavigation] = useTransition();
  // Track the path the drawer was opened on; once pathname changes after a
  // Checkout / Continue-shopping click, close the drawer. Without this the
  // drawer stays open under the new route (since the button keeps it open
  // through the transition).
  const openedOnPath = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      openedOnPath.current = null;
      return;
    }
    if (openedOnPath.current === null) {
      openedOnPath.current = pathname;
    } else if (pathname !== openedOnPath.current) {
      onOpenChange(false);
    }
  }, [open, pathname, onOpenChange]);
  const { items, totalCents, itemCount, hydrated, removeItem, setQuantity } = useCart();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle>
            Your cart
            {itemCount > 0 ? (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                ({itemCount} {itemCount === 1 ? 'item' : 'items'})
              </span>
            ) : null}
          </SheetTitle>
          <SheetDescription>
            Review your items, then place a pickup order. Pay when you collect.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-3">
          {!hydrated ? (
            <p className="text-sm text-muted-foreground">Loading cart…</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-md border border-dashed px-4 py-10 text-center">
              <p className="text-sm font-medium">Your cart is empty</p>
              <p className="text-xs text-muted-foreground">
                Tap any menu item to add it to your order.
              </p>
            </div>
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
          {!acceptingOrders ? (
            <p
              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"
              data-testid="cart-closed-banner"
            >
              {closedReason ?? 'This location is currently closed for online orders.'}
            </p>
          ) : null}
          <Button
            type="button"
            disabled={items.length === 0 || !acceptingOrders || navigating}
            data-testid="cart-checkout-button"
            onClick={() => {
              if (items.length === 0 || !acceptingOrders || navigating) return;
              startNavigation(() => {
                router.push(`/order/${tenantSlug}/${locationSlug}/checkout`);
              });
            }}
          >
            {navigating ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                Processing...
              </>
            ) : (
              'Checkout'
            )}
          </Button>
          {items.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                onOpenChange(false);
                // "Continue shopping" should always land on the menu
                // storefront. Without this, clicking the button from
                // /checkout (or any other subroute) just closes the drawer
                // and leaves the user on the same non-menu page.
                const menuPath = `/order/${tenantSlug}/${locationSlug}`;
                if (pathname !== menuPath) {
                  router.push(menuPath);
                }
              }}
              data-testid="cart-continue-button"
            >
              Continue shopping
            </Button>
          ) : null}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
