import { GuestsTable } from '@/components/guests/guests-table';

export default async function GuestsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  return <GuestsTable tenantSlug={tenantSlug} locationSlug={locationSlug} />;
}
