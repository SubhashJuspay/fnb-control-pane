import { redirect } from 'next/navigation';
import { KdsBoard } from '@/components/kds/kds-board';
import { loadAppShellData } from '@/lib/viewer';

export default async function KdsPage({
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
  return <KdsBoard locationName={location.name} />;
}
