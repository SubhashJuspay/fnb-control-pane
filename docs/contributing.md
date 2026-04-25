# Contributing

## Local development quickstart

Prerequisites: Docker, Node 24, pnpm 9 (via Corepack — `corepack enable`).

```bash
pnpm install
cp .env.example .env

# Start the full stack (Postgres, MailHog, api, web)
pnpm dev

# In a second terminal: apply migrations and seed demo data
pnpm db:migrate
pnpm db:seed
```

Then:

- Web app: <http://localhost:3000>
- GraphQL playground: <http://localhost:4000/graphql>
- MailHog (dev email inbox): <http://localhost:8025>
- Demo credentials: printed by `pnpm db:seed`.

If you prefer running services on the host, replace `pnpm dev` with
`pnpm dev:local` (Turborepo runs every workspace's `dev` task), and start
just Postgres + MailHog from compose.

## Adding a resolver

1. **Type & input.** Add the GraphQL type and input in
   `apps/api/src/schema/<domain>.ts`. Use the Pothos Prisma plugin to wire
   types to the Prisma models — never redeclare fields by hand.
2. **Auth scopes.** Declare `authScopes: { ... }`. There is no exception
   to this rule. The four available scopes are `owner`, `admin`, `manager`,
   `staff`; `viewer` is the default if no scope is declared, but you should
   still set it explicitly so reviewers can see the intent.
3. **Validation.** Put the Zod schema in
   `packages/validation/src/<domain>.ts` and re-export it from the package
   root. Reuse the same schema for the Pothos input.
4. **Audit logging.** Sensitive mutations (anything that creates a
   membership, location, invitation, or changes a role) write an `AuditLog`
   row before returning. Use the helper in `apps/api/src/audit.ts`.
5. **Tests.** Write at least one happy-path integration test and one
   forbidden-case test in
   `apps/api/src/schema/<domain>.test.ts` or
   `apps/api/src/test/integration/`. Tests use Testcontainers — never mock
   the DB.
6. **Verify.** Run `pnpm --filter @app/api test` and
   `pnpm --filter @app/api typecheck` before opening a PR.

## Adding a UI component

- **Primitive (button, input, dialog) →** `packages/ui/src/components/`.
- **Composed product pattern (data table, empty state) →**
  `packages/ui/src/patterns/`.
- **App-specific (admin form for inviting members, the tenant switcher) →**
  `apps/web/components/`.

Re-export anything new from `@repo/ui` via `packages/ui/src/index.ts` so
consumers can `import { ... } from '@repo/ui'`.

For pages, follow the routing convention in `architecture.md`:

- Auth pages → `apps/web/app/(auth)/`.
- Authenticated tenant-scoped pages →
  `apps/web/app/(app)/[tenantSlug]/...`.
- Location-scoped pages →
  `apps/web/app/(app)/[tenantSlug]/[locationSlug]/...`.

## GraphQL operations

Colocate `.graphql` operation files (or inline `graphql(...)` tagged
templates) with the component that uses them. Run `pnpm --filter @app/web
codegen` to generate typed `urql` document nodes. The `predev` and
`prebuild` hooks run codegen automatically; in CI we use the static
`apps/web/lib/graphql/schema.graphql` file so codegen does not require a
running api.

## Commit conventions

Conventional Commits: `feat:`, `fix:`, `chore:`, `docs:`, `test:`,
`refactor:`, `perf:`, `ci:`, `style:`, `build:`. The
`Conventional Commits` GitHub Action enforces this on PR titles.

Keep commits scoped to one responsibility. If a change touches multiple
sub-systems, split it.

## PR workflow

1. Open a PR against `main`.
2. CI must be green: lint, typecheck, unit + integration tests, web build,
   Playwright E2E.
3. Get one approving review.
4. Squash-merge with a Conventional Commits message that summarizes the PR.
5. Renovate handles dependency upgrades on a weekly schedule (Mondays
   before 5am Pacific). Don't manually upgrade transitively-pinned
   packages — let Renovate group the bumps.

## Code review expectations

Reviewers check:

- **Auth scopes** are present and correct on every resolver.
- **Tests** cover the happy path and at least one forbidden case.
- **Validation** lives in `packages/validation`, not inline.
- **Audit logs** are written on sensitive mutations.
- **No `any`**, no `console.log`, no `as` casts that bypass the type system.
- **File size** stays focused — anything over ~300 lines should split.
- **Generated types** (Prisma, codegen) are committed when their inputs
  change.
- **Docs** updated when behavior changes — runbook for ops surface,
  architecture for structural shifts.

If you're unsure, leave a comment with the specific question. We'd rather
slow down a PR than merge ambiguity.
