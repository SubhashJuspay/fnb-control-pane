# F&B Control Pane — Foundation Sub-Project Design

**Date:** 2026-04-25
**Status:** Approved (brainstorming phase complete; ready for implementation planning)
**Sub-project:** 0 of 7 — Foundation
**Repo:** `/Users/parth.vora/code/fnb-control-pane`

---

## 1. Project context

### 1.1 The platform vision

A web app for restaurants to manage in-person and online operations end to end:
orders, seating, staff, scheduling, online ordering, and analytics (top dishes,
guest retention). Modeled after Clover but self-hostable, with a polished
operator UI. Production-ready from the first ship.

### 1.2 Why this sub-project exists

The full platform is too large to design or implement as one unit. It has been
decomposed into 7 sub-projects with shared infrastructure. Each sub-project gets
its own spec → plan → implementation cycle. This document covers **Sub-project 0
(Foundation)** only.

### 1.3 Decomposition

| # | Sub-project | Status |
|---|---|---|
| 0 | **Foundation** — Docker, Postgres, GraphQL gateway, auth, multi-tenancy, design system | **This spec** |
| 1 | Menu & Catalog | Future |
| 2 | POS / In-Person Orders | Future |
| 3 | Floor / Tables / Reservations | Future |
| 4 | Online Orders | Future |
| 5 | Staff & Scheduling | Future |
| 6 | Analytics & Guest CRM | Future |
| — | Payroll | **Out of scope** — integrate third-party (Gusto/ADP) later, do not build |

### 1.4 Locked product/architecture decisions (from brainstorming)

| Decision | Choice |
|---|---|
| Tenancy model | Tenant → Location → User-with-role-per-location (Clover-style hierarchy) |
| Stack shape | TypeScript monorepo, Next.js (App Router) + standalone Node GraphQL service + Prisma |
| Authentication | Auth.js v5 self-hosted |
| UI foundation | shadcn/ui + Tailwind CSS + Radix primitives |
| Deployment model | Self-hosted via Docker; not coupled to Vercel |
| Postgres | v16, with `pgcrypto`, `citext`, `pg_trgm` extensions |
| GraphQL server | GraphQL Yoga on Fastify |
| GraphQL schema builder | Pothos (code-first) |
| Subscriptions transport | Server-Sent Events (SSE) |
| Pub/sub for cross-instance fanout | Postgres `LISTEN/NOTIFY` (Redis if/when scale demands) |
| Frontend GraphQL client | urql |
| Validation | Zod, shared between client and server in `packages/validation` |
| Repo tooling | pnpm workspaces + Turborepo |
| Testing | Vitest (unit + integration) + Playwright (E2E) + Testcontainers for ephemeral Postgres |
| Observability | Pino logs, Sentry errors (opt-in), OpenTelemetry traces (opt-in) |
| CI/CD | GitHub Actions, images pushed to GHCR; no auto-deploy in Foundation |

---

## 2. Architecture

### 2.1 High-level topology

Three deployable units plus Postgres, wired by docker-compose:

```
┌──────────────────┐       ┌─────────────────────┐       ┌──────────────┐
│  Next.js (web)   │ ───►  │  GraphQL API (api)  │ ───►  │  Postgres    │
│  App Router      │ HTTP  │  Yoga + Pothos +    │  TCP  │  16          │
│  shadcn/Tailwind │ ◄──── │  Fastify + Prisma   │ ◄──── │  pgcrypto    │
└──────────────────┘  SSE  └─────────────────────┘       │  citext      │
       │                            │                    │  pg_trgm     │
       │ Auth.js callbacks          │ subscriptions      └──────────────┘
       └────────────────────────────┘
```

- **`web`** — Next.js App Router. Hosts operator UI, Auth.js sign-in pages,
  proxies GraphQL requests to `api` so the browser only ever talks to the same
  origin (no CORS, cookies just work).
- **`api`** — Standalone Node service. GraphQL Yoga on Fastify. Owns the
  schema, Prisma client, RBAC enforcement, and SSE subscription transport.
- **`db`** — Postgres 16. Three extensions enabled at boot via init scripts.

