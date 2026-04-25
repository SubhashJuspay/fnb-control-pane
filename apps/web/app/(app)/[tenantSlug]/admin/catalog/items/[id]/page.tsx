import { headers as nextHeaders } from 'next/headers';
import { notFound } from 'next/navigation';
import { serverFetch } from '@/lib/graphql/server';
import { ItemForm } from '@/components/catalog/item-form';

const ITEM_PAGE_QUERY = /* GraphQL */ `
  query CatalogItemPageData($id: UUID!) {
    catalogItem(id: $id) {
      id
      name
      shortDescription
      description
      basePriceCents
      imageUrl
      course
      printerStation
      archivedAt
      dietaryTags
      allergenTags
      category {
        id
        name
      }
      taxCategory {
        id
        name
        kind
      }
      modifierGroups {
        id
        name
        minSelections
        maxSelections
      }
    }
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

interface ItemPageData {
  catalogItem: {
    id: string;
    name: string | null;
    shortDescription: string | null;
    description: string | null;
    basePriceCents: number | null;
    imageUrl: string | null;
    course: string | null;
    printerStation: string | null;
    archivedAt: string | null;
    dietaryTags: string[] | null;
    allergenTags: string[] | null;
    category: { id: string; name: string } | null;
    taxCategory: { id: string; name: string; kind: string } | null;
    modifierGroups:
      | Array<{
          id: string;
          name: string;
          minSelections: number | null;
          maxSelections: number | null;
        }>
      | null;
  } | null;
  catalogCategories: Array<{ id: string; name: string; archivedAt: string | null }> | null;
  catalogTaxCategories: Array<{
    id: string;
    name: string;
    kind: string;
    archivedAt: string | null;
  }> | null;
}

export default async function CatalogItemDetailPage({
  params,
}: {
  params: Promise<{ tenantSlug: string; id: string }>;
}) {
  const { tenantSlug, id } = await params;
  const cookie = (await nextHeaders()).get('cookie') ?? '';
  const result = await serverFetch<ItemPageData>({
    query: ITEM_PAGE_QUERY,
    variables: { id },
    headers: { cookie, 'x-tenant-slug': tenantSlug },
  });
  const item = result.data?.catalogItem;
  if (!item) notFound();
  const categories = (result.data?.catalogCategories ?? [])
    .filter((c) => !c.archivedAt)
    .map((c) => ({ id: c.id, name: c.name }));
  const taxCategories = (result.data?.catalogTaxCategories ?? [])
    .filter((t) => !t.archivedAt)
    .map((t) => ({ id: t.id, name: t.name, kind: t.kind }));

  // The graphql client gives us optional `Maybe<T>` shapes; the form expects
  // a concrete `CatalogItem` from the generated types. We hand it the same
  // structural shape — TS's structural typing accepts it because the
  // generated query selects identical fields.
  const itemForForm = {
    id: item.id,
    name: item.name,
    shortDescription: item.shortDescription,
    description: item.description,
    basePriceCents: item.basePriceCents,
    imageUrl: item.imageUrl,
    course: item.course as never,
    printerStation: item.printerStation,
    archivedAt: item.archivedAt,
    dietaryTags: item.dietaryTags,
    allergenTags: item.allergenTags,
    category: item.category,
    taxCategory: item.taxCategory ? { ...item.taxCategory, kind: item.taxCategory.kind as never } : null,
    modifierGroups: item.modifierGroups,
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{item.name ?? 'Item'}</h2>
        <p className="text-sm text-muted-foreground">Edit this catalog item.</p>
      </header>
      <ItemForm
        mode="edit"
        tenantSlug={tenantSlug}
        categories={categories}
        taxCategories={taxCategories}
        item={itemForForm}
      />
    </div>
  );
}
