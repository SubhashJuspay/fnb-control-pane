import { createHash, randomBytes } from 'node:crypto';

export interface InvitationTokenPair {
  /** The single-use token to send to the invitee (URL-safe, ~43 chars). */
  token: string;
  /** The SHA-256 hash of the token, stored in DB for lookup. */
  tokenHash: string;
}

export function generateInvitationToken(): InvitationTokenPair {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  return { token, tokenHash };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
