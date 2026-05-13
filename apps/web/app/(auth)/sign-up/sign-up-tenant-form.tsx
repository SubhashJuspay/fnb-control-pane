'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signUpTenantSchema, type SignUpTenantInput } from '@repo/validation/auth';
import { Button, Input, Label } from '@repo/ui';
import { signUpTenantAction } from './actions';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function SignUpTenantForm(): React.JSX.Element {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<SignUpTenantInput>({
    resolver: zodResolver(signUpTenantSchema),
    defaultValues: {
      tenantName: '',
      tenantSlug: '',
      locationName: '',
      locationSlug: 'main',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      ownerName: '',
      ownerEmail: '',
      password: '',
    },
  });

  const tenantName = watch('tenantName');
  const tenantSlug = watch('tenantSlug');

  // Auto-generate the tenantSlug from tenantName until the user manually
  // edits the slug field.
  const onTenantNameChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setValue('tenantName', e.target.value, { shouldDirty: true });
    if (!tenantSlug || tenantSlug === slugify(tenantName)) {
      setValue('tenantSlug', slugify(e.target.value), { shouldDirty: true });
    }
  };

  const onSubmit = (input: SignUpTenantInput) => {
    setError(null);
    startTransition(async () => {
      const r = await signUpTenantAction(input);
      if (r.error) {
        setError(r.error);
        return;
      }
      if (r.redirectTo) {
        router.push(r.redirectTo);
        router.refresh();
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4"
      data-testid="signup-tenant-form"
    >
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Restaurant</h2>
        <div>
          <Label htmlFor="tenantName">Restaurant or group name</Label>
          <Input
            id="tenantName"
            data-testid="signup-tenant-name"
            placeholder="Acme Coffee Co."
            {...register('tenantName')}
            onChange={onTenantNameChange}
          />
          {errors.tenantName ? (
            <p className="mt-1 text-xs text-destructive">{errors.tenantName.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="tenantSlug">URL slug</Label>
          <Input
            id="tenantSlug"
            data-testid="signup-tenant-slug"
            placeholder="acme-coffee"
            {...register('tenantSlug')}
          />
          {errors.tenantSlug ? (
            <p className="mt-1 text-xs text-destructive">{errors.tenantSlug.message}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            Lower-case letters, digits and hyphens. Used in your URLs.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">First location</h2>
        <div>
          <Label htmlFor="locationName">Location name</Label>
          <Input
            id="locationName"
            data-testid="signup-location-name"
            placeholder="Main Street"
            {...register('locationName')}
          />
          {errors.locationName ? (
            <p className="mt-1 text-xs text-destructive">{errors.locationName.message}</p>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="locationSlug">Slug</Label>
            <Input
              id="locationSlug"
              data-testid="signup-location-slug"
              {...register('locationSlug')}
            />
            {errors.locationSlug ? (
              <p className="mt-1 text-xs text-destructive">{errors.locationSlug.message}</p>
            ) : null}
          </div>
          <div>
            <Label htmlFor="currency">Currency</Label>
            <Input
              id="currency"
              data-testid="signup-currency"
              maxLength={3}
              {...register('currency')}
            />
            {errors.currency ? (
              <p className="mt-1 text-xs text-destructive">{errors.currency.message}</p>
            ) : null}
          </div>
        </div>
        <div>
          <Label htmlFor="timezone">Timezone (IANA)</Label>
          <Input
            id="timezone"
            data-testid="signup-timezone"
            placeholder="America/Los_Angeles"
            {...register('timezone')}
          />
          {errors.timezone ? (
            <p className="mt-1 text-xs text-destructive">{errors.timezone.message}</p>
          ) : null}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Owner account</h2>
        <div>
          <Label htmlFor="ownerName">Your name</Label>
          <Input
            id="ownerName"
            data-testid="signup-owner-name"
            autoComplete="name"
            {...register('ownerName')}
          />
          {errors.ownerName ? (
            <p className="mt-1 text-xs text-destructive">{errors.ownerName.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="ownerEmail">Email</Label>
          <Input
            id="ownerEmail"
            data-testid="signup-owner-email"
            type="email"
            autoComplete="email"
            {...register('ownerEmail')}
          />
          {errors.ownerEmail ? (
            <p className="mt-1 text-xs text-destructive">{errors.ownerEmail.message}</p>
          ) : null}
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            data-testid="signup-password"
            type="password"
            autoComplete="new-password"
            {...register('password')}
          />
          {errors.password ? (
            <p className="mt-1 text-xs text-destructive">{errors.password.message}</p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">At least 8 characters.</p>
        </div>
      </section>

      {error ? (
        <p
          className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive"
          data-testid="signup-error"
        >
          {error}
        </p>
      ) : null}

      <Button
        type="submit"
        size="lg"
        disabled={pending}
        data-testid="signup-submit"
      >
        {pending ? 'Creating…' : 'Create my restaurant'}
      </Button>
    </form>
  );
}
