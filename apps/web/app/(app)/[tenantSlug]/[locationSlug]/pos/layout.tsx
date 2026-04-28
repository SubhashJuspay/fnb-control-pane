import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const STAFF_ROLES = new Set(['STAFF', 'MANAGER', 'ADMIN', 'OWNER']);

/**
 * Location-scoped POS layout. Requires at least `STAFF` role at the location
 * (matching the api's `authScopes: { staff: true }` on every ticket
 * mutation/query). Renders a flush, full-bleed shell because the POS is a
 * touch-first surface — no breadcrumbs or generic page chrome.
 */
export default async function PosLayout({
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
