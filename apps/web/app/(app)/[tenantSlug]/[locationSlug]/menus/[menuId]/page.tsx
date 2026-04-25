import { MenuBuilder } from '@/components/menu/menu-builder';

export default async function MenuBuilderPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string; menuId: string }>;
}) {
  const { tenantSlug, locationSlug, menuId } = await params;
  return <MenuBuilder tenantSlug={tenantSlug} locationSlug={locationSlug} menuId={menuId} />;
}
