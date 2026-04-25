import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { CatalogSubNav } from '@/components/catalog/catalog-sub-nav';

/**
 * Catalog admin layout. Re-validates the role guard the parent admin layout
 * already enforces (defense-in-depth — keeps the surface invariant if the
 * routes are ever rearranged) and renders the sub-tab strip beneath the
 * admin tabs.
 */
export default async function CatalogLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  if (tenant.role !== 'OWNER' && tenant.role !== 'ADMIN') {
    redirect(`/${tenantSlug}/overview`);
  }
  return (
    <div className="flex flex-col gap-4">
      <CatalogSubNav tenantSlug={tenantSlug} />
      <div className="flex flex-col gap-6">{children}</div>
    </div>
  );
}
