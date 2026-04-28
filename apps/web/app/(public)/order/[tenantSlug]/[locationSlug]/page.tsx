import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { PublicMenuList } from '@/components/order/public-menu-list';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
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

  return (
    <OrderShell
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={location.tenantName ?? ''}
      locationName={location.name ?? ''}
      currency={currency}
    >
      <PublicMenuList menus={menus} currency={currency} />
    </OrderShell>
  );
}
