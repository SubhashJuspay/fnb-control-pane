import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { CashDrawerWorkspace } from '@/components/cash-drawer/cash-drawer-workspace';

interface PageProps {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}

export default async function CashDrawerPage({ params }: PageProps) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  const canDeposit =
    tenant.role === 'OWNER' || tenant.role === 'ADMIN' || tenant.role === 'MANAGER';
  return (
    <CashDrawerWorkspace
      locationName={location.name}
      currency={location.currency ?? 'USD'}
      canDeposit={canDeposit}
    />
  );
}
