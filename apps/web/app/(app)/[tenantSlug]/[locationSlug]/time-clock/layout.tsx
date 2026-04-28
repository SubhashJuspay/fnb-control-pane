import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const STAFF_ROLES = new Set(['STAFF', 'MANAGER', 'ADMIN', 'OWNER']);

/**
 * Time-clock — staff scope. Any active staff role at the location can punch
 * themselves in/out. The api enforces staff scope on punchIn/punchOut/etc.
 */
export default async function TimeClockLayout({
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
  if (!STAFF_ROLES.has(tenant.role)) {
    redirect(`/${tenantSlug}/${locationSlug}`);
  }
  return <div className="flex h-full flex-col">{children}</div>;
}
