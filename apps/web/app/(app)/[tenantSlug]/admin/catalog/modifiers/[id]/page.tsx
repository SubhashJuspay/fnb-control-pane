import { ModifierGroupEditor } from '@/components/catalog/modifier-group-editor';

export default async function ModifierGroupDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  return (
    <div className="flex flex-col gap-4">
      <ModifierGroupEditor tenantSlug={tenantSlug} groupId={id} />
    </div>
  );
}
