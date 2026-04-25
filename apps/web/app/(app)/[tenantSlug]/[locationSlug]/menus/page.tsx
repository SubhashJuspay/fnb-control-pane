import { MenusList } from '@/components/menu/menus-list';

export default async function MenusPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  return <MenusList tenantSlug={tenantSlug} locationSlug={locationSlug} />;
}
