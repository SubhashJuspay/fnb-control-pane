import { redirect } from 'next/navigation';
import { PosWorkspace } from '@/components/pos/pos-workspace';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

export default async function PosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const canManagerActions = MANAGER_ROLES.has(tenant.role);
  return (
    <PosWorkspace
      tenantSlug={tenantSlug}
      locationSlug={locationSlug}
      canManagerActions={canManagerActions}
    />
  );
}
