'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@repo/validation/auth';
import { Button, Input, Label } from '@repo/ui';
import { signInAction } from './actions';

export interface SignInFormProps {
  next?: string;
  error?: string;
}

export function SignInForm({ next, error: initialError }: SignInFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(initialError ?? null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignInInput>({
    resolver: zodResolver(signInSchema) as Resolver<SignInInput>,
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await signInAction({ ...values, next });
      if (result.error) {
        setError(result.error);
        return;
      }
      router.replace(result.redirectTo ?? '/');
      router.refresh();
    });
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          aria-invalid={errors.email ? 'true' : undefined}
          {...register('email')}
        />
        {errors.email ? (
          <p className="text-sm text-danger" role="alert">
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={errors.password ? 'true' : undefined}
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-sm text-danger" role="alert">
            {errors.password.message}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        <a href="/forgot-password" className="underline">
          Forgot your password?
        </a>
      </p>
    </form>
  );
}
