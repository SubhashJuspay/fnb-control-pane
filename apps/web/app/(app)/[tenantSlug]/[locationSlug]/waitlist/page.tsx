import { redirect } from 'next/navigation';
import { WaitlistPage } from '@/components/reservations/waitlist-page';
import { loadAppShellData } from '@/lib/viewer';

export default async function WaitlistRoute({
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
    <WaitlistPage
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      locationName={location.name}
    />
  );
}
