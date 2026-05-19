import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { computeOpenStatus, parseOpeningHours } from '@repo/types';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { PublicMenuList } from '@/components/order/public-menu-list';
import { LocationHero } from '@/components/order/location-hero';
import { TableTabValidator } from '@/components/order/table-tab-validator';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
  searchParams: Promise<{
    table?: string | string[];
    kiosk?: string | string[];
  }>;
}

/**
 * Normalize an incoming `?table=` value to the canonical slug shape we use
 * everywhere else (lowercase, ascii alphanumerics, single hyphens). Returns
 * null when the input is missing or doesn't contain anything we can salvage.
 */
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
 * Anonymous public order surface — entry point for customers ordering for
 * pickup. Server-renders the menu via the public `publicLocationBySlug`
 * query (no auth, no tenant headers) and hydrates a client-side
 * `<OrderShell>` providing the cart + anonymous urql client.
 */
export default async function PublicOrderPage({ params, searchParams }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const { table, kiosk } = await searchParams;
  const tableSlug = normalizeTableSlug(table);
  const kioskMode = Boolean(kiosk && (Array.isArray(kiosk) ? kiosk[0] : kiosk) === '1');
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
      tableSlug={tableSlug}
      tableLabel={tableSlug}
      kioskMode={kioskMode}
    >
      {/* Wipe any cached "open order" state that's no longer valid —
          e.g. the ticket was closed by staff while the customer wasn't
          watching the track page. Renders nothing. */}
      <TableTabValidator />
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
          className="mb-gutter flex items-start gap-3 rounded-xl border border-error/30 bg-error-container p-4 text-error-on-container"
          data-testid="closed-banner"
          role="status"
        >
          <span
            aria-hidden
            className="material-symbols-outlined shrink-0 text-[20px]"
          >
            lock
          </span>
          <div className="flex flex-col gap-0.5 text-body-staff">
            <p className="font-semibold">We&apos;re not taking orders right now</p>
            <p>{closedReason ?? 'Please check back during opening hours.'}</p>
          </div>
        </div>
      ) : null}
      <PublicMenuList menus={menus} currency={currency} />
    </OrderShell>
  );
}
