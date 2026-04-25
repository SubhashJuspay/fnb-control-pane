import { ItemsTable } from '@/components/catalog/items-table';

export default async function CatalogItemsPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return <ItemsTable tenantSlug={tenantSlug} />;
}
