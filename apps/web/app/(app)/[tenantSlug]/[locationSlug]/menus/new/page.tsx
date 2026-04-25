import { NewMenuForm } from '@/components/menu/new-menu-form';

export default async function NewMenuPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  return <NewMenuForm tenantSlug={tenantSlug} locationSlug={locationSlug} />;
}
