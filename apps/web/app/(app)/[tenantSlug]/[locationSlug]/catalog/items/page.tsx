import { ItemsTable } from '@/components/catalog/items-table';

export default async function StoreCatalogItemsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <ItemsTable tenantSlug={tenantSlug} />;
}
