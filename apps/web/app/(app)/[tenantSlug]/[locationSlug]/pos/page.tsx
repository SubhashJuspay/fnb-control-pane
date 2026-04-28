import { PosWorkspace } from '@/components/pos/pos-workspace';

export default async function PosPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; locationSlug: string }>;
}) {
  const { tenantSlug, locationSlug } = await params;
  return <PosWorkspace tenantSlug={tenantSlug} locationSlug={locationSlug} />;
}
