'use client';

import { useEffect } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from 'urql';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  cn,
} from '@repo/ui';
import { toast } from 'sonner';
import { createLocationSchema } from '@repo/validation/location';
import { AdminCreateLocationDocument } from '@/lib/graphql/generated/graphql';

export interface CreateLocationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

interface FormValues {
  name: string;
  slug: string;
  timezone: string;
  currency: string;
  locale: string;
  businessDayCutoff: string;
}

const TIMEZONES = [
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'Europe/London',
  'Europe/Paris',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Australia/Sydney',
  'UTC',
];

const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'SGD', 'INR'];

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const SELECT_CLASS =
  'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function CreateLocationDialog({
  open,
  onOpenChange,
  onCreated,
}: CreateLocationDialogProps): React.JSX.Element {
  const form = useForm<FormValues>({
    resolver: zodResolver(createLocationSchema) as Resolver<FormValues>,
    defaultValues: {
      name: '',
      slug: '',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      locale: 'en-US',
      businessDayCutoff: '04:00',
    },
    mode: 'onSubmit',
  });
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, dirtyFields },
    reset,
  } = form;

  const name = watch('name');
  // Auto-derive slug from name until the user has manually edited it.
  useEffect(() => {
    if (!dirtyFields.slug && name) {
      setValue('slug', slugify(name), { shouldValidate: false });
    }
  }, [name, dirtyFields.slug, setValue]);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  const [{ fetching }, createLocation] = useMutation(
    AdminCreateLocationDocument,
  );

  const onSubmit = handleSubmit(async (values) => {
    const result = await createLocation({
      input: {
        name: values.name,
        slug: values.slug,
        timezone: values.timezone,
        currency: values.currency,
        locale: values.locale,
        businessDayCutoff: values.businessDayCutoff,
      },
    });
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success('Location created');
    onCreated();
    onOpenChange(false);
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create location</DialogTitle>
          <DialogDescription>
            A location is a single physical site, with its own timezone,
            currency, and business-day cutoff.
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit} noValidate>
          <div className="grid gap-2">
            <Label htmlFor="loc-name">Name</Label>
            <Input
              id="loc-name"
              autoComplete="off"
              {...register('name')}
              aria-invalid={Boolean(errors.name)}
            />
            {errors.name ? (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            ) : null}
          </div>
          <div className="grid gap-2">
            <Label htmlFor="loc-slug">Slug</Label>
            <Input
              id="loc-slug"
              autoComplete="off"
              {...register('slug')}
              aria-invalid={Boolean(errors.slug)}
            />
            {errors.slug ? (
              <p className="text-sm text-destructive">{errors.slug.message}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="loc-tz">Timezone</Label>
              <select
                id="loc-tz"
                className={cn(SELECT_CLASS)}
                {...register('timezone')}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="loc-currency">Currency</Label>
              <select
                id="loc-currency"
                className={cn(SELECT_CLASS)}
                {...register('currency')}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="loc-locale">Locale</Label>
              <Input id="loc-locale" {...register('locale')} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="loc-cutoff">Business day cutoff</Label>
              <Input
                id="loc-cutoff"
                placeholder="04:00"
                {...register('businessDayCutoff')}
                aria-invalid={Boolean(errors.businessDayCutoff)}
              />
              {errors.businessDayCutoff ? (
                <p className="text-sm text-destructive">
                  {errors.businessDayCutoff.message}
                </p>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={fetching}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={fetching}>
              {fetching ? 'Creating…' : 'Create location'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
