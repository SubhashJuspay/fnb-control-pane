import { ModifierGroupsTable } from '@/components/catalog/modifier-groups-table';

export default async function StoreCatalogModifiersPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <ModifierGroupsTable tenantSlug={tenantSlug} />;
}
