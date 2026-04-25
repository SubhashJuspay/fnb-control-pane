'use client';

import { useFormContext, type FieldValues, type Path } from 'react-hook-form';
import { cn } from '@repo/ui';
import { allergenTagSchema, type AllergenTag } from '@repo/validation';

interface AllergenTagPickerProps<T extends FieldValues> {
  name: Path<T>;
}

const TAGS = allergenTagSchema.options;

const LABELS: Record<AllergenTag, string> = {
  CONTAINS_NUTS: 'Nuts',
  CONTAINS_DAIRY: 'Dairy',
  CONTAINS_GLUTEN: 'Gluten',
  CONTAINS_EGGS: 'Eggs',
  CONTAINS_SOY: 'Soy',
  CONTAINS_FISH: 'Fish',
  CONTAINS_SHELLFISH: 'Shellfish',
  CONTAINS_SESAME: 'Sesame',
};

export function AllergenTagPicker<T extends FieldValues>({
  name,
}: AllergenTagPickerProps<T>): React.JSX.Element {
  const { watch, setValue } = useFormContext<T>();
  const raw = watch(name);
  const value: AllergenTag[] = Array.isArray(raw) ? (raw as AllergenTag[]) : [];

  const toggle = (tag: AllergenTag): void => {
    const next = value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag];
    setValue(name, next as never, { shouldDirty: true, shouldValidate: false });
  };

  return (
    <div role="group" aria-label="Allergens" className="flex flex-wrap gap-2">
      {TAGS.map((tag) => {
        const active = value.includes(tag);
        return (
          <button
            type="button"
            key={tag}
            aria-pressed={active}
            onClick={() => toggle(tag)}
            className={cn(
              'inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium transition-colors',
              active
                ? 'border-destructive bg-destructive/10 text-destructive'
                : 'border-input bg-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {LABELS[tag]}
          </button>
        );
      })}
    </div>
  );
}
