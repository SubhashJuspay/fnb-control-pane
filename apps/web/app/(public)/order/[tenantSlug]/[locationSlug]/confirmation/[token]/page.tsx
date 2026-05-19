import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { OrderShell } from '@/components/order/order-shell';
import { ConfirmationCard } from '@/components/order/confirmation-card';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string; token: string }>;
  searchParams: Promise<{ n?: string; table?: string | string[] }>;
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

export default async function ConfirmationPage({ params, searchParams }: PageProps) {
  const { tenantSlug, locationSlug, token } = await params;
  const { n, table } = await searchParams;
  const result = await serverFetch<PublicLocationBySlugQuery>({
    query: print(PublicLocationBySlugDocument),
    variables: { tenantSlug, locationSlug, at: null },
  });
  const location = result.data?.publicLocationBySlug;
  if (!location) notFound();
  const shortNumber = n != null && /^\d+$/.test(n) ? Number.parseInt(n, 10) : null;
  const tableSlug = normalizeTableSlug(table);
  return (
    <OrderShell
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      tenantName={location.tenantName ?? ''}
      locationName={location.name ?? ''}
      currency={location.currency ?? 'USD'}
      showCart={false}
    >
      <ConfirmationCard
        tenantSlug={tenantSlug}
        locationSlug={locationSlug}
        token={token}
        shortNumber={shortNumber}
        tableSlug={tableSlug}
      />
    </OrderShell>
  );
}