**Why `api` is a separate service** rather than Next.js route handlers: future
non-web clients (KDS tablets, handheld POS, mobile, marketplace integrations)
will all consume the same GraphQL endpoint. Bundling the API into Next.js makes
that extraction painful later. One extra container is the right cost.

### 2.2 Repo layout

```
fnb-control-pane/
├─ apps/
│  ├─ web/                    # Next.js App Router app
│  │  ├─ app/                 # routes (auth, dashboard, settings)
│  │  ├─ components/          # app-specific components
│  │  └─ lib/                 # auth.ts (Auth.js config), graphql client
│  └─ api/                    # GraphQL service
│     ├─ src/
│     │  ├─ schema/           # Pothos builder + per-domain modules
│     │  ├─ context.ts        # request context (user, tenant, location)
│     │  ├─ permissions.ts    # RBAC scopes (Pothos auth-scopes plugin)
│     │  ├─ server.ts         # Yoga + Fastify bootstrap
│     │  └─ prisma.ts         # Prisma client singleton
│     └─ prisma/
│        └─ schema.prisma     # all models, organized by domain comments
├─ packages/
│  ├─ db/                     # Prisma client re-export + migrations CLI wrapper
│  ├─ graphql-schema/         # generated SDL + TS types (codegen output)
│  ├─ ui/                     # shadcn components, theme tokens
│  ├─ validation/             # shared Zod schemas (web + api)
│  ├─ config/                 # eslint, tsconfig, tailwind base configs
│  └─ types/                  # shared domain types not derived from GraphQL
├─ docker/
│  ├─ web.Dockerfile
│  ├─ api.Dockerfile
│  └─ postgres-init/          # extension setup SQL
├─ docker-compose.yml         # local dev (with hot reload)
├─ docker-compose.prod.yml    # production overlay
├─ turbo.json                 # build/test pipeline
├─ pnpm-workspace.yaml
└─ package.json
```

### 2.3 Cross-cutting tooling

- **TypeScript strict mode everywhere**, including `noUncheckedIndexedAccess`.
- **GraphQL Code Generator** runs in the `api` build pipeline; outputs SDL + TS
  types to `packages/graphql-schema`. The web app imports types from there —
  no manual type duplication.
- **Zod schemas** in `packages/validation` are imported by both Pothos input
  types (via a small adapter) and React Hook Form on the frontend.
- **Node 24 LTS** pinned via `.nvmrc` and `engines` in every `package.json`.

---

## 3. Foundation data model

### 3.1 Prisma schema

