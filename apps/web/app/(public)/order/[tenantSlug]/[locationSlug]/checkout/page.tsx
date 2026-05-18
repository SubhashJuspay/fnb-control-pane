import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { computeOpenStatus, parseOpeningHours } from '@repo/types';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { CheckoutForm } from '@/components/order/checkout-form';
import { OrderShell } from '@/components/order/order-shell';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
  searchParams: Promise<{
    table?: string | string[];
    kiosk?: string | string[];
  }>;
}

function normalizeTableSlug(raw: string | string[] | undefined): string | null {
  if (!raw) return null;
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (!first) return null;
  const cleaned = first
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

function describeClosed(reopensAt: { time: string; relative: string } | null): string {
  if (!reopensAt) return 'Currently closed for online orders.';
  if (reopensAt.relative === 'tomorrow') {
    return `Currently closed. Opens tomorrow at ${reopensAt.time}.`;
  }
  return `Currently closed. Opens at ${reopensAt.time}.`;
}

/**
 * Dedicated customer checkout page. Replaces the older right-side cart
 * drawer: order summary, customer-info form, and a Proceed button all on
 * one screen. The form is hidden in kiosk mode (`?kiosk=1`) — there the
 * customer is at the kiosk and the button flips to "Pay $X.XX".
 */
export default async function CheckoutPage({ params, searchParams }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const { table, kiosk } = await searchParams;
  const tableSlug = normalizeTableSlug(table);
  const kioskMode = Boolean(kiosk && (Array.isArray(kiosk) ? kiosk[0] : kiosk) === '1');

  const result = await serverFetch<PublicLocationBySlugQuery>({
    query: print(PublicLocationBySlugDocument),
    variables: { tenantSlug, locationSlug, at: null },
  });
  const location = result.data?.publicLocationBySlug;
  if (!location) notFound();
  const currency = location.currency ?? 'USD';
  const timezone = location.timezone ?? 'UTC';
  const hours = parseOpeningHours(location.openingHours);
  const status = hours ? computeOpenStatus(hours, timezone) : null;
  const acceptingOrders = status ? status.isOpen : true;
  const closedReason = !acceptingOrders && status ? describeClosed(status.reopensAt) : null;

  return (
    <OrderShell
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={location.tenantName ?? ''}
      locationName={location.name ?? ''}
      currency={currency}
      acceptingOrders={acceptingOrders}
      closedReason={closedReason}
      tableSlug={tableSlug}
      tableLabel={tableSlug}
      kioskMode={kioskMode}
      // The cart icon + bottom review bar are redundant on this page —
      // the user is already looking at their cart.
      showCart={false}
    >
      <CheckoutForm
        tenantSlug={tenantSlug}
        locationSlug={locationSlug}
        currency={currency}
        acceptingOrders={acceptingOrders}
        closedReason={closedReason}
      />
    </OrderShell>
  );
}
