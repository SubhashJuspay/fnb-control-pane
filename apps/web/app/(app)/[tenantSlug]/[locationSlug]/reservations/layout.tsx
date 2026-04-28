import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const STAFF_ROLES = new Set(['STAFF', 'MANAGER', 'ADMIN', 'OWNER']);

/**
 * Reservations book — staff scope (read). Manager-only writes are gated in
 * the UI by the `canManagerActions` flag passed to client components.
 */
export default async function ReservationsLayout({
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
