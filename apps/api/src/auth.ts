import { decode } from '@auth/core/jwt';
import { prisma } from './prisma.js';

const SESSION_COOKIE_NAME = 'authjs.session-token';
const SECURE_SESSION_COOKIE_NAME = '__Secure-authjs.session-token';

export interface VerifiedSession {
  userId: string;
  sessionToken: string;
  expiresAt: Date;
}

export function readSessionCookie(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) return null;
  const cookies: Record<string, string> = {};
  for (const piece of cookieHeader.split(';')) {
    const trimmed = piece.trim();
    if (trimmed.length === 0) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) {
      cookies[trimmed] = '';
      continue;
    }
    const name = trimmed.slice(0, eq).trim();
    const rawValue = trimmed.slice(eq + 1).trim();
    let value: string;
    try {
      value = decodeURIComponent(rawValue);
    } catch {
      value = rawValue;
    }
    cookies[name] = value;
  }
  return cookies[SESSION_COOKIE_NAME] ?? cookies[SECURE_SESSION_COOKIE_NAME] ?? null;
}

/**
 * Foundation auth: the web app issues Auth.js v5 JWE session tokens (the
 * Credentials provider on Auth.js v5 mandates `session.strategy = 'jwt'`).
 * The api decodes the encrypted token using the shared `AUTH_SECRET`,
 * extracts the user id from the JWT subject, and confirms the user is still
 * ACTIVE. We do NOT consult the Session table — there is no row to consult
 * under JWT strategy.
 *
 * The legacy `Session` table remains in the schema for OAuth provider linking
 * (Auth.js's database adapter uses it for non-credentials providers). We just
 * don't read it here.
 */
const SALT_BY_COOKIE: Record<string, string> = {
  [SESSION_COOKIE_NAME]: SESSION_COOKIE_NAME,
  [SECURE_SESSION_COOKIE_NAME]: SECURE_SESSION_COOKIE_NAME,
};

function pickCookieAndSalt(cookieHeader: string): { token: string; salt: string } | null {
  for (const piece of cookieHeader.split(';')) {
    const trimmed = piece.trim();
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    const name = trimmed.slice(0, eq).trim();
    if (name in SALT_BY_COOKIE) {
      const salt = SALT_BY_COOKIE[name];
      if (!salt) continue;
      const rawValue = trimmed.slice(eq + 1).trim();
      let value: string;
      try {
        value = decodeURIComponent(rawValue);
      } catch {
        value = rawValue;
      }
      return { token: value, salt };
    }
  }
  return null;
}

export async function verifySession(
  cookieHeader: string | undefined,
): Promise<VerifiedSession | null> {
  if (!cookieHeader) return null;
  const picked = pickCookieAndSalt(cookieHeader);
  if (!picked || !picked.token) return null;

  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;

  let raw: Awaited<ReturnType<typeof decode>>;
  try {
    raw = await decode({
      token: picked.token,
      secret,
      salt: picked.salt,
    });
  } catch {
    return null;
  }
  const payload = raw as { sub?: unknown; exp?: unknown } | null;
  if (!payload) return null;
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null;

  const exp =
    typeof payload.exp === 'number' && Number.isFinite(payload.exp)
      ? new Date(payload.exp * 1000)
      : null;
  if (exp && exp < new Date()) return null;

  // Defence in depth: confirm the user still exists and is active.
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, status: true },
  });
  if (!user || user.status !== 'ACTIVE') return null;

  return {
    userId: user.id,
    sessionToken: picked.token,
    expiresAt: exp ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
  };
}
