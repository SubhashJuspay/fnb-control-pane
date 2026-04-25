'use server';

import { mfaChallengeSchema } from '@repo/validation/auth';

export interface MfaActionResult {
  ok?: boolean;
  error?: string;
}

/**
 * MFA challenge stub. Foundation renders the form so the route exists, but
 * full TOTP enrollment + verification ships in a later wave.
 */
// TODO(foundation): implement TOTP verification once the api ships challenge endpoints.
export async function verifyMfaAction(input: { code: string }): Promise<MfaActionResult> {
  const parsed = mfaChallengeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Invalid code' };
  }
  return { error: 'MFA is not implemented yet.' };
}
