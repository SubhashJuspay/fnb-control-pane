import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

/**
 * Time-entries report — manager scope. Defends in depth alongside the api's
 * `manager: true` authScope on `timeEntries` and `editTimeEntry`.
 */
export default async function TimeEntriesLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const location = tenant.locations.find((l) => l.slug === locationSlug);
  if (!location) redirect(`/${tenantSlug}/overview`);
  if (!MANAGER_ROLES.has(tenant.role)) {
    redirect(`/${tenantSlug}/${locationSlug}`);
  }
  return <div className="flex h-full flex-col">{children}</div>;
}
