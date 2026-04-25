'use client';

import { useFormContext, type FieldValues, type Path } from 'react-hook-form';
import { cn } from '@repo/ui';
import { dietaryTagSchema, type DietaryTag } from '@repo/validation';

interface DietaryTagPickerProps<T extends FieldValues> {
  name: Path<T>;
}

const TAGS = dietaryTagSchema.options;

const LABELS: Record<DietaryTag, string> = {
  VEGETARIAN: 'Vegetarian',
  VEGAN: 'Vegan',
  GLUTEN_FREE: 'Gluten-free',
  DAIRY_FREE: 'Dairy-free',
  NUT_FREE: 'Nut-free',
  KOSHER: 'Kosher',
  HALAL: 'Halal',
  SPICY: 'Spicy',
};

/**
 * Multi-select tag chip group bound to the surrounding `<Form>` via
 * `useFormContext`. Each click toggles the tag in the form value array.
 */
export function DietaryTagPicker<T extends FieldValues>({
  name,
}: DietaryTagPickerProps<T>): React.JSX.Element {
  const { watch, setValue } = useFormContext<T>();
  const raw = watch(name);
  const value: DietaryTag[] = Array.isArray(raw) ? (raw as DietaryTag[]) : [];

  const toggle = (tag: DietaryTag): void => {
    const next = value.includes(tag) ? value.filter((t) => t !== tag) : [...value, tag];
    setValue(name, next as never, { shouldDirty: true, shouldValidate: false });
  };

  return (
    <div role="group" aria-label="Dietary tags" className="flex flex-wrap gap-2">
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
                ? 'border-foreground bg-foreground text-background'
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
