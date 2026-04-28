import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

/**
 * Location-scoped guests layout. Mirrors the menus/dashboard guards: the
 * viewer must have at least manager scope on the active tenant. The API
 * also enforces `manager: true` on every guest list query, so this is
 * defense in depth + a friendlier redirect.
 */
export default async function GuestsLayout({
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
        <h1 className="text-2xl font-semibold">Guests</h1>
        <p className="text-sm text-muted-foreground">
          Look up regulars, link tickets, and view per-guest history at {location.name}.
        </p>
      </header>
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
