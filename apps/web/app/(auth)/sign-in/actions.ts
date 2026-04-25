'use server';

import { signIn } from '@/lib/auth';
import { signInSchema } from '@repo/validation/auth';

export interface SignInActionResult {
  error?: string;
  redirectTo?: string;
}

/**
 * Server action for the sign-in form. Wraps `signIn('credentials', ...)`
 * from Auth.js v5 and collapses every credentials-error variant onto a
 * single safe message so we never leak whether an account exists.
 */
export async function signInAction(input: {
  email: string;
  password: string;
  next?: string;
}): Promise<SignInActionResult> {
  const parsed = signInSchema.safeParse({
    email: input.email,
    password: input.password,
  });
  if (!parsed.success) {
    return { error: 'Email or password is incorrect.' };
  }
  try {
    await signIn('credentials', { ...parsed.data, redirect: false });
    return { redirectTo: input.next ?? '/' };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'CredentialsSignin' || name === 'CallbackRouteError') {
      return { error: 'Email or password is incorrect.' };
    }
    return { error: 'Something went wrong. Please try again.' };
  }
}
