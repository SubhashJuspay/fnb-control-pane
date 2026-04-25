# Claude conventions for this repo

## Project shape

- TypeScript monorepo (pnpm workspaces + Turborepo).
- Two apps: `apps/web` (Next.js), `apps/api` (GraphQL Yoga + Fastify).
- Shared packages live in `packages/`.
- Multi-tenant: Tenant → Location → Membership-with-role. Tenant isolation is
  enforced once at the GraphQL request context, not via Postgres RLS.

## Hard rules

- TypeScript strict mode, including `noUncheckedIndexedAccess`. No `any`.
- All shared types come from `packages/graphql-schema` (generated) or
  `packages/types`. Do not redefine them.
- All input validation goes through `packages/validation` (Zod). Same schemas
  power Pothos and React Hook Form.
- Resolvers must declare `authScopes`. A resolver without auth scopes is a bug.
- Every resolver gets at least one happy-path integration test and one
  forbidden-case test. Integration tests use Testcontainers — never mock the DB.
- Logs go through Pino. No `console.log` in shipped code.
- UUIDs everywhere as primary keys. Never expose sequential IDs.

## Conventions

- File naming: kebab-case for files, PascalCase for components, camelCase for vars.
- Imports: prefer named imports. Workspace deps via `@repo/*`.
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`).
- Keep files focused. If a file > 300 lines, consider splitting by responsibility.
- One responsibility per module. Files that change together live together.

## Where things live

- GraphQL schema modules: `apps/api/src/schema/<domain>.ts`.
- Pothos builder + plugins: `apps/api/src/schema/builder.ts`.
- Request context: `apps/api/src/context.ts`.
- RBAC scopes: `apps/api/src/permissions.ts`.
- Web auth pages: `apps/web/app/(auth)/`.
- Web app shell: `apps/web/app/(app)/layout.tsx`.

## Documentation

The design doc and plan are in `docs/superpowers/`. Read them before adding
anything new — many decisions are already made.
