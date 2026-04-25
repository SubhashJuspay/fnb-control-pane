# Architecture

This is the operator-facing summary. The canonical, fully detailed design
lives in
[`docs/superpowers/specs/2026-04-25-fnb-foundation-design.md`](superpowers/specs/2026-04-25-fnb-foundation-design.md)
— if anything here disagrees, the spec wins.

## Topology

Four components, three of which we ship and one of which is optional:

```
                 ┌───────────────────────────┐
                 │  nginx (prod overlay,     │
                 │  TLS terminator + SSE OK) │
                 └────────────┬──────────────┘
                              │
               ┌──────────────┴──────────────┐
               │                             │
       ┌───────▼───────┐             ┌───────▼───────┐
       │   web (3000)  │  /api/gql   │   api (4000)  │
       │ Next.js App   │────proxy───▶│ Yoga + Pothos │
       │ Router + Auth │             │  + Fastify    │
       └───────┬───────┘             └───────┬───────┘
               │                             │
               └──────────────┬──────────────┘
                              │
                       ┌──────▼──────┐
                       │  Postgres   │
                       │     16      │
                       └─────────────┘
```

- **`web`** — Next.js App Router. Owns auth pages, the tenant-scoped app
  shell, and a tiny GraphQL proxy at `/api/graphql` that forwards the
  Auth.js cookie plus `X-Tenant-Slug` / `X-Location-Id` headers to the api.
- **`api`** — Standalone Node service running GraphQL Yoga on Fastify with
  Pothos. Serves `/graphql`, `/health`, and SSE subscriptions on the same
  port.
- **`db`** — Postgres 16 with `pgcrypto`, `citext`, `pg_trgm`. Externalized
  in production (see `docker-compose.prod.yml`).
- **`nginx`** — Optional TLS terminator + reverse proxy in the prod overlay.
  Operators with a managed load balancer can drop this service.

## Multi-tenancy

The model is `Tenant → Location → Membership-with-role`:

- A **Tenant** is a billing customer (a restaurant brand).
- A **Location** is a physical site (a single store inside a chain).
  `locationId IS NULL` on a membership means tenant-wide access (chain owner).
- A **Membership** links a User to a Tenant, optionally scoped to a
  Location, with a role (`OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `VIEWER`).

**Isolation is enforced once, at the GraphQL request context.** Every
request constructs `{ user, tenant, location, role }` from the Auth.js
session cookie plus the `X-Tenant-Slug` / `X-Location-Id` headers; no
resolver runs without a fully resolved context. We deliberately do **not**
use Postgres row-level security — the request context is the single
choke-point and is far easier to reason about and test.

See the spec, Section 4.3, for the full context shape.

## Key data tables

| Table                                     | Purpose                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `User`                                    | Auth.js identity (one row per human, regardless of how many tenants they belong to).              |
| `Tenant`                                  | Restaurant brand. Slug-addressable.                                                               |
| `Location`                                | Physical site within a tenant. Slug-addressable inside the tenant.                                |
| `Membership`                              | (`userId`, `tenantId`, `locationId?`, `role`). The grant table — every authz check goes via this. |
| `Invitation`                              | Pending invite token (single-use, expires after 14 days).                                         |
| `AuditLog`                                | Append-only log of mutations on tenant/membership/location/invitation.                            |
| `Account`, `Session`, `VerificationToken` | Auth.js Prisma adapter tables.                                                                    |

UUIDs everywhere. No sequential IDs are exposed to clients.

## GraphQL schema convention

Pothos with the code-first builder:

- Schema modules live in `apps/api/src/schema/<domain>.ts`.
- The Prisma plugin wires types directly to the Prisma model definitions
  (no DSL-vs-DB drift).
- The scope-auth plugin defines four scopes — `owner`, `admin`, `manager`,
  `staff` — applied via `authScopes: { ... }` on **every** field. A
  resolver without `authScopes` is treated as a bug and fails review.
- Inputs are validated by Zod schemas in `packages/validation`. The same
  schema powers Pothos input validation and React Hook Form on the web.
- Errors flow through the errors plugin. We expose typed `*Error` unions
  for mutations (`ValidationError`, `Forbidden`, `NotFound`) — no thrown
  exceptions leaking through to clients.
- Subscriptions use Yoga's SSE transport. Postgres `LISTEN/NOTIFY` is the
  fan-out mechanism.

## Frontend conventions

- Auth pages live in `apps/web/app/(auth)/`.
- Authenticated routes are nested under `apps/web/app/(app)/[tenantSlug]/`,
  with optional `[locationSlug]` nested for location-scoped pages.
- The app shell — sidebar, top bar, command palette — lives in
  `apps/web/components/shell/`.
- Reusable primitives (button, dialog, table, form) live in `@repo/ui`.
  App-specific composed components (admin dialogs, tenant-aware tables)
  live in `apps/web/components/`.
- GraphQL operations are colocated with the components that use them and
  picked up by the codegen pipeline (`@graphql-codegen/near-operation-file-preset`)
  to produce typed `urql` document nodes.

## Cross-cutting conventions

- TypeScript strict, including `noUncheckedIndexedAccess`. No `any`.
- Shared types come from `packages/types` or generated GraphQL types — never
  redeclared.
- All input validation goes through `packages/validation` (Zod). Same
  schemas power Pothos and React Hook Form.
- Audit logs are written on every sensitive mutation
  (`createLocation`, `inviteStaff`, `acceptInvitation`,
  `revokeInvitation`, `revokeMembership`, `updateMembershipRole`).
- Logs go through Pino. No `console.log` in shipped code.
- Tests prefer Testcontainers over mocks for the database — real Postgres,
  every time.

## Where to look next

- **Designing a new resolver?** Read `docs/contributing.md` and Section 4
  of the spec.
- **Deploying or operating the stack?** Read `docs/runbook.md`.
- **Wiring the CI pipeline?** See `.github/workflows/ci.yml`.
