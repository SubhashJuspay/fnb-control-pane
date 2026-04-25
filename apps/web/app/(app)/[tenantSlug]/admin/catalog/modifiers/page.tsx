import { ModifierGroupsTable } from '@/components/catalog/modifier-groups-table';

export default async function ModifierGroupsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <ModifierGroupsTable tenantSlug={tenantSlug} />;
}
