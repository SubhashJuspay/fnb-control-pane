import { redirect } from 'next/navigation';
import { ReservationsPage } from '@/components/reservations/reservations-page';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

export default async function ReservationsRoute({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  return (
    <ReservationsPage
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      locationName={location.name}
      canManagerActions={MANAGER_ROLES.has(tenant.role)}
    />
  );
}
