'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Provider as UrqlProvider } from 'urql';
import { ShoppingCart } from 'lucide-react';
import { Button, formatMoney } from '@repo/ui';
import { createPublicUrqlClient } from './public-graphql-client';
import { CartProvider, useCart } from './cart-state';
import { CartDrawer } from './cart-drawer';

export interface OrderShellProps {
  tenantSlug: string;
  locationSlug: string;
  tenantName: string;
  locationName: string;
  currency: string;
  showCart?: boolean;
  /** When false, cart checkout is disabled. SSR-snapshot only. */
  acceptingOrders?: boolean;
  /** Optional copy for the disabled state (e.g. "Opens at 7am"). */
  closedReason?: string | null;
  children: ReactNode;
}

/**
 * Wraps the public order surface with anonymous urql client + cart provider.
 * Header shows tenant + location, plus a cart icon (toggles `<CartDrawer>`).
 *
 * `showCart` defaults to true; pass false on confirmation/tracking pages
 * where the cart is no longer the primary action.
 */
export function OrderShell({
  tenantSlug,
  locationSlug,
  tenantName,
  locationName,
  currency,
  showCart = true,
  acceptingOrders = true,
  closedReason = null,
  children,
}: OrderShellProps): React.JSX.Element {
  const client = useMemo(() => createPublicUrqlClient(), []);
  return (
    <UrqlProvider value={client}>
      <CartProvider tenantSlug={tenantSlug} locationSlug={locationSlug}>
        <OrderShellInner
          tenantSlug={tenantSlug}
          locationSlug={locationSlug}
          tenantName={tenantName}
          locationName={locationName}
          currency={currency}
          showCart={showCart}
          acceptingOrders={acceptingOrders}
          closedReason={closedReason}
        >
          {children}
        </OrderShellInner>
      </CartProvider>
    </UrqlProvider>
  );
}

function OrderShellInner({
  tenantSlug,
  locationSlug,
  tenantName,
  locationName,
  currency,
  showCart,
  acceptingOrders,
  closedReason,
  children,
}: Omit<OrderShellProps, 'showCart' | 'acceptingOrders' | 'closedReason'> & {
  showCart: boolean;
  acceptingOrders: boolean;
  closedReason: string | null;
}): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { itemCount, totalCents } = useCart();

  const hasItems = itemCount > 0;
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Link
            href={`/order/${tenantSlug}/${locationSlug}`}
            className="flex flex-col"
            data-testid="order-shell-home-link"
          >
            <span className="text-sm font-semibold leading-tight" data-testid="order-shell-tenant">
              {tenantName}
            </span>
            <span className="text-xs text-muted-foreground" data-testid="order-shell-location">
              {locationName}
            </span>
          </Link>
          {showCart ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDrawerOpen(true)}
              data-testid="order-cart-button"
              className="relative"
            >
              <ShoppingCart className="mr-2 size-4" />
              <span data-testid="order-cart-summary">
                {hasItems ? `${itemCount} • ${formatMoney(totalCents, currency)}` : 'Cart'}
              </span>
              {hasItems ? (
                <span
                  aria-hidden
                  className="ml-1 inline-flex h-2 w-2 rounded-full bg-primary"
                />
              ) : null}
            </Button>
          ) : null}
        </div>
      </header>
      <main
        className={[
          'mx-auto w-full max-w-6xl flex-1 px-4 py-4',
          showCart && hasItems ? 'pb-24' : '',
        ].join(' ')}
      >
        {children}
      </main>
      {showCart && hasItems ? (
        <div
          className="sticky bottom-0 z-30 border-t bg-background/95 backdrop-blur"
          data-testid="order-review-bar"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground">
                {itemCount === 1 ? '1 item' : `${itemCount} items`}
              </span>
              <span
                className="text-lg font-bold tabular-nums"
                data-testid="order-review-bar-total"
              >
                {formatMoney(totalCents, currency)}
              </span>
            </div>
            <Button
              type="button"
              size="lg"
              onClick={() => setDrawerOpen(true)}
              data-testid="order-review-bar-cta"
              className="min-w-[180px]"
            >
              Review order ({itemCount})
            </Button>
          </div>
        </div>
      ) : null}
      {showCart ? (
        <CartDrawer
          tenantSlug={tenantSlug}
          locationSlug={locationSlug}
          currency={currency}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
          acceptingOrders={acceptingOrders}
          closedReason={closedReason}
        />
      ) : null}
    </div>
  );
}
