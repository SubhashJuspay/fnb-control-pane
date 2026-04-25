'use client';

import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@repo/ui';
import { toast } from 'sonner';
import { createModifierGroupSchema } from '@repo/validation';
import {
  CreateModifierGroupDocument,
  UpdateModifierGroupDocument,
} from '@/lib/graphql/generated/graphql';
import { describeMinMax } from './modifier-groups-table';

interface ModifierGroupFormProps {
  mode: 'create' | 'edit';
  tenantSlug: string;
  initial?: {
    id: string;
    name: string;
    minSelections: number;
    maxSelections: number;
  };
}

interface FormValues {
  name: string;
  minSelections: number;
  maxSelections: number;
}

export function ModifierGroupForm({
  mode,
  tenantSlug,
  initial,
}: ModifierGroupFormProps): React.JSX.Element {
  const router = useRouter();
  const form = useForm<FormValues>({
    resolver: zodResolver(createModifierGroupSchema) as Resolver<FormValues>,
    defaultValues: {
      name: initial?.name ?? '',
      minSelections: initial?.minSelections ?? 0,
      maxSelections: initial?.maxSelections ?? 1,
    },
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });
  const { register, handleSubmit, formState, watch } = form;
  const { errors, isSubmitting } = formState;
  const min = watch('minSelections');
  const max = watch('maxSelections');

  const [, createGroup] = useMutation(CreateModifierGroupDocument);
  const [, updateGroup] = useMutation(UpdateModifierGroupDocument);

  const onSubmit = handleSubmit(async (values) => {
    if (mode === 'create') {
      const result = await createGroup({ input: values });
      if (result.error) {
        toast.error(result.error.message);
        return;
      }
      const newId = result.data?.createModifierGroup?.id;
      if (!newId) {
        toast.error('Group created but no id was returned.');
        return;
      }
      toast.success('Group created');
      router.push(`/${tenantSlug}/admin/catalog/modifiers/${newId}`);
      return;
    }
    if (!initial?.id) return;
    const result = await updateGroup({ input: { id: initial.id, ...values } });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Group saved');
    router.refresh();
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{mode === 'create' ? 'New modifier group' : 'Group settings'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="mg-name">Name</Label>
            <Input id="mg-name" {...register('name')} aria-invalid={Boolean(errors.name)} />
            {errors.name ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mg-min">Minimum selections</Label>
              <Input
                id="mg-min"
                type="number"
                min={0}
                {...register('minSelections', { valueAsNumber: true })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mg-max">Maximum selections</Label>
              <Input
                id="mg-max"
                type="number"
                min={1}
                {...register('maxSelections', { valueAsNumber: true })}
                aria-invalid={Boolean(errors.maxSelections)}
              />
              {errors.maxSelections ? (
                <p className="text-sm text-destructive" role="alert">
                  {errors.maxSelections.message}
                </p>
              ) : null}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">{describeMinMax(min, max)}</p>
          <div className="flex justify-end">
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Saving…' : mode === 'create' ? 'Create group' : 'Save'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
