import { redirect } from 'next/navigation';
import { loadAppShellData } from '@/lib/viewer';
import { TaxesTable } from '@/components/catalog/taxes-table';

export default async function CatalogTaxesPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const data = await loadAppShellData();
  if (!data) redirect('/sign-in');
  const tenant = data.tenants.find((t) => t.slug === tenantSlug);
  if (!tenant) redirect('/');
  const locations = tenant.locations.map((l) => ({ id: l.id, name: l.name }));
  return <TaxesTable locations={locations} />;
}