```prisma
// ─── Tenancy ───────────────────────────────────────────
model Tenant {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String                          // "Acme Restaurant Group"
  slug        String   @unique                // url-safe: "acme"
  status      TenantStatus @default(ACTIVE)   // ACTIVE | SUSPENDED | DELETED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  locations   Location[]
  memberships Membership[]
  invitations Invitation[]
}

model Location {
  id                String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String   @db.Uuid
  name              String                       // "Acme — Mission St"
  slug              String                       // unique within tenant
  timezone          String                       // IANA tz: "America/Los_Angeles"
  currency          String   @db.Char(3)         // ISO 4217: "USD"
  locale            String   @default("en-US")   // BCP 47
  address           Json?                        // structured address blob
  status            LocationStatus @default(ACTIVE)
  businessDayCutoff String   @default("04:00")   // local time when "today" rolls over
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  tenant            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  memberships       Membership[]

  @@unique([tenantId, slug])
  @@index([tenantId])
}

// ─── Identity (alongside Auth.js managed tables) ────────
model User {
  id            String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email         String    @unique @db.Citext
  emailVerified DateTime?
  name          String?
  image         String?
  passwordHash  String?                          // null if SSO-only
  mfaEnabled    Boolean   @default(false)
  mfaSecret     String?                          // encrypted at rest
  status        UserStatus @default(ACTIVE)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  accounts      Account[]                        // Auth.js OAuth links
  sessions      Session[]                        // Auth.js sessions
  memberships   Membership[]
}

// Auth.js requires Account, Session, VerificationToken — included verbatim
// from the @auth/prisma-adapter schema. Not duplicated here for brevity.

// ─── RBAC: User × Tenant × Location with role ──────────
model Membership {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId      String   @db.Uuid
  tenantId    String   @db.Uuid
  locationId  String?  @db.Uuid                  // NULL = tenant-wide
  role        Role
  status      MembershipStatus @default(ACTIVE)
  createdAt   DateTime @default(now())

  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location    Location? @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId, locationId])
  @@index([tenantId, locationId])
  @@index([userId])
}

model Invitation {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  locationId  String?  @db.Uuid
  email       String   @db.Citext
  role        Role
  token       String   @unique                    // single-use, hashed
  invitedById String   @db.Uuid
  expiresAt   DateTime
  acceptedAt  DateTime?
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  @@index([tenantId])
}

// ─── Audit trail ─────────────────────────────────────
model AuditLog {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @db.Uuid
  locationId   String?  @db.Uuid
  actorUserId  String?  @db.Uuid                  // null for system events
  action       String                              // "user.invited", ...
  resourceType String                              // "membership", "location"
  resourceId   String?
  metadata     Json?
  createdAt    DateTime @default(now())

  @@index([tenantId, createdAt])
  @@index([resourceType, resourceId])
}

// ─── Enums ───────────────────────────────────────────
enum Role {
  OWNER         // full control, billing, can delete tenant
  ADMIN         // manage all locations within tenant, manage staff
  MANAGER       // manage one location: staff, menu, schedule
  STAFF         // POS / floor / shift-clock access
  VIEWER        // read-only insights (e.g., investor, accountant)
}

enum TenantStatus      { ACTIVE  SUSPENDED  DELETED }
enum LocationStatus    { ACTIVE  CLOSED  ARCHIVED }
enum UserStatus        { ACTIVE  DISABLED }
enum MembershipStatus  { ACTIVE  REVOKED }
```

### 3.2 Schema decisions and rationale

1. **UUIDs everywhere, generated by Postgres (`gen_random_uuid()`)**.
   Restaurant data leaks across clients (KDS, mobile, web, receipts); exposing
   sequential IDs is a security/privacy mistake. UUIDv4 is sufficient.
2. **`Membership` is the single join table doing all RBAC work.** Links a User
   to a Tenant, optionally scoped to a Location. `locationId IS NULL` means
   tenant-wide (chain owner sees everything). `locationId IS NOT NULL` means
   scoped to that location. Cleanly represents indie restaurants and chains
   in one model.
3. **`Role` is a coarse enum, not a permission bitmap.** Five roles cover ~95%
   of restaurant orgs. A `Permission` table can be layered on later when a real
   customer asks. YAGNI.
4. **`businessDayCutoff` on Location.** Restaurants don't end the day at
   midnight. Stored as local-time HH:MM, applied in the analytics layer.
5. **`AuditLog` from day one.** Every sensitive mutation (role change,
   invitation, settings change) writes a row. Cheap now, expensive to backfill.
6. **`Invitation` with hashed single-use tokens.** Email a link, user sets
   password, token consumed.
7. **Soft delete via `status` enums, not boolean `deleted`.** Distinguishes
   `SUSPENDED` (billing) from `DELETED` (intentional) without schema churn.

### 3.3 Intentionally not in Foundation schema

- Menu, order, table, reservation, shift, schedule tables — each lives in its
  sub-project's spec.
- Postgres row-level security policies. Enforcement is in the GraphQL layer
  (Section 4). RLS is a strong defense-in-depth move; rolling it out wrong is
  a "nobody can read anything" outage. Defer to a focused phase post-Foundation.
- Billing / subscription tables. Stripe (or whoever) will own that; a thin
  sync table will arrive when needed.

---

## 4. GraphQL gateway and auth context

### 4.1 Server stack

```
Fastify  (HTTP server, structured logs via Pino, graceful shutdown)
  └─ GraphQL Yoga  (request/response, SSE subscriptions, file uploads)
      └─ Pothos schema  (code-first, plugins below)
          └─ Prisma  (Postgres data access)
```

