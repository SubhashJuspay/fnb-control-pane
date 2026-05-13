import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = prisma;
}

export * from '@prisma/client';
// `Prisma` is re-exported as a namespace by `export *` above (it carries
// both runtime values like `Prisma.DbNull` and types like `Prisma.InputJsonValue`).
// We previously re-exported it as `export type { Prisma }` too, but with
// `verbatimModuleSyntax` enabled that shadowed the value side and broke
// `Prisma.DbNull` at runtime in callers.
