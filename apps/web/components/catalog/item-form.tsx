'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  MoneyInput,
  cn,
} from '@repo/ui';
import { ImageOff } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { itemCourseSchema, dietaryTagSchema, allergenTagSchema } from '@repo/validation';

// Form-specific schema. The exported `createMenuItemSchema` from
// @repo/validation rejects empty strings on optional UUID/URL fields;
// our HTML form always emits empty strings rather than undefined for
// unfilled inputs, so we coerce empty -> undefined before validating.
const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const itemFormSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(200),
  shortDescription: z.preprocess(emptyToUndef, z.string().trim().max(200).optional()),
  description: z.preprocess(emptyToUndef, z.string().trim().max(2000).optional()),
  basePriceCents: z.number().int().min(0).max(1_000_000),
  imageUrl: z.preprocess(emptyToUndef, z.string().url().max(2000).optional()),
  course: itemCourseSchema,
  printerStation: z.preprocess(emptyToUndef, z.string().trim().max(80).optional()),
  categoryId: z.preprocess(emptyToUndef, z.string().uuid().optional()),
  taxCategoryId: z.string().uuid('Pick a tax category'),
  dietaryTags: z.array(dietaryTagSchema),
  allergenTags: z.array(allergenTagSchema),
});
import {
  ArchiveMenuItemDocument,
  CreateMenuItemDocument,
  UnarchiveMenuItemDocument,
  UpdateMenuItemDocument,
  type CatalogItemQuery,
  type ItemCourse,
} from '@/lib/graphql/generated/graphql';
import type { DietaryTag, AllergenTag } from '@repo/validation';
import { DietaryTagPicker } from './dietary-tag-picker';
import { AllergenTagPicker } from './allergen-tag-picker';
import { AttachedModifierGroups } from './attached-modifier-groups';

export interface CategoryOption {
  id: string;
  name: string;
}

export interface TaxCategoryOption {
  id: string;
  name: string;
  kind: string;
}

type CatalogItem = NonNullable<CatalogItemQuery['catalogItem']>;

export interface ItemFormProps {
  mode: 'create' | 'edit';
  tenantSlug: string;
  categories: CategoryOption[];
  taxCategories: TaxCategoryOption[];
  item?: CatalogItem;
  onSaved?: (id: string) => void;
}

interface FormValues {
  name: string;
  shortDescription: string;
  description: string;
  basePriceCents: number;
  imageUrl: string;
  course: 'APPETIZER' | 'MAIN' | 'DESSERT' | 'SIDE' | 'BEVERAGE' | 'OTHER';
  printerStation: string;
  categoryId: string;
  taxCategoryId: string;
  dietaryTags: DietaryTag[];
  allergenTags: AllergenTag[];
}

const COURSE_OPTIONS = itemCourseSchema.options;
const COURSE_LABELS: Record<FormValues['course'], string> = {
  APPETIZER: 'Appetizer',
  MAIN: 'Main',
  DESSERT: 'Dessert',
  SIDE: 'Side',
  BEVERAGE: 'Beverage',
  OTHER: 'Other',
};

function buildDefaults(item?: CatalogItem): FormValues {
  return {
    name: item?.name ?? '',
    shortDescription: item?.shortDescription ?? '',
    description: item?.description ?? '',
    basePriceCents: item?.basePriceCents ?? 0,
    imageUrl: item?.imageUrl ?? '',
    course: (item?.course ?? 'MAIN') as FormValues['course'],
    printerStation: item?.printerStation ?? '',
    categoryId: item?.category?.id ?? '',
    taxCategoryId: item?.taxCategory?.id ?? '',
    dietaryTags: (item?.dietaryTags ?? []) as DietaryTag[],
    allergenTags: (item?.allergenTags ?? []) as AllergenTag[],
  };
}

/**
 * Two-column item form. Left column owns descriptive fields; the right
 * column carries the commercials (price, tax, station). Validation comes
 * from `createMenuItemSchema` — the partial `updateMenuItemSchema` would
 * miss required fields on edit, so we re-use the create rules and let the
 * api accept-or-reject the update.
 */
