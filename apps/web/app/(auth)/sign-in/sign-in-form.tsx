'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInSchema, type SignInInput } from '@repo/validation/auth';
import { signInAction } from './actions';

export interface SignInFormProps {
  next?: string;
  error?: string;
}

const INPUT_CLASS =
  'w-full h-14 px-4 pt-5 pb-1 font-body-staff text-body-staff border border-outline-variant rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary transition-all bg-surface-container-lowest text-on-surface placeholder:text-transparent peer';

const LABEL_CLASS =
  'absolute left-4 top-4 font-body-staff text-on-surface-variant transition-all pointer-events-none peer-focus:top-1.5 peer-focus:text-xs peer-focus:text-primary peer-[:not(:placeholder-shown)]:top-1.5 peer-[:not(:placeholder-shown)]:text-xs';

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
    <form className="space-y-6" onSubmit={onSubmit} noValidate>
      <div className="relative">
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder=" "
          aria-invalid={errors.email ? 'true' : undefined}
          className={INPUT_CLASS}
          {...register('email')}
        />
        <label htmlFor="email" className={LABEL_CLASS}>
          Email
        </label>
        {errors.email ? (
          <p className="mt-2 text-status-pill text-error" role="alert">
            {errors.email.message}
          </p>
        ) : null}
      </div>

      <div className="relative">
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder=" "
          aria-invalid={errors.password ? 'true' : undefined}
          className={INPUT_CLASS}
          {...register('password')}
        />
        <label htmlFor="password" className={LABEL_CLASS}>
          Password
        </label>
        {errors.password ? (
          <p className="mt-2 text-status-pill text-error" role="alert">
            {errors.password.message}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end">
        <Link
          href="/forgot-password"
          className="text-body-staff text-primary transition-all hover:underline"
        >
          Forgot your password?
        </Link>
      </div>

      {error ? (
        <p
          className="rounded-lg border border-error/30 bg-error-container px-3 py-2 text-body-staff text-error-on-container"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-4 font-display text-headline-md text-on-primary shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>{pending ? 'Signing in…' : 'Sign in'}</span>
        {!pending ? (
          <span className="material-symbols-outlined text-[20px]">login</span>
        ) : null}
      </button>
    </form>
  );
}
