import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { TrackingPage } from '@/components/order/tracking-page';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string; token: string }>;
}

export default async function TrackPage({ params }: PageProps) {
  const { tenantSlug, locationSlug, token } = await params;
  const result = await serverFetch<PublicLocationBySlugQuery>({
    query: print(PublicLocationBySlugDocument),
    variables: { tenantSlug, locationSlug, at: null },
  });
  const location = result.data?.publicLocationBySlug;
  if (!location) notFound();
  const currency = location.currency ?? 'USD';
  return (
    <OrderShell
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={location.tenantName ?? ''}
      locationName={location.name ?? ''}
      currency={currency}
      showCart={false}
    >
      <TrackingPage
        token={token}
        currency={currency}
        tenantSlug={tenantSlug}
        locationSlug={locationSlug}
      />
    </OrderShell>
  );
}