### 4.2 Pothos plugins enabled in Foundation

| Plugin | Purpose |
|---|---|
| `@pothos/plugin-prisma` | Model types map 1:1 to Prisma; auto relation resolution; `prismaConnection` prevents n+1 |
| `@pothos/plugin-scope-auth` | Declarative auth on every field via `authScopes` |
| `@pothos/plugin-relay` | Cursor pagination via Relay connections |
| `@pothos/plugin-dataloader` | Batched cross-entity loaders |
| `@pothos/plugin-zod` | Pothos input validation backed by `packages/validation` |
| `@pothos/plugin-errors` | Typed errors as part of the schema (no `throw` blowing up the response) |
| `@pothos/plugin-tracing` | OpenTelemetry spans per resolver |

### 4.3 Request context — the heart of tenant isolation

Every GraphQL request constructs a context object exactly once. This is the
single chokepoint that enforces "who is asking, on behalf of which tenant,
scoped to which location."

```ts
// apps/api/src/context.ts
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
  prisma: PrismaClient;
  loaders: ReturnType<typeof buildLoaders>;
  requestId: string;
  log: Logger;             // Pino child logger bound with requestId + tenant context
}
```

**Context construction sequence per request:**

1. Read the Auth.js session cookie → `{ userId }` or anonymous.
2. Read two custom headers from the web client: `X-Tenant-Slug` and
   `X-Location-Id` (location optional).
3. Look up the `Membership` row matching `(userId, tenantId, locationId)`.
   If none exists, the request is **rejected at the context layer** — no
   resolver runs.
4. Construct a Pino child logger bound with
   `{ requestId, userId, tenantId, locationId }`. Every log line is tagged.

This single chokepoint is why Foundation does not need Postgres RLS: nothing
reaches a resolver without a verified `(tenant, location, role)` triple.

### 4.4 RBAC via Pothos auth scopes

Scopes are declared once at the schema builder, then composed per field:

```ts
// apps/api/src/schema/builder.ts
export const builder = new SchemaBuilder<{
  Context: RequestContext;
  AuthScopes: {
    authenticated: boolean;
    owner: boolean;
    admin: boolean;        // owner OR admin
    manager: boolean;      // owner OR admin OR manager (location-scoped)
    staff: boolean;        // any active membership
  };
}>({
  plugins: [...],
  scopeAuth: {
    authScopes: (ctx) => ({
      authenticated: ctx.auth.kind === 'authenticated',
      owner:   hasRole(ctx, ['OWNER']),
      admin:   hasRole(ctx, ['OWNER', 'ADMIN']),
      manager: hasRole(ctx, ['OWNER', 'ADMIN', 'MANAGER']),
      staff:   hasRole(ctx, ['OWNER', 'ADMIN', 'MANAGER', 'STAFF']),
    }),
  },
});

builder.mutationField('inviteStaff', (t) =>
  t.field({
    type: 'Invitation',
    authScopes: { manager: true },
    args: { input: t.arg({ type: InviteStaffInput, required: true }) },
    resolve: async (_root, { input }, ctx) => { /* ... */ },
  })
);
```

Scope failures emit a typed `ForbiddenError` to the client (not generic 500).
Denied mutations write an `AuditLog` entry with `action: 'auth.denied'`.

### 4.5 Subscriptions over SSE

POS, KDS, table-status, and shift-clock scenarios need real-time updates.
Foundation uses **Server-Sent Events**, not WebSockets:

- Yoga supports SSE natively (`useGraphQLSSE`).
- Works through every reverse proxy and corporate firewall without
  WebSocket-specific config.
- One-way (server → client) is exactly what is needed; mutations stay on HTTP.
- Auth is just cookies — same as queries/mutations. WebSockets would need a
  custom auth handshake.

Cross-instance fan-out (when scaling to multiple `api` replicas) uses Postgres
`LISTEN/NOTIFY`. No Redis in Foundation. Postgres handles this throughput
easily until hundreds of locations land on one node.

### 4.6 Error model

Three categories, each maps to a typed GraphQL union result on mutations:

1. **`InputValidationError`** — Zod rejected input. Field-level error messages
   returned to the client.