export function ItemForm({
  mode,
  tenantSlug,
  categories,
  taxCategories,
  item,
  onSaved,
}: ItemFormProps): React.JSX.Element {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(itemFormSchema) as Resolver<FormValues>,
    defaultValues: buildDefaults(item),
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });
  const { register, handleSubmit, control, formState, watch } = form;
  const { errors, isSubmitting } = formState;
  const imageUrl = watch('imageUrl');

  const [, createItem] = useMutation(CreateMenuItemDocument);
  const [, updateItem] = useMutation(UpdateMenuItemDocument);
  const [, archiveItem] = useMutation(ArchiveMenuItemDocument);
  const [, unarchiveItem] = useMutation(UnarchiveMenuItemDocument);

  const onSubmit = handleSubmit(async (values) => {
    const payload = {
      name: values.name,
      shortDescription: values.shortDescription || undefined,
      description: values.description || undefined,
      basePriceCents: values.basePriceCents,
      imageUrl: values.imageUrl || undefined,
      course: values.course as ItemCourse,
      printerStation: values.printerStation || undefined,
      categoryId: values.categoryId || undefined,
      taxCategoryId: values.taxCategoryId,
      dietaryTags: values.dietaryTags,
      allergenTags: values.allergenTags,
    };

    if (mode === 'create') {
      const result = await createItem({ input: payload });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      const newId = result.data?.createMenuItem?.id;
      if (!newId) {
        toast.error('Item was created but no id was returned.');
        return;
      }
      toast.success('Item created');
      onSaved?.(newId);
      router.push(`/${tenantSlug}/admin/catalog/items/${newId}`);
      return;
    }
    if (!item?.id) return;
    const result = await updateItem({ input: { id: item.id, ...payload } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item saved');
    onSaved?.(item.id);
    router.refresh();
  });

  const onArchive = async (): Promise<void> => {
    if (!item?.id) return;
    const result = await archiveItem({ input: { id: item.id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item archived');
    router.refresh();
  };

  const onUnarchive = async (): Promise<void> => {
    if (!item?.id) return;
    const result = await unarchiveItem({ input: { id: item.id } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Item unarchived');
    router.refresh();
  };

  return (
    <FormProvider {...form}>
      {item?.archivedAt ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed bg-muted/50 px-4 py-2 text-sm">
          <span>This item is archived. Unarchive it to make changes effective.</span>
          <Button type="button" variant="outline" size="sm" onClick={onUnarchive}>
            Unarchive
          </Button>
        </div>
      ) : null}

      <form onSubmit={onSubmit} className="grid gap-6" noValidate>
        <div className="grid gap-6 md:grid-cols-3">
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Item details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="item-name">Name</Label>
                <Input
                  id="item-name"
                  {...register('name')}
                  aria-invalid={Boolean(errors.name)}
                />
                {errors.name ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.name.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-short">Short description</Label>
                <Input
                  id="item-short"
                  maxLength={200}
                  {...register('shortDescription')}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-desc">Description</Label>
                <textarea
                  id="item-desc"
                  rows={4}
                  className={cn(
                    'flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  {...register('description')}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-image">Image URL</Label>
                <div className="flex items-start gap-3">
                  <Input
                    id="item-image"
                    type="url"
                    placeholder="https://…"
                    {...register('imageUrl')}
                    aria-invalid={Boolean(errors.imageUrl)}
                  />
                  {imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={imageUrl}
                      alt=""
                      className="h-16 w-16 shrink-0 rounded object-cover bg-muted"
                      width={64}
                      height={64}
                    />
                  ) : (
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-muted text-muted-foreground">
                      <ImageOff className="h-5 w-5" />
                    </div>
                  )}
                </div>
                {errors.imageUrl ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.imageUrl.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="item-category">Category</Label>
                  <select
                    id="item-category"
                    className={cn(
                      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                    {...register('categoryId')}
                  >
                    <option value="">Uncategorized</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="item-course">Course</Label>
                  <select
                    id="item-course"
                    className={cn(
                      'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    )}
                    {...register('course')}
                  >
                    {COURSE_OPTIONS.map((c) => (
                      <option key={c} value={c}>
                        {COURSE_LABELS[c]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label>Dietary tags</Label>
                <DietaryTagPicker<FormValues> name="dietaryTags" />
              </div>
              <div className="grid gap-1.5">
                <Label>Allergens</Label>
                <AllergenTagPicker<FormValues> name="allergenTags" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Pricing & ops</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="item-price">Base price</Label>
                <Controller
                  control={control}
                  name="basePriceCents"
                  render={({ field }) => (
                    <MoneyInput
                      id="item-price"
                      value={field.value ?? null}
                      onChange={(cents) => field.onChange(cents ?? 0)}
                      onBlur={field.onBlur}
                      ref={field.ref}
                      aria-invalid={Boolean(errors.basePriceCents)}
                    />
                  )}
                />
                {errors.basePriceCents ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.basePriceCents.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-tax">Tax category</Label>
                <select
                  id="item-tax"
                  className={cn(
                    'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                  {...register('taxCategoryId')}
                  aria-invalid={Boolean(errors.taxCategoryId)}
                >
                  <option value="">Select…</option>
                  {taxCategories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.kind})
                    </option>
                  ))}
                </select>
                {errors.taxCategoryId ? (
                  <p className="text-sm text-destructive" role="alert">
                    {errors.taxCategoryId.message}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="item-station">Printer station</Label>
                <Input id="item-station" {...register('printerStation')} />
              </div>
              {mode === 'edit' && item ? (
                <div className="grid gap-1.5">
                  <Label>Status</Label>
                  {item.archivedAt ? (
                    <Button type="button" variant="outline" onClick={onUnarchive}>
                      Unarchive
                    </Button>
                  ) : (
                    <Button type="button" variant="destructive" onClick={onArchive}>
                      Archive item
                    </Button>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {mode === 'edit' && item?.id ? (
          <Card>
            <CardHeader>
              <CardTitle>Modifier groups</CardTitle>
            </CardHeader>
            <CardContent>
              <AttachedModifierGroups
                tenantSlug={tenantSlug}
                menuItemId={item.id}
                attachedGroups={(item.modifierGroups ?? [])
                  .filter((g): g is { id: string; name: string } => Boolean(g?.id && g?.name))
                  .map((g) => ({ id: g.id, name: g.name }))}
                onChanged={() => router.refresh()}
              />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Modifier groups</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Save the item first, then attach modifier groups from the detail page.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" asChild>
            <Link href={`/${tenantSlug}/admin/catalog/items`}>Cancel</Link>
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create item' : 'Save changes'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
