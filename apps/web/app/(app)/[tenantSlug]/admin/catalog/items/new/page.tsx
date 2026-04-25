import { headers as nextHeaders } from 'next/headers';
import Link from 'next/link';
import { Button } from '@repo/ui';
import { serverFetch } from '@/lib/graphql/server';
import { ItemForm } from '@/components/catalog/item-form';

const CATEGORIES_AND_TAXES_QUERY = /* GraphQL */ `
  query NewItemFormData {
    catalogCategories {
      id
      name
      archivedAt
    }
    catalogTaxCategories {
      id
      name
      kind
      archivedAt
    }
  }
`;

interface ServerData {
  catalogCategories: Array<{ id: string; name: string; archivedAt: string | null }> | null;
  catalogTaxCategories: Array<{
    id: string;
    name: string;
    kind: string;
    archivedAt: string | null;
  }> | null;
}

export default async function NewCatalogItemPage({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const cookie = (await nextHeaders()).get('cookie') ?? '';
  const result = await serverFetch<ServerData>({
    query: CATEGORIES_AND_TAXES_QUERY,
    headers: { cookie, 'x-tenant-slug': tenantSlug },
  });
  const categories = (result.data?.catalogCategories ?? [])
    .filter((c) => !c.archivedAt)
    .map((c) => ({ id: c.id, name: c.name }));
  const taxCategories = (result.data?.catalogTaxCategories ?? [])
    .filter((t) => !t.archivedAt)
    .map((t) => ({ id: t.id, name: t.name, kind: t.kind }));

  if (taxCategories.length === 0) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-md border border-dashed p-6">
        <h2 className="text-base font-semibold">Set up a tax category first</h2>
        <p className="text-sm text-muted-foreground">
          Every menu item needs a tax category. Create one before adding items.
        </p>
        <Button asChild>
          <Link href={`/${tenantSlug}/admin/catalog/taxes`}>Manage tax categories</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">New menu item</h2>
        <p className="text-sm text-muted-foreground">
          Items belong to the tenant catalog. Per-location overrides are managed separately.
        </p>
      </header>
      <ItemForm
        mode="create"
        tenantSlug={tenantSlug}
        categories={categories}
        taxCategories={taxCategories}
      />
    </div>
  );
}
