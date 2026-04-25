'use server';

import { resetPasswordSchema } from '@repo/validation/auth';

export interface ResetPasswordActionResult {
  ok?: boolean;
  error?: string;
}

/**
 * Reset-password server action stub. Foundation does not yet wire a real
 * `completePasswordReset` mutation — see forgot-password for context.
 */
// TODO(foundation): wire to api once completePasswordReset mutation exists.
export async function resetPasswordAction(input: {
  token: string;
  password: string;
}): Promise<ResetPasswordActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  return { ok: true };
}
