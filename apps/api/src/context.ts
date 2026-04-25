import type { Role } from '@repo/db';
import type { prisma } from './prisma.js';
import type { Logger } from './logger.js';

export type AuthContext =
  | { kind: 'anonymous' }
  | {
      kind: 'authenticated';
      user: { id: string; email: string };
      tenant: { id: string; slug: string };
      location: { id: string; timezone: string; currency: string } | null;
      role: Role;
    };

export interface RequestContext {
  auth: AuthContext;
  prisma: typeof prisma;
  requestId: string;
  log: Logger;
}
