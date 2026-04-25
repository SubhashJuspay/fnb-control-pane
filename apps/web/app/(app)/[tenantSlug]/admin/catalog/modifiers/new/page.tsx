import { ModifierGroupForm } from '@/components/catalog/modifier-group-form';

export default async function NewModifierGroupPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">New modifier group</h2>
        <p className="text-sm text-muted-foreground">
          Define how many options diners must pick. You will add the individual modifiers next.
        </p>
      </header>
      <ModifierGroupForm mode="create" tenantSlug={tenantSlug} />
    </div>
  );
}
