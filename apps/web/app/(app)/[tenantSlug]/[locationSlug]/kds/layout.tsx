import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const STAFF_ROLES = new Set(['STAFF', 'MANAGER', 'ADMIN', 'OWNER']);

/**
 * Location-scoped KDS layout. Mirrors the POS surface — any active staff
 * membership at the location can open the kitchen display. The api also
 * enforces `staff: true` on `kitchenTickets`/`markTicketItemReady`, so this
 * is defence in depth. Renders a flush full-bleed shell because the KDS
 * is a wall-mounted surface — no breadcrumbs or page chrome.
 */
export default async function KdsLayout({
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
