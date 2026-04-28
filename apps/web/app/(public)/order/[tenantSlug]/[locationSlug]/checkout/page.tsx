import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { CheckoutForm } from '@/components/order/checkout-form';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

export default async function CheckoutPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
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
    >
      <h1 className="mb-4 text-lg font-semibold">Checkout</h1>
      <CheckoutForm
        tenantSlug={tenantSlug}
        locationSlug={locationSlug}
        currency={currency}
      />
    </OrderShell>
  );
}
