import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { Lock } from 'lucide-react';
import { computeOpenStatus, parseOpeningHours } from '@repo/types';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { PublicMenuList } from '@/components/order/public-menu-list';
import { LocationHero } from '@/components/order/location-hero';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

function describeClosed(reopensAt: { time: string; relative: string } | null): string {
  if (!reopensAt) return 'Currently closed for online orders.';
  if (reopensAt.relative === 'tomorrow') {
    return `Currently closed. Opens tomorrow at ${reopensAt.time}.`;
  }
  return `Currently closed. Opens at ${reopensAt.time}.`;
}

/**
 * Anonymous public order surface — entry point for customers ordering for
 * pickup. Server-renders the menu via the public `publicLocationBySlug`
 * query (no auth, no tenant headers) and hydrates a client-side
 * `<OrderShell>` providing the cart + anonymous urql client.
 */
export default async function PublicOrderPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const result = await serverFetch<PublicLocationBySlugQuery>({
    query: print(PublicLocationBySlugDocument),
    variables: { tenantSlug, locationSlug, at: null },
  });
  const location = result.data?.publicLocationBySlug;
  if (!location) {
    notFound();
  }
  const currency = location.currency ?? 'USD';
  const menus = location.activeMenus ?? [];
  const tenantName = location.tenantName ?? '';
  const locationName = location.name ?? '';
  const timezone = location.timezone ?? 'UTC';

  const hours = parseOpeningHours(location.openingHours);
  const status = hours ? computeOpenStatus(hours, timezone) : null;
  const acceptingOrders = status ? status.isOpen : true;
  const closedReason = !acceptingOrders && status ? describeClosed(status.reopensAt) : null;

  return (
    <OrderShell
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={tenantName}
      locationName={locationName}
      currency={currency}
      acceptingOrders={acceptingOrders}
      closedReason={closedReason}
    >
      <LocationHero
        tenantName={tenantName}
        locationName={locationName}
        currency={currency}
        timezone={timezone}
        phone={location.phone ?? null}
        address={location.address ?? null}
        openingHours={location.openingHours ?? null}
      />
      {!acceptingOrders ? (
        <div
          className="mb-4 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 dark:border-rose-900/60 dark:bg-rose-950/40"
          data-testid="closed-banner"
          role="status"
        >
          <Lock className="size-4 shrink-0 text-rose-700 dark:text-rose-300" aria-hidden />
          <div className="flex flex-col gap-0.5 text-sm">
            <p className="font-semibold text-rose-900 dark:text-rose-100">
              We&apos;re not taking orders right now
            </p>
            <p className="text-rose-800 dark:text-rose-200">
              {closedReason ?? 'Please check back during opening hours.'}
            </p>
          </div>
        </div>
      ) : null}
      <PublicMenuList menus={menus} currency={currency} />
    </OrderShell>
  );
}
