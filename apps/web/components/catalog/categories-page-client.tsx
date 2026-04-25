'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from 'urql';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Sortable,
  useSortableItem,
} from '@repo/ui';
import { FolderTree, GripVertical, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  ArchiveCategoryDocument,
  CatalogCategoriesDocument,
  CreateCategoryDocument,
  ReorderCategoriesDocument,
  UpdateCategoryDocument,
  type CatalogCategoriesQuery,
} from '@/lib/graphql/generated/graphql';

type Category = NonNullable<NonNullable<CatalogCategoriesQuery['catalogCategories']>[number]>;

const DEBOUNCE_MS = 400;

export function CategoriesPageClient(): React.JSX.Element {
  const [{ data, fetching, error }, refetch] = useQuery({
    query: CatalogCategoriesDocument,
  });
  const [, createCategory] = useMutation(CreateCategoryDocument);
  const [, reorderCategories] = useMutation(ReorderCategoriesDocument);

  const categories: Category[] = (data?.catalogCategories ?? []).filter(
    (c): c is Category => c != null && Boolean(c.id) && !c.archivedAt,
  );
  const ids = categories.map((c) => c.id ?? '');

  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refresh = (): void => refetch({ requestPolicy: 'network-only' });

  const onReorder = async (orderedIds: string[]): Promise<void> => {
    const result = await reorderCategories({ input: { orderedIds } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    refresh();
  };

  const onCreate = async (): Promise<void> => {
    if (!newName.trim() || !newSlug.trim()) {
      toast.error('Name and slug are required');
      return;
    }
    setSubmitting(true);
    const result = await createCategory({
      input: { name: newName.trim(), slug: newSlug.trim(), sortOrder: categories.length },
    });
    setSubmitting(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    setNewName('');
    setNewSlug('');
    toast.success('Category added');
    refresh();
  };

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Categories</h2>
        <p className="text-sm text-muted-foreground">
          Group items for menu organization. Drag to reorder.
        </p>
      </header>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      ) : null}
      <Card>
        <CardContent className="pt-6">
          {!fetching && categories.length === 0 ? (
            <EmptyState
              icon={FolderTree}
              title="No categories yet"
              description="Add your first category below."
            />
          ) : (
            <Sortable items={ids} onReorder={onReorder}>
              <ul className="flex flex-col gap-2">
                {categories.map((c) => (
                  <CategoryRow key={c.id ?? ''} category={c} onChanged={refresh} />
                ))}
              </ul>
            </Sortable>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add category</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-2">
            <div className="grid flex-1 gap-1 min-w-48">
              <Label htmlFor="new-cat-name">Name</Label>
              <Input
                id="new-cat-name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div className="grid flex-1 gap-1 min-w-48">
              <Label htmlFor="new-cat-slug">Slug</Label>
              <Input
                id="new-cat-slug"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="e.g. mains"
              />
            </div>
            <Button type="button" onClick={onCreate} disabled={submitting}>
              {submitting ? 'Adding…' : 'Create'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface CategoryRowProps {
  category: Category;
  onChanged: () => void;
}

function CategoryRow({ category, onChanged }: CategoryRowProps): React.JSX.Element {
  const id = category.id ?? '';
  const { ref, attributes, listeners, style } = useSortableItem(id);
  const [, updateCategory] = useMutation(UpdateCategoryDocument);
  const [, archiveCategory] = useMutation(ArchiveCategoryDocument);
  const [name, setName] = useState(category.name ?? '');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setName(category.name ?? ''), [category.name]);

  const scheduleCommit = (next: string): void => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const result = await updateCategory({ input: { id, name: next } });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      onChanged();
    }, DEBOUNCE_MS);
  };

  const onArchive = async (): Promise<void> => {
    const result = await archiveCategory({ input: { id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Category archived');
    onChanged();
  };

  return (
    <li
      ref={ref}
      style={style}
      className="flex items-center gap-2 rounded-md border bg-surface px-2 py-2"
    >
      <button
        type="button"
        className="cursor-grab text-muted-foreground active:cursor-grabbing"
        aria-label={`Reorder ${category.name ?? ''}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <Input
        aria-label={`Category name`}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          scheduleCommit(e.target.value);
        }}
        className="flex-1"
      />
      <span className="text-xs text-muted-foreground font-mono">{category.slug}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Archive ${category.name ?? ''}`}
        onClick={onArchive}
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}
