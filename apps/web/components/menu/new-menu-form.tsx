'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Controller, useForm, type Resolver } from 'react-hook-form';
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
  ScheduleEditor,
  ScheduleSummary,
  cn,
  type Schedule,
} from '@repo/ui';
import { toast } from 'sonner';
import { z } from 'zod';
import { createMenuSchema } from '@repo/validation';
import { CreateMenuDocument } from '@/lib/graphql/generated/graphql';

const emptyToUndef = (v: unknown): unknown =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

// Local form schema mirrors `createMenuSchema` but accepts the empty-string
// description that an unfilled HTML input produces.
const formSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  description: z.preprocess(emptyToUndef, z.string().trim().max(500).optional()),
  schedule: createMenuSchema.shape.schedule,
  isActive: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface NewMenuFormProps {
  tenantSlug: string;
  locationSlug: string;
}

export function NewMenuForm({ tenantSlug, locationSlug }: NewMenuFormProps): React.JSX.Element {
  const router = useRouter();
  const [, createMenu] = useMutation(CreateMenuDocument);
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema) as Resolver<FormValues>,
    defaultValues: {
      name: '',
      description: '',
      schedule: { kind: 'always' },
      isActive: true,
    },
    mode: 'onSubmit',
    reValidateMode: 'onSubmit',
  });
  const { register, handleSubmit, control, formState, watch, setValue } = form;
  const { errors, isSubmitting } = formState;
  const schedule = watch('schedule');
  const isActive = watch('isActive');

  const onSubmit = handleSubmit(async (values) => {
    const result = await createMenu({
      input: {
        name: values.name,
        description: values.description ?? null,
        schedule: values.schedule,
        isActive: values.isActive,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    const newId = result.data?.createMenu?.id;
    if (!newId) {
      toast.error('Menu was created but no id was returned.');
      return;
    }
    toast.success('Menu created');
    router.push(`/${tenantSlug}/${locationSlug}/menus/${newId}`);
  });

  return (
    <form onSubmit={onSubmit} className="grid gap-6 max-w-2xl" noValidate>
      <Card>
        <CardHeader>
          <CardTitle>New menu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="menu-name">Name</Label>
            <Input id="menu-name" {...register('name')} aria-invalid={Boolean(errors.name)} />
            {errors.name ? (
              <p className="text-sm text-destructive" role="alert">
                {errors.name.message}
              </p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="menu-desc">Description</Label>
            <textarea
              id="menu-desc"
              rows={3}
              maxLength={500}
              className={cn(
                'flex w-full rounded-md border border-input bg-surface px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              )}
              {...register('description')}
            />
          </div>
          <div className="grid gap-1.5">
            <Label>Schedule</Label>
            <div className="flex items-center gap-2">
              <span className="flex-1 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                <ScheduleSummary schedule={schedule as Schedule} />
              </span>
              <Button type="button" variant="outline" onClick={() => setScheduleOpen(true)}>
                Edit
              </Button>
            </div>
            <Controller
              control={control}
              name="schedule"
              render={({ field }) => (
                <ScheduleEditor
                  open={scheduleOpen}
                  onOpenChange={setScheduleOpen}
                  value={field.value as Schedule}
                  onChange={(s) => field.onChange(s)}
                />
              )}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setValue('isActive', e.target.checked)}
            />
            Active (uncheck to keep the menu hidden until ready)
          </label>
        </CardContent>
      </Card>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" asChild>
          <Link href={`/${tenantSlug}/${locationSlug}/menus`}>Cancel</Link>
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Creating…' : 'Create menu'}
        </Button>
      </div>
    </form>
  );
}
