'use client';

import { useState, useTransition } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  mfaChallengeSchema,
  type MfaChallengeInput,
} from '@repo/validation/auth';
import { Button, Input, Label } from '@repo/ui';
import { verifyMfaAction } from './actions';

export function MfaForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<MfaChallengeInput>({
    resolver: zodResolver(mfaChallengeSchema) as Resolver<MfaChallengeInput>,
    defaultValues: { code: '' },
  });

  const onSubmit = handleSubmit((values) => {
    setError(null);
    startTransition(async () => {
      const result = await verifyMfaAction(values);
      if (result.error) {
        setError(result.error);
      }
    });
  });

  return (
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-2">
        <Label htmlFor="code">Authentication code</Label>
        <Input
          id="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={errors.code ? 'true' : undefined}
          {...register('code')}
        />
        {errors.code ? (
          <p className="text-sm text-danger" role="alert">
            {errors.code.message}
          </p>
        ) : null}
      </div>
      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? 'Verifying…' : 'Verify'}
      </Button>
    </form>
  );
}
