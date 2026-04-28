import { createHash, randomBytes } from 'node:crypto';

const PEPPER = process.env.ONLINE_ORDER_TOKEN_PEPPER ?? 'dev-pepper-change-in-prod';

export function generateTrackingToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashTrackingToken(token);
  return { token, tokenHash };
}

export function hashTrackingToken(token: string): string {
  return createHash('sha256').update(token + PEPPER).digest('hex');
}
