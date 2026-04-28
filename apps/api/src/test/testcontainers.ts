import { execSync } from 'node:child_process';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { PrismaClient } from '@repo/db';

let container: StartedPostgreSqlContainer | null = null;
let prismaInstance: PrismaClient | null = null;

export interface TestDb {
  prisma: PrismaClient;
  container: StartedPostgreSqlContainer;
  cleanup: () => Promise<void>;
}

/**
 * Start a fresh Postgres container, install the extensions our schema relies
 * on, run prisma migrate deploy against it, and return a ready PrismaClient.
 *
 * Use in `beforeAll`. Pair with `truncateAll(prisma)` in `beforeEach` if you
 * need a clean DB between tests within a single suite.
 */
export async function setupTestDb(): Promise<TestDb> {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withUsername('test')
    .withPassword('test')
    .withDatabase('test')
    .start();

  // Install required extensions before running migrations.
  await container.exec([
    'psql',
    '-U',
    'test',
    '-d',
    'test',
    '-c',
    'CREATE EXTENSION IF NOT EXISTS pgcrypto; CREATE EXTENSION IF NOT EXISTS citext; CREATE EXTENSION IF NOT EXISTS pg_trgm;',
  ]);

  const url = container.getConnectionUri();
  execSync('pnpm --filter @repo/db exec prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  prismaInstance = new PrismaClient({ datasources: { db: { url } } });
  // Force connection eagerly so the first test isn't penalized.
  await prismaInstance.$connect();

  const startedContainer = container;
  return {
    prisma: prismaInstance,
    container: startedContainer,
    cleanup: async () => {
      try {
        await prismaInstance?.$disconnect();
      } finally {
        await container?.stop();
        prismaInstance = null;
        container = null;
      }
    },
  };
}

/**
 * Wipe every domain table in dependency order. Cheap reset between tests
 * within the same suite.
 */
export async function truncateAll(p: PrismaClient): Promise<void> {
  await p.$executeRawUnsafe(
    'TRUNCATE TABLE audit_logs, invitations, memberships, sessions, accounts, verification_tokens, discounts, ticket_item_modifiers, ticket_items, reservations, tickets, tables, sections, location_modifiers, location_items, menu_section_items, menu_sections, menus, menu_item_modifier_groups, modifiers, modifier_groups, menu_items, tax_rates, tax_categories, categories, breaks, time_entries, shifts, availability_windows, employment_profiles, job_roles, users, locations, tenants RESTART IDENTITY CASCADE',
  );
}
