import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { CatalogSubNav } from '@/components/catalog/catalog-sub-nav';

/**
 * Per-location catalog layout. The same tenant-scoped catalog data the
 * /admin/catalog route shows — just mounted inside the store sidebar
 * context so navigating in from Setup → Catalog doesn't yank the user
 * out of their store.
 *
 * Access: MANAGER+ at the active tenant, matching the sidebar Setup
 * group. Detail edits (items/new, items/[id]) still live under the
 * admin route for now and apply the stricter OWNER/ADMIN guard.
 */
const MANAGER_ROLES = new Set(['MANAGER', 'ADMIN', 'OWNER']);

export default async function StoreCatalogLayout({
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
        <h1 className="text-2xl font-semibold">Catalog</h1>
        <p className="text-sm text-muted-foreground">
          Menu items, modifiers, categories, and tax setup for{' '}
          {tenant.name}. Shared across every location of this tenant.
        </p>
      </header>
      <CatalogSubNav
        tenantSlug={tenantSlug}
        basePath={`/${tenantSlug}/${locationSlug}/catalog`}
      />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