2. **`ForbiddenError`** — auth scope failed. Audit-logged.
3. **`ConflictError`** — domain-level rule violated (e.g., "email already
   invited"). Hand-written per resolver.

Anything else (DB down, network blip, programmer error) becomes
`InternalError` — masked from the client (no stack traces leaked), full
detail in Sentry + logs.

### 4.7 Tenant context delivery — headers vs URL path

**Decision: HTTP headers** (`X-Tenant-Slug`, `X-Location-Id`).

Rationale: simpler than path-encoding; preserves single GraphQL endpoint
convention; web client knows the slugs from the URL anyway. Path-encoding
buys nothing operationally and makes every non-web client carry the slug
through their URL builder.

---

## 5. Frontend shell

### 5.1 App Router structure

```
apps/web/app/
├─ (auth)/                            # public route group, no app chrome
│  ├─ sign-in/page.tsx
│  ├─ sign-up/page.tsx                # accept-invitation flow
│  ├─ forgot-password/page.tsx
│  ├─ reset-password/[token]/page.tsx
│  └─ mfa/page.tsx
├─ (app)/                             # authenticated route group
│  ├─ layout.tsx                      # SidebarShell + TopBar + LocationSwitcher
│  ├─ [tenantSlug]/
│  │  ├─ layout.tsx                   # validates membership, sets tenant context
│  │  ├─ overview/page.tsx            # tenant-wide dashboard (chain owners)
│  │  └─ [locationSlug]/
│  │     ├─ layout.tsx                # validates location access, sets location context
│  │     ├─ page.tsx                  # location dashboard
│  │     ├─ settings/                 # location settings (Foundation owns)
│  │     └─ ...                       # POS, floor, schedule mounted here later
│  └─ admin/                          # tenant-level admin
│     ├─ members/
│     ├─ locations/
│     ├─ audit-log/
│     └─ settings/
├─ api/
│  ├─ auth/[...nextauth]/route.ts     # Auth.js handler
│  └─ graphql/route.ts                # proxies to api service, forwards cookies
├─ layout.tsx                         # root layout, theme provider, fonts
└─ not-found.tsx
```

### 5.2 URL convention

`app.example.com/<tenantSlug>/<locationSlug>/<feature>`

Example: `app.example.com/acme/mission-st/floor`. Unambiguous, bookmarkable,
copy-pasteable. Slugs are the *display* identifiers; layout files resolve them
to UUIDs and validate access on every navigation.

Routing rules:
- Chain owner landing at `/` → redirect to `/<tenantSlug>/overview`.
- Location-scoped user landing at `/` → redirect to their default location.
- Location switcher in top bar swaps the segment, preserving the rest of the
  path when the target location supports it.

**Decision: path-based, not subdomains.** Simpler ops (no SSL wildcards,
easier dev), matches single-deployment philosophy.

### 5.3 Design system

```
packages/ui/
├─ src/
│  ├─ components/                     # shadcn primitives
│  ├─ patterns/                       # composed product patterns (DataTable, EmptyState, FormField)
│  ├─ theme/
│  │  ├─ tokens.ts                    # design tokens
│  │  └─ globals.css                  # Tailwind layers, CSS vars
│  └─ icons/                          # Lucide re-exports + custom restaurant icons
├─ tailwind.config.ts                 # base config
└─ package.json
```

**Theming via semantic CSS variables**:

```css
--color-bg-canvas: oklch(...);
--color-bg-surface: oklch(...);
--color-fg-default: oklch(...);
--color-fg-muted: oklch(...);
--color-accent-default: oklch(...);
--color-accent-emphasis: oklch(...);
--color-danger-default: oklch(...);
--color-success-default: oklch(...);
```

Buys light/dark mode now and per-tenant white-label themes later.

**Aesthetic direction (recommendation, not a lock):** lean Linear/Notion/Cron
rather than Material/Bootstrap. Dense but breathable, content-forward,
monochrome with a single accent color. Foundation installs the theming
machinery; the actual palette is set during the first product sub-project.

**Typography:** Inter for UI, JetBrains Mono for numeric (prices, totals,
table numbers). Tabular figures for scanning sales reports.

### 5.4 GraphQL client — urql

Choice: **urql** over Apollo Client.
- ~10× smaller bundle.
- Document caching matches our needs (no normalized-cache complexity required).
- First-class SSE subscription support.
- Plays nicely with Next.js Server Components.

The client reads `tenantSlug` and `locationId` from React context (hydrated by
the layout files), injects them as `X-Tenant-Slug` and `X-Location-Id` on every
request.

**Codegen:** `graphql-codegen` watches `*.graphql` operations files in
`apps/web/`, generates fully-typed React hooks (`useOrdersQuery`, etc.) that
import types from `packages/graphql-schema`.

### 5.5 Layout chrome

The authenticated `(app)` layout renders three structural pieces every
sub-project inherits:

1. **Left sidebar** — primary navigation. Static items (Dashboard, Settings,
   Admin) plus per-feature items registered by sub-projects. Collapsed by
   default on screens < 1280px.
2. **Top bar** — location switcher (left), command palette trigger `⌘K`
   (center), user menu + notifications (right). The command palette is
   Foundation infrastructure; sub-projects register actions into a central
   registry.
3. **Toast region + dialog portal** — global notifications and modal mount
   point. Sonner + Radix Dialog primitives.

### 5.6 Auth pages owned by Foundation

Sign-in, sign-up via invitation token, forgot password, reset password,
MFA enrollment, MFA challenge. Built with shadcn forms + React Hook Form +
Zod schemas from `packages/validation`. Full-bleed centered-card layouts.

---

## 6. Docker and deployment topology

### 6.1 Local development — `docker-compose.yml`

Four services. Hot-reload on `web` and `api` via bind mounts.

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: fnb
      POSTGRES_PASSWORD: fnb_dev
      POSTGRES_DB: fnb_control_pane
    ports: ["5432:5432"]
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "fnb"]
      interval: 5s

  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      target: dev
    environment:
      DATABASE_URL: postgres://fnb:fnb_dev@db:5432/fnb_control_pane
      AUTH_SECRET: ${AUTH_SECRET}
      NODE_ENV: development
      LOG_LEVEL: debug
    ports: ["4000:4000"]
    volumes:
      - ./apps/api:/app/apps/api
      - ./packages:/app/packages
      - /app/node_modules
    depends_on:
      db: { condition: service_healthy }
    command: pnpm --filter api dev

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: dev
    environment:
      NEXT_PUBLIC_API_URL: http://api:4000/graphql
      AUTH_URL: http://localhost:3000
      AUTH_SECRET: ${AUTH_SECRET}
      DATABASE_URL: postgres://fnb:fnb_dev@db:5432/fnb_control_pane
    ports: ["3000:3000"]
    volumes:
      - ./apps/web:/app/apps/web
      - ./packages:/app/packages
      - /app/node_modules
    depends_on: [api]
    command: pnpm --filter web dev

  mailhog:
    image: mailhog/mailhog                    # captures dev emails
    ports: ["8025:8025"]                      # web UI at localhost:8025

