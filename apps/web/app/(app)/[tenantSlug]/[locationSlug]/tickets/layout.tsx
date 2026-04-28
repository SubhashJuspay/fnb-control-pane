import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

/**
 * Tickets-history layout. Manager scope or higher — surfaced rather than
 * hidden because the data here is sensitive (totals, voids, server names).
 * Defence in depth: the api enforces manager scope on `ticketHistory` and
 * `reopenTicket`, but blocking at the route too gives a clean redirect for
 * staff-only members instead of a Forbidden toast on every API call.
 */
export default async function TicketsLayout({
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
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Tickets</h1>
        <p className="text-sm text-muted-foreground">
          Closed and voided ticket history for {location.name}.
        </p>
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
