import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { ReceiptCard } from '@/components/order/receipt-card';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string; token: string }>;
}

export default async function ReceiptPage({ params }: PageProps) {
  const { tenantSlug, locationSlug, token } = await params;
  const result = await serverFetch<PublicLocationBySlugQuery>({
    query: print(PublicLocationBySlugDocument),
    variables: { tenantSlug, locationSlug, at: null },
  });
  const location = result.data?.publicLocationBySlug;
  if (!location) notFound();
  return (
    <OrderShell
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={location.tenantName ?? ''}
      locationName={location.name ?? ''}
      currency={location.currency ?? 'USD'}
      showCart={false}
    >
      <ReceiptCard token={token} currency={location.currency ?? 'USD'} />
    </OrderShell>
  );
}
