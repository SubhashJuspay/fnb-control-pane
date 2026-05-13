import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { EndOfDayReport } from '@/components/analytics/end-of-day-report';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

export default async function EndOfDayPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  return <EndOfDayReport tenantName={tenant.name} locationName={location.name} />;
}
