'use server';

import { redirect } from 'next/navigation';
import { signOut } from '@/lib/auth';

/**
 * Server action invoked from the user menu. Clears the Auth.js session and
 * sends the viewer back to /sign-in. We use `redirect: false` because the
 * Auth.js server-action redirect flow throws a `NEXT_REDIRECT` for the
 * Auth.js sign-in URL; doing the redirect ourselves keeps `/sign-in` as the
 * single source of truth.
 */
export async function signOutAction(): Promise<void> {
  await signOut({ redirect: false });
  redirect('/sign-in');
}
