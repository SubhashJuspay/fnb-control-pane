'use client';

import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { Provider as UrqlProvider } from 'urql';
import { formatMoney } from '@repo/ui';
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
  acceptingOrders?: boolean;
  closedReason?: string | null;
  children: ReactNode;
}

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
    <div className="flex min-h-screen flex-col bg-background text-on-surface">
      <header
        className="sticky top-0 z-40 flex h-16 w-full items-center justify-between gap-3 border-b border-outline-variant bg-surface px-4 shadow-sm sm:px-container-margin"
        data-testid="order-shell-header"
      >
        <Link
          href={`/order/${tenantSlug}/${locationSlug}`}
          className="flex min-w-0 flex-1 items-center gap-3"
          data-testid="order-shell-home-link"
        >
          {/* Brand name: smaller and single-line truncated on mobile so a long
              tenant name doesn't wrap into the header. Restores headline size
              from `sm` upwards. */}
          <h1
            className="min-w-0 truncate font-display text-[18px] font-bold text-primary sm:text-headline-md"
            data-testid="order-shell-tenant"
          >
            {tenantName}
          </h1>
          <span className="hidden items-center gap-2 rounded-full bg-surface-container px-3 py-1 md:inline-flex">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              location_on
            </span>
            <span
              className="text-body-staff font-semibold text-on-surface"
              data-testid="order-shell-location"
            >
              {locationName}
            </span>
          </span>
        </Link>
        {showCart ? (
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            data-testid="order-cart-button"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-primary px-3 py-2 font-label-caps text-label-caps text-on-primary transition-transform active:scale-95 sm:px-4"
          >
            <span className="material-symbols-outlined text-[18px]">shopping_cart</span>
            {/* Mobile shows just the count badge; full summary appears from sm:. */}
            <span data-testid="order-cart-summary" className="hidden sm:inline">
              {hasItems
                ? `Cart (${itemCount}) · ${formatMoney(totalCents, currency)}`
                : 'Cart'}
            </span>
            {hasItems ? (
              <span
                className="inline sm:hidden"
                aria-label={`${itemCount} in cart`}
              >
                {itemCount}
              </span>
            ) : null}
          </button>
        ) : null}
      </header>

      <main
        className={[
          'mx-auto w-full max-w-6xl flex-1 px-4 py-gutter sm:px-container-margin sm:py-stack-loose',
          showCart && hasItems ? 'pb-28' : '',
        ].join(' ')}
      >
        {children}
      </main>

      {showCart && hasItems ? (
        <footer
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-outline-variant bg-surface-container-lowest px-4 py-3 shadow-bottom-bar sm:px-container-margin"
          data-testid="order-review-bar"
        >
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="flex min-w-0 flex-col">
              <span className="text-status-pill font-status-pill uppercase tracking-tight text-on-surface-variant">
                Current order
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-body-staff font-bold text-on-surface">
                  {itemCount === 1 ? '1 item' : `${itemCount} items`}
                </span>
                <span
                  className="text-lg font-bold tabular-nums text-primary"
                  data-testid="order-review-bar-total"
                >
                  {formatMoney(totalCents, currency)}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              data-testid="order-review-bar-cta"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-primary px-5 py-3 font-bold text-on-primary shadow-card-soft transition-all hover:bg-primary-container active:scale-95 sm:px-8"
            >
              <span className="hidden sm:inline">Review order ({itemCount})</span>
              <span className="sm:hidden">Review ({itemCount})</span>
              <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
            </button>
          </div>
        </footer>
      ) : null}

      {!acceptingOrders && closedReason ? (
        <div className="sr-only" role="status">
          {closedReason}
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
