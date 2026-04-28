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
  children,
}: Omit<OrderShellProps, 'showCart'> & { showCart: boolean }): React.JSX.Element {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { itemCount, totalCents } = useCart();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
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
                {itemCount > 0 ? `${itemCount} • ${formatMoney(totalCents, currency)}` : 'Cart'}
              </span>
              {itemCount > 0 ? (
                <span
                  aria-hidden
                  className="ml-1 inline-flex h-2 w-2 rounded-full bg-primary"
                />
              ) : null}
            </Button>
          ) : null}
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-4">{children}</main>
      {showCart ? (
        <CartDrawer
          tenantSlug={tenantSlug}
          locationSlug={locationSlug}
          currency={currency}
          open={drawerOpen}
          onOpenChange={setDrawerOpen}
        />
      ) : null}
    </div>
  );
}
