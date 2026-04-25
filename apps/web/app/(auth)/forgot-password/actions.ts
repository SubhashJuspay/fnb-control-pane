'use server';

import { forgotPasswordSchema } from '@repo/validation/auth';

export interface ForgotPasswordActionResult {
  ok?: boolean;
  error?: string;
}

/**
 * Forgot-password server action. Foundation does not yet wire a real
 * `requestPasswordReset` mutation — Wave 3b only built membership and
 * invitation mutations. We validate input, return a generic success
 * regardless of whether the email exists (avoids account enumeration),
 * and rely on a follow-up wave to wire the email send.
 */
// TODO(foundation): wire to api once requestPasswordReset mutation exists.
export async function forgotPasswordAction(input: {
  email: string;
}): Promise<ForgotPasswordActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid email' };
  }
  return { ok: true };
}
