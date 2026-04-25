'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { resetPasswordSchema, type ResetPasswordInput } from '@repo/validation/auth';
import { Button, Input, Label } from '@repo/ui';
import { resetPasswordAction } from './actions';

export interface ResetPasswordFormProps {
  token: string;
}

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [pending, startTransition] = useTransition();
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema) as Resolver<ResetPasswordInput>,
    defaultValues: { token, password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await resetPasswordAction({ ...values, token });
      if (result.error) {
        setError(result.error);
        return;
      }
      setSubmitted(true);
    });
  });

  if (submitted) {
    return (
      <p className="text-sm text-muted-foreground" role="status">
        Your password has been reset.{' '}
        <Link href="/sign-in" className="underline">
          Sign in
        </Link>{' '}
        to continue.
      </p>
    );
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <input type="hidden" {...register('token')} value={token} readOnly />
      <div className="space-y-2">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
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
        {pending ? 'Resetting…' : 'Reset password'}
      </Button>
    </form>
  );
}