volumes:
  db_data:
```

Dev workflow: `pnpm dev` → `docker compose up --build`. Migrations via
`pnpm db:migrate`. Demo data via `pnpm db:seed`.

### 6.2 Dockerfiles — multi-stage

```dockerfile
# docker/api.Dockerfile (web.Dockerfile structurally identical)

FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/*/package.json packages/
RUN pnpm install --frozen-lockfile

FROM deps AS dev
COPY . .
EXPOSE 4000
CMD ["pnpm", "--filter", "api", "dev"]

FROM deps AS build
COPY . .
RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod /out

FROM node:24-alpine AS prod
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out /app
USER app
EXPOSE 4000
HEALTHCHECK CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/server.js"]
```

Production images target ~150–200 MB, run as a non-root user.

### 6.3 Production overlay — `docker-compose.prod.yml`

Applied on top of the base compose:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

Overlay changes:
- `target: prod` for `api` and `web` (slim images, no source volumes, no HMR).
- Removes `mailhog`.
- Adds an `nginx` reverse proxy in front of `web` for TLS termination,
  HTTP→HTTPS, gzip, security headers, and forwarding `/graphql` to `api`.
- `db` is **commented out** in the overlay — production Postgres should be a
  managed service (Neon, Supabase, RDS) or separately-orchestrated Postgres
  with proper backups. Documented clearly in the README.
- Restart policy `unless-stopped` on every service.
- Resource limits (CPU/mem) per service, sized for a small production
  deployment.

**Decision: Postgres is in compose for dev only, externalized in prod.**
Forces operators to think about backups, which is the right thing.

### 6.4 Environment variable contract

A single `.env.example` at the repo root lists every variable both apps need:

| Category | Variables |
|---|---|
| Database | `DATABASE_URL` |
| Auth | `AUTH_SECRET`, `AUTH_URL` |
| Email | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM` |
| Observability | `SENTRY_DSN` (optional), `OTEL_EXPORTER_OTLP_ENDPOINT` (optional) |
| Frontend | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL` |

Missing required variables fail-fast at boot via a Zod-validated config
module. No silent misconfiguration.

### 6.5 Deployment targets supported

- Single VPS / bare metal (Hetzner, DO, OCI free tier) — primary target.
- Anywhere docker-compose works — Coolify, Dokploy, CapRover, plain SSH.
- Kubernetes later — Dockerfiles are k8s-ready when scale demands. **No k8s
  manifests in Foundation.**

Foundation does **not** couple to Vercel. Next.js runs in a container.

---

## 7. Observability, testing, CI/CD

### 7.1 Observability

| Pillar | Tool | Notes |
|---|---|---|
| Structured logs | **Pino** in both `web` and `api` | stdout → container logs → operator's choice of aggregator |
| Errors | **Sentry** SDK (opt-in via `SENTRY_DSN`) | Free tier OK; self-hosted GlitchTip documented as alternative |
| Traces | **OpenTelemetry** SDK with OTLP exporter (opt-in) | Tempo, Jaeger, Honeycomb, Datadog all work |

Conventions:
- Every `api` log line is a Pino child logger bound with
  `{ requestId, tenantId, locationId, userId }` from request context. Grep one
  tenant ID, see all their requests.
- Sentry breadcrumbs include the same context. Sourcemaps resolved.
- `/health` endpoint on `api`: `{ status, db, version }`. Used by Docker
  healthcheck and external uptime monitors.
- `/metrics` endpoint exposes Prometheus-format metrics. Zero-cost when
  unused.

**Not in Foundation:** session replay, RUM, custom dashboards.

### 7.2 Testing

| Layer | Tool | Coverage focus |
|---|---|---|
| Unit | **Vitest** | Pure functions, Zod schemas, RBAC scope evaluation |
| Integration | **Vitest** + ephemeral Postgres via **Testcontainers** | Resolver-level tests with real DB. Most coverage lives here. |
| E2E | **Playwright** | Critical flows only |

Foundation conventions:
- `api` test setup: Postgres via Testcontainers, run migrations, snapshot
  empty schema, roll back to snapshot between tests. Tests are isolated, fast,
  and exercise the real DB. **No mocked databases.**
- Every resolver added by every sub-project must have at least one happy-path
  integration test and one forbidden-case test (wrong role / wrong tenant).
  Enforced by a custom Vitest config check.
- Playwright runs against a docker-compose stack started by CI. Three
  Foundation scenarios: invitation acceptance, sign-in, and "user-from-tenant-A
  cannot see tenant-B's data" (the regression test for the entire isolation
  model).

**Not in Foundation:** load tests, mutation testing, visual regression.

### 7.3 CI/CD — GitHub Actions

Single workflow `.github/workflows/ci.yml` on every push and PR:

```
1. Lint (eslint + prettier --check)              ← parallel
2. Typecheck (tsc --noEmit across workspaces)    ← parallel
3. Unit tests (vitest, no DB)                    ← parallel
4. Integration tests (vitest + Testcontainers)   ← needs Docker
5. Build (turbo run build --cache)               ← Turbo remote cache
6. E2E tests (Playwright against built images)   ← main + PRs to main
7. Push Docker images to GHCR                    ← only on main
```

Specifics:
- Turborepo remote cache via free GitHub Actions cache backend.
- Conventional Commits enforced on PR titles.
- `changesets` machinery present (not used in Foundation; ready for future).
- Branch protection on `main`: all checks green + 1 review.
- **No CD into a hosted environment from Foundation.** CI ends at "images
  pushed to GHCR." Operators pull them.

### 7.4 Dependency hygiene

- **Renovate** configured for weekly grouped PRs.
- `pnpm audit` in CI. High/critical vulns fail; lower severities reported.
- Pinned Node 24 LTS via `.nvmrc` and `engines`.

### 7.5 Documentation

| File | Contents |
|---|---|
| `README.md` | What this is, how to run it, quickstart with seeded demo data |
| `docs/architecture.md` | Short version of this design doc, kept current |
| `docs/contributing.md` | Branch naming, commit format, PR template, how to add a resolver, how to add a UI component |
| `docs/runbook.md` | Production operator's guide: env vars, backups, log locations, common incidents |
| `CLAUDE.md` (repo root) | Conventions Claude should follow when working in this repo |

---

## 8. Scope guard — what Foundation does NOT include

### 8.1 Belongs to later sub-projects

| Capability | Lives in |
|---|---|
| Menu / catalog / modifiers / pricing | Sub-project 1: Menu & Catalog |
| Orders, tickets, kitchen routing, payments | Sub-project 2: POS / In-Person Orders |
| Tables, floor plan editor, reservations, waitlist | Sub-project 3: Floor / Tables / Reservations |
| Customer-facing menu, online cart, checkout, delivery | Sub-project 4: Online Orders |
| Shifts, time clock, schedule editor, availability | Sub-project 5: Staff & Scheduling |
| Insights, dish performance, cohorts, guest CRM | Sub-project 6: Analytics & Guest CRM |
| Payroll | Out of scope — integrate Gusto/ADP later |

### 8.2 Explicit deferrals with rationale

| Deferred | Why |
|---|---|
| Postgres row-level security | Defense-in-depth value, but rolling out wrong = total outage. Add as its own focused phase later. |
| Fine-grained permissions beyond 5 roles | YAGNI. Add a `Permission` table when a real customer asks. |
| Stripe / billing surface | No revenue logic to wire up yet. |
| Onboarding wizard for new tenants | We do not yet know what data we need at signup. |
| Mobile / native apps | API is mobile-ready by construction; apps come post-PMF. |
| Kubernetes manifests | docker-compose covers single-node. k8s when scale demands. |
| i18n UI translations (Spanish, etc.) | Scaffolding (next-intl) is in place; English is the only locale on day one. |
| Multi-currency display logic beyond ISO storage | Storage correct now; FX/rounding lands with POS. |
| Marketplace / app integrations (Clover-style) | Massive scope; post-MVP "platform" milestone. |
| White-label per-tenant theming UI | Tokens designed for it; UI lands when a chain customer asks. |
| 2FA via SMS / WebAuthn / passkeys | TOTP MFA is in. Other factors are upgrades. |
| Real-time presence ("Sarah is editing this menu") | YAGNI for restaurants. |

---

## 9. Acceptance criteria — "Foundation is done"

A new engineer can:

1. Clone the repo.
2. Run `pnpm install && docker compose up`.
3. Log in as the seeded owner user.
4. Create a new location.
5. Invite a teammate via email link (visible in MailHog).
6. The teammate accepts, signs in.
7. The system enforces that the teammate cannot see another tenant's data
   (verified by an automated E2E test).

All of the above without any sub-project code being written. CI is green. The
runbook lets an outsider deploy this to a Hetzner box in under an hour.

---

## 10. Next steps

1. User reviews and approves this spec.
2. Invoke the `superpowers:writing-plans` skill to produce a detailed
   implementation plan that breaks Foundation into ordered, individually
   shippable tasks.
3. Execute that plan.
4. Sub-project 1 (Menu & Catalog) brainstorming begins after Foundation is
   complete.
