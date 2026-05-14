import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { TipPoolWorkspace } from '@/components/tip-pool/tip-pool-workspace';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

export default async function TipPoolPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  return (
    <TipPoolWorkspace
      locationName={location.name}
      currency={location.currency ?? 'USD'}
    />
  );
}
