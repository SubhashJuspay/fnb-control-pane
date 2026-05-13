import { print } from 'graphql';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import {
  PublicLocationBySlugDocument,
  type PublicLocationBySlugQuery,
} from '@/lib/graphql/generated/graphql';
import { LocationHero } from '@/components/order/location-hero';
import { BookingForm } from '@/components/booking/booking-form';
import { BookingShell } from '@/components/booking/booking-shell';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

export default async function BookingPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const result = await serverFetch<PublicLocationBySlugQuery>({
    query: print(PublicLocationBySlugDocument),
    variables: { tenantSlug, locationSlug, at: null },
  });
  const location = result.data?.publicLocationBySlug;
  if (!location) notFound();

  return (
    <BookingShell>
      <LocationHero
        tenantName={location.tenantName ?? ''}
        locationName={location.name ?? ''}
        currency={location.currency ?? 'USD'}
        timezone={location.timezone ?? 'UTC'}
        phone={location.phone ?? null}
        address={location.address ?? null}
        openingHours={location.openingHours ?? null}
      />
      <h1 className="mb-3 text-lg font-semibold">Book a table</h1>
      <BookingForm tenantSlug={tenantSlug} locationSlug={locationSlug} />
    </BookingShell>
  );
}
