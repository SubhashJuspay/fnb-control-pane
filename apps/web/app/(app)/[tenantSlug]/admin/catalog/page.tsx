import { redirect } from 'next/navigation';

export default async function CatalogIndexPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  redirect(`/${tenantSlug}/admin/catalog/items`);
}
