import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { MenusSubNav } from '@/components/menu/menus-sub-nav';

const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

/**
 * Location-scoped menus layout. Re-validates that the viewer can see this
 * location and has at least manager scope (defense in depth — the API also
 * enforces `manager: true` on every menu mutation/query). Renders the page
 * heading and sub-tabs ("All menus" / "Overrides").
 */
export default async function MenusLayout({
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
        <h1 className="text-2xl font-semibold">Menus</h1>
        <p className="text-sm text-muted-foreground">
          Compose menus and manage per-location pricing for {location.name}.
        </p>
      </header>
      <MenusSubNav tenantSlug={tenantSlug} locationSlug={locationSlug} />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
