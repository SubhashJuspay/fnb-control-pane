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

export async function verifySession(
  cookieHeader: string | undefined,
): Promise<VerifiedSession | null> {
  const token = readSessionCookie(cookieHeader);
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { sessionToken: token },
    select: { userId: true, sessionToken: true, expires: true },
  });
  if (!row) return null;
  if (row.expires < new Date()) return null;
  return {
    userId: row.userId,
    sessionToken: row.sessionToken,
    expiresAt: row.expires,
  };
}
