# Architecture

Short summary of the design — see
[`docs/superpowers/specs/2026-04-25-fnb-foundation-design.md`](superpowers/specs/2026-04-25-fnb-foundation-design.md)
for the canonical version.

## Topology

Three deployable units plus Postgres:

- `web` — Next.js App Router (UI, Auth.js sign-in pages, GraphQL proxy).
- `api` — Standalone Node service running GraphQL Yoga on Fastify with Pothos.
- `db` — Postgres 16 with `pgcrypto`, `citext`, `pg_trgm`.

## Multi-tenancy

`Tenant → Location → Membership-with-role`. A `Membership` row links a User to
a Tenant, optionally scoped to a Location. `locationId IS NULL` means
tenant-wide access (chain owner).

Isolation is enforced once at the GraphQL request context. Every request
constructs `(user, tenant, location, role)` from the Auth.js cookie plus
`X-Tenant-Slug` and `X-Location-Id` headers; no resolver runs without it.

## Roles

`OWNER`, `ADMIN`, `MANAGER`, `STAFF`, `VIEWER`. Auth scopes (`owner`, `admin`,
`manager`, `staff`) are defined at the Pothos schema builder and applied via
`authScopes: { ... }` on every field.
