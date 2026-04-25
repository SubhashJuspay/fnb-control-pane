import { z } from 'zod';

/**
 * Server-side environment. Validated at module load.
 *
 * Note: Next.js inlines `process.env.NEXT_PUBLIC_*` into the browser bundle ONLY when
 * referenced statically. We expose them through the separate `publicEnv` object
 * (computed from static references) so the client always gets the inlined values.
 */
const serverEnvSchema = z.object({
  AUTH_SECRET: z.string().min(1, 'AUTH_SECRET is required'),
  AUTH_URL: z.string().url().optional(),
  DATABASE_URL: z.string().url(),
  INTERNAL_API_URL: z.string().url().default('http://api:4000/graphql'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z
    .union([z.string(), z.number()])
    .optional()
    .transform((v) => (v === undefined ? undefined : Number(v))),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  // EMAIL_FROM may be a bare address ("noreply@example.com") or a display
  // form ("Display Name <noreply@example.com>") — both are valid for SMTP.
  EMAIL_FROM: z.string().min(1).optional(),
});

const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.string().url().default('http://localhost:4000/graphql'),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type PublicEnv = z.infer<typeof publicEnvSchema>;

function parseServerEnv(): ServerEnv {
  // Avoid throwing during `next build` static analysis when AUTH_SECRET isn't set;
  // the build step doesn't actually need it. We only validate at runtime.
  if (process.env.NEXT_PHASE === 'phase-production-build') {
    return {
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'build-time-placeholder',
      AUTH_URL: process.env.AUTH_URL,
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://placeholder@localhost:5432/build',
      INTERNAL_API_URL: process.env.INTERNAL_API_URL ?? 'http://api:4000/graphql',
      SMTP_HOST: process.env.SMTP_HOST,
      SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      SMTP_USER: process.env.SMTP_USER,
      SMTP_PASSWORD: process.env.SMTP_PASSWORD,
      EMAIL_FROM: process.env.EMAIL_FROM,
    } satisfies ServerEnv;
  }
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid server environment: ${issues}`);
  }
  return parsed.data;
}

// Static references so Next.js inlines them in the client bundle.
const rawPublicEnv = {
  NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

const publicParsed = publicEnvSchema.safeParse(rawPublicEnv);
if (!publicParsed.success) {
  const issues = publicParsed.error.issues
    .map((i) => `${i.path.join('.')}: ${i.message}`)
    .join('; ');
  throw new Error(`Invalid public environment: ${issues}`);
}

export const publicEnv: PublicEnv = publicParsed.data;

// Lazy init for server env so importing this file from a client component doesn't blow up.
let cached: ServerEnv | null = null;
export const env: ServerEnv = new Proxy({} as ServerEnv, {
  get(_target, prop: string) {
    if (typeof window !== 'undefined') {
      throw new Error(
        `env.${prop} accessed in the browser. Use publicEnv for browser-safe variables.`,
      );
    }
    if (!cached) cached = parseServerEnv();
    return cached[prop as keyof ServerEnv];
  },
});
