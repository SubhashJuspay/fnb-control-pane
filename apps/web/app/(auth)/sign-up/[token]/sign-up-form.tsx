'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  acceptInvitationSchema,
  type AcceptInvitationInput,
} from '@repo/validation/invitation';
import { Button, Input, Label } from '@repo/ui';
import { acceptInvitationAction } from './actions';

export interface SignUpFormProps {
  token: string;
  email: string;
}

export function SignUpForm({ token, email }: SignUpFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AcceptInvitationInput>({
    resolver: zodResolver(acceptInvitationSchema) as Resolver<AcceptInvitationInput>,
    defaultValues: { token, name: '', password: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await acceptInvitationAction({ ...values, token });
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
      <input type="hidden" {...register('token')} value={token} readOnly />
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" value={email} disabled readOnly />
      </div>
      <div className="space-y-2">
        <Label htmlFor="name">Your name</Label>
        <Input
          id="name"
          type="text"
          autoComplete="name"
          aria-invalid={errors.name ? 'true' : undefined}
          {...register('name')}
        />
        {errors.name ? (
          <p className="text-sm text-danger" role="alert">
            {errors.name.message}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
