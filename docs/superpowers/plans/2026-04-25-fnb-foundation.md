# F&B Control Pane — Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Foundation sub-project — Docker-orchestrated multi-tenant scaffolding with Postgres, GraphQL gateway, Auth.js, RBAC enforcement, and a Next.js + shadcn UI shell — that downstream sub-projects (Menu, POS, Floor, etc.) build on top of.

**Architecture:** TypeScript monorepo with two apps (`web` Next.js, `api` Node GraphQL) and shared packages (`db`, `validation`, `ui`, `config`, `graphql-schema`, `types`). Postgres 16 with `pgcrypto`/`citext`/`pg_trgm` extensions. GraphQL Yoga on Fastify with Pothos schema builder. Auth.js v5 self-hosted with credentials provider. shadcn/ui + Tailwind CSS for the web shell. Multi-tenant via Tenant → Location → Membership-with-role hierarchy enforced at the GraphQL context layer.

**Tech Stack:** TypeScript (strict), Node 24 LTS, pnpm workspaces, Turborepo, Next.js 15 App Router, GraphQL Yoga, Pothos, Prisma, Postgres 16, Auth.js v5, shadcn/ui, Tailwind CSS, Radix primitives, urql, Zod, Pino, Vitest, Testcontainers, Playwright, GitHub Actions, Docker.

**Spec:** `docs/superpowers/specs/2026-04-25-fnb-foundation-design.md`

**Note for executors:** This plan assumes Docker is available locally (the dev environment depends on it). The repo is already initialized as a git repo on `main` with the design doc as the only existing commit.

---

## Phase 1 — Repo Skeleton

### Task 1: Initialize monorepo configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `.editorconfig`
- Create: `turbo.json`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create `.nvmrc`**

```
24
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
# Dependencies
node_modules/
.pnpm-store/

# Build output
dist/
.next/
out/
build/
.turbo/

# Environment
.env
.env.local
.env.*.local
!.env.example

# Logs
*.log
npm-debug.log*
yarn-debug.log*
pnpm-debug.log*

# Testing
coverage/
playwright-report/
test-results/

# IDE
.vscode/*
!.vscode/extensions.json
!.vscode/settings.json.example
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Prisma
*.db
*.db-journal

# Generated
packages/graphql-schema/src/generated/
apps/web/lib/graphql/generated/
```

- [ ] **Step 3: Create `.editorconfig`**

```ini
root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false
```

- [ ] **Step 4: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
```

- [ ] **Step 5: Create root `package.json`**

```json
{
  "name": "fnb-control-pane",
  "private": true,
  "version": "0.0.0",
  "engines": {
    "node": ">=24.0.0",
    "pnpm": ">=9.0.0"
  },
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "build": "turbo run build",
    "dev": "docker compose up --build",
    "dev:local": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "test:e2e": "turbo run test:e2e",
    "typecheck": "turbo run typecheck",
    "format": "prettier --write \"**/*.{ts,tsx,js,json,md,yml,yaml}\"",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,json,md,yml,yaml}\"",
    "db:migrate": "pnpm --filter @repo/db migrate",
    "db:seed": "pnpm --filter @repo/db seed",
    "db:reset": "pnpm --filter @repo/db reset",
    "clean": "turbo run clean && rm -rf node_modules"
  },
  "devDependencies": {
    "prettier": "^3.4.2",
    "turbo": "^2.3.3",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 6: Create `turbo.json`**

```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env.example", "tsconfig.base.json"],
  "globalEnv": ["NODE_ENV", "CI"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**", ".next/**", "!.next/cache/**"],
      "env": ["DATABASE_URL", "AUTH_SECRET", "AUTH_URL", "NEXT_PUBLIC_API_URL", "NEXT_PUBLIC_APP_URL"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": ["coverage/**"]
    },
    "test:e2e": {
      "dependsOn": ["^build"],
      "cache": false
    },
    "typecheck": {
      "dependsOn": ["^build"],
      "outputs": []
    },
    "clean": {
      "cache": false
    }
  }
}
```

- [ ] **Step 7: Create `tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true
  }
}
```

- [ ] **Step 8: Install root deps and verify**

```bash
pnpm install
pnpm typecheck || true   # nothing to typecheck yet, OK if no-op
```

Expected: pnpm installs without errors. `node_modules/` and `pnpm-lock.yaml` created.

- [ ] **Step 9: Commit**

```bash
git add .nvmrc .gitignore .editorconfig pnpm-workspace.yaml package.json turbo.json tsconfig.base.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: initialize pnpm + turbo monorepo skeleton

Sets up workspace topology, root scripts, Turbo task graph, and shared
TypeScript base config. Workspaces resolve from apps/* and packages/*.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Shared config package (ESLint, Prettier, Tailwind preset)

**Files:**
- Create: `packages/config/package.json`
- Create: `packages/config/eslint.cjs`
- Create: `packages/config/prettier.cjs`
- Create: `packages/config/tailwind.preset.ts`
- Create: `packages/config/tsconfig.base.json`
- Create: `.prettierrc.cjs`
- Create: `.prettierignore`

- [ ] **Step 1: Create `packages/config/package.json`**

```json
{
  "name": "@repo/config",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": {
    "./eslint": "./eslint.cjs",
    "./prettier": "./prettier.cjs",
    "./tailwind": "./tailwind.preset.ts",
    "./tsconfig": "./tsconfig.base.json"
  },
  "files": ["eslint.cjs", "prettier.cjs", "tailwind.preset.ts", "tsconfig.base.json"],
  "devDependencies": {
    "@typescript-eslint/eslint-plugin": "^8.18.0",
    "@typescript-eslint/parser": "^8.18.0",
    "eslint": "^9.17.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react": "^7.37.2",
    "eslint-plugin-react-hooks": "^5.1.0",
    "tailwindcss": "^3.4.17"
  }
}
```

- [ ] **Step 2: Create `packages/config/eslint.cjs`**

```js
/** @type {import('eslint').Linter.Config} */
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2023,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  ignorePatterns: ['dist/', '.next/', 'node_modules/', '*.config.*', 'generated/'],
};
```

- [ ] **Step 3: Create `packages/config/prettier.cjs`**

```js
/** @type {import('prettier').Config} */
module.exports = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  arrowParens: 'always',
  bracketSpacing: true,
  plugins: [],
};
```

- [ ] **Step 4: Create `.prettierrc.cjs` (root, re-exporting)**

```js
module.exports = require('@repo/config/prettier');
```

- [ ] **Step 5: Create `.prettierignore`**

```
node_modules/
dist/
.next/
.turbo/
coverage/
generated/
pnpm-lock.yaml
```

- [ ] **Step 6: Create `packages/config/tsconfig.base.json`**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "composite": false,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [ ] **Step 7: Create `packages/config/tailwind.preset.ts`**

```ts
import type { Config } from 'tailwindcss';

const preset: Partial<Config> = {
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        border: 'oklch(var(--color-border) / <alpha-value>)',
        input: 'oklch(var(--color-input) / <alpha-value>)',
        ring: 'oklch(var(--color-ring) / <alpha-value>)',
        background: 'oklch(var(--color-bg-canvas) / <alpha-value>)',
        foreground: 'oklch(var(--color-fg-default) / <alpha-value>)',
        muted: {
          DEFAULT: 'oklch(var(--color-bg-muted) / <alpha-value>)',
          foreground: 'oklch(var(--color-fg-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'oklch(var(--color-accent-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-accent-fg) / <alpha-value>)',
        },
        surface: 'oklch(var(--color-bg-surface) / <alpha-value>)',
        danger: {
          DEFAULT: 'oklch(var(--color-danger-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-danger-fg) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'oklch(var(--color-success-default) / <alpha-value>)',
          foreground: 'oklch(var(--color-success-fg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};

export default preset;
```

- [ ] **Step 8: Install and verify**

```bash
pnpm install
pnpm exec eslint --version
pnpm exec prettier --version
```

Expected: eslint and prettier resolve, no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/config .prettierrc.cjs .prettierignore pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
chore: add @repo/config package with shared eslint, prettier, tailwind preset

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Project documentation skeleton + env contract

**Files:**
- Create: `README.md`
- Create: `CLAUDE.md`
- Create: `.env.example`
- Create: `docs/architecture.md`
- Create: `docs/contributing.md`
- Create: `docs/runbook.md`

- [ ] **Step 1: Create `README.md`**

```markdown
# F&B Control Pane

Production-ready, self-hostable web platform for restaurants — orders, seating,
staff, scheduling, online ordering, and analytics.

## Status

Foundation phase (sub-project 0 of 7). See
[`docs/superpowers/specs/2026-04-25-fnb-foundation-design.md`](docs/superpowers/specs/2026-04-25-fnb-foundation-design.md)
for the design and
[`docs/superpowers/plans/2026-04-25-fnb-foundation.md`](docs/superpowers/plans/2026-04-25-fnb-foundation.md)
for the implementation plan.

## Quickstart

Prerequisites: Docker, Node 24, pnpm 9.

```bash
# 1. Install
pnpm install

# 2. Start the stack (Postgres + api + web + mailhog)
cp .env.example .env
pnpm dev

# 3. In a second terminal, run migrations and seed demo data
pnpm db:migrate
pnpm db:seed
```

Then open:
- Web app: http://localhost:3000
- GraphQL playground: http://localhost:4000/graphql
- MailHog (dev email inbox): http://localhost:8025
- Demo credentials: printed by `pnpm db:seed`

## Repo layout

```
apps/
├─ web/         Next.js App Router UI
└─ api/         GraphQL Yoga + Pothos service
packages/
├─ db/          Prisma client + migrations
├─ ui/          shadcn components + theme
├─ validation/  Zod schemas (shared)
├─ graphql-schema/ Generated SDL + TS types
├─ config/      ESLint / Prettier / Tailwind preset
└─ types/       Shared domain types
docker/         Dockerfiles + Postgres init scripts
docs/           Architecture, contributing, runbook
```

## Documentation

- [Architecture](docs/architecture.md)
- [Contributing](docs/contributing.md)
- [Runbook](docs/runbook.md)
```

- [ ] **Step 2: Create `CLAUDE.md`**

```markdown
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
```

- [ ] **Step 3: Create `.env.example`**

```bash
# ─── Database ───────────────────────────────────────────
DATABASE_URL=postgres://fnb:fnb_dev@localhost:5432/fnb_control_pane

# ─── Auth.js ────────────────────────────────────────────
# Generate with: openssl rand -base64 32
AUTH_SECRET=replace-me-with-a-random-32-byte-base64-string
AUTH_URL=http://localhost:3000

# ─── Email (dev: MailHog) ───────────────────────────────
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="F&B Control Pane <noreply@example.com>"

# ─── Frontend ───────────────────────────────────────────
NEXT_PUBLIC_API_URL=http://localhost:4000/graphql
NEXT_PUBLIC_APP_URL=http://localhost:3000

# ─── API service ────────────────────────────────────────
API_PORT=4000
LOG_LEVEL=debug

# ─── Observability (optional) ───────────────────────────
SENTRY_DSN=
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_SERVICE_NAME=fnb-control-pane
```

- [ ] **Step 4: Create stub docs**

Create `docs/architecture.md`:

```markdown
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
```

Create `docs/contributing.md`:

```markdown
# Contributing

## Development

```bash
pnpm install
cp .env.example .env
pnpm dev          # starts docker-compose
pnpm db:migrate   # apply migrations
pnpm db:seed      # seed demo tenant
```

## Adding a resolver

1. Add types/inputs to `apps/api/src/schema/<domain>.ts`.
2. Declare `authScopes`. No exceptions.
3. Add Zod input validation in `packages/validation/src/<domain>.ts`.
4. Write at least one happy-path test and one forbidden-case test in
   `apps/api/src/schema/<domain>.test.ts`.
5. Run `pnpm --filter api test` and `pnpm --filter api typecheck`.

## Adding a UI component

1. If it's a primitive (button, input) → put it in `packages/ui/src/components/`.
2. If it's a composed product pattern (data table, empty state) → put it in
   `packages/ui/src/patterns/`.
3. If it's app-specific (admin form for inviting members) → put it in
   `apps/web/components/`.

## Commits

Conventional Commits. PRs require all CI checks green + 1 review.
```

Create `docs/runbook.md`:

```markdown
# Runbook

## Production deployment

The repo ships `docker-compose.yml` (dev) and `docker-compose.prod.yml`
(production overlay). Production Postgres is **externalized** — point
`DATABASE_URL` at a managed instance with backups (Neon, Supabase, RDS).

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Required environment variables (prod)

See `.env.example`. Required: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`,
`SMTP_*`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_APP_URL`.

## Backups

Postgres is your responsibility. Automated daily snapshots + point-in-time
recovery is the minimum bar.

## Logs

`api` and `web` log JSON to stdout (Pino). Aggregate with whatever you run —
Loki, Datadog, plain `docker logs`.

## Health checks

- `GET /health` on `api` returns `{ status, db, version }`.
- Web has no dedicated health endpoint; use the homepage 200 as a liveness probe.

## Common issues

| Symptom | First check |
|---|---|
| "Forbidden" on every request | Verify `X-Tenant-Slug` header reaches `api`; check Membership row exists |
| Sign-in succeeds but app shows tenant 404 | User has no Membership; create one or invite via UI |
| Subscriptions not delivering | Check SSE connection in browser devtools; verify Postgres `LISTEN/NOTIFY` working |
```

- [ ] **Step 5: Commit**

```bash
git add README.md CLAUDE.md .env.example docs/architecture.md docs/contributing.md docs/runbook.md
git commit -m "$(cat <<'EOF'
docs: add README, CLAUDE.md, env contract, and operational docs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Phase 2 — Database & Shared Packages

### Task 4: Docker Compose dev stack with Postgres + MailHog

**Files:**
- Create: `docker-compose.yml`
- Create: `docker/postgres-init/01-extensions.sql`
- Create: `docker/postgres-init/02-citext.sql`

- [ ] **Step 1: Create `docker/postgres-init/01-extensions.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

- [ ] **Step 2: Create `docker/postgres-init/02-citext.sql`**

```sql
CREATE EXTENSION IF NOT EXISTS citext;
```

- [ ] **Step 3: Create `docker-compose.yml`**

```yaml
services:
  db:
    image: postgres:16-alpine
    container_name: fnb_db
    restart: unless-stopped
    environment:
      POSTGRES_USER: fnb
      POSTGRES_PASSWORD: fnb_dev
      POSTGRES_DB: fnb_control_pane
    ports:
      - "5432:5432"
    volumes:
      - db_data:/var/lib/postgresql/data
      - ./docker/postgres-init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "fnb", "-d", "fnb_control_pane"]
      interval: 5s
      timeout: 5s
      retries: 10

  mailhog:
    image: mailhog/mailhog:latest
    container_name: fnb_mailhog
    restart: unless-stopped
    ports:
      - "1025:1025"  # SMTP
      - "8025:8025"  # Web UI

  api:
    build:
      context: .
      dockerfile: docker/api.Dockerfile
      target: dev
    container_name: fnb_api
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://fnb:fnb_dev@db:5432/fnb_control_pane
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_URL: ${AUTH_URL:-http://localhost:3000}
      SMTP_HOST: mailhog
      SMTP_PORT: "1025"
      EMAIL_FROM: ${EMAIL_FROM:-noreply@example.com}
      NODE_ENV: development
      LOG_LEVEL: debug
      API_PORT: "4000"
    ports:
      - "4000:4000"
    volumes:
      - ./apps/api:/app/apps/api
      - ./packages:/app/packages
      - /app/node_modules
      - /app/apps/api/node_modules
    depends_on:
      db:
        condition: service_healthy
    command: pnpm --filter api dev

  web:
    build:
      context: .
      dockerfile: docker/web.Dockerfile
      target: dev
    container_name: fnb_web
    restart: unless-stopped
    environment:
      DATABASE_URL: postgres://fnb:fnb_dev@db:5432/fnb_control_pane
      AUTH_SECRET: ${AUTH_SECRET}
      AUTH_URL: ${AUTH_URL:-http://localhost:3000}
      NEXT_PUBLIC_API_URL: http://api:4000/graphql
      NEXT_PUBLIC_APP_URL: http://localhost:3000
      INTERNAL_API_URL: http://api:4000/graphql
      SMTP_HOST: mailhog
      SMTP_PORT: "1025"
      EMAIL_FROM: ${EMAIL_FROM:-noreply@example.com}
      NODE_ENV: development
    ports:
      - "3000:3000"
    volumes:
      - ./apps/web:/app/apps/web
      - ./packages:/app/packages
      - /app/node_modules
      - /app/apps/web/node_modules
      - /app/apps/web/.next
    depends_on:
      - api
    command: pnpm --filter web dev

volumes:
  db_data:
```

- [ ] **Step 4: Verify compose file syntax**

```bash
docker compose config > /dev/null
```

Expected: no output (valid). If this fails because Dockerfiles do not exist yet, that's OK — Compose validates the file but does not require build contexts to exist for `config`. If Compose complains about missing Dockerfiles, comment out the `api` and `web` services temporarily and uncomment in Task 12 / Task 16.

- [ ] **Step 5: Verify Postgres + MailHog start**

```bash
docker compose up -d db mailhog
docker compose ps
docker compose exec db psql -U fnb -d fnb_control_pane -c "SELECT extname FROM pg_extension;"
```

Expected: `pgcrypto`, `pg_trgm`, `citext`, plus `plpgsql`. MailHog UI reachable at http://localhost:8025.

- [ ] **Step 6: Stop the stack**

```bash
docker compose down
```

- [ ] **Step 7: Commit**

```bash
git add docker-compose.yml docker/postgres-init/
git commit -m "$(cat <<'EOF'
feat(infra): add docker-compose dev stack with Postgres + MailHog

Postgres 16 with pgcrypto, citext, pg_trgm extensions enabled at boot.
MailHog captures dev emails. api/web services declared but their
Dockerfiles land in later tasks.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Prisma database package with Foundation schema

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/prisma/schema.prisma`
- Create: `packages/db/src/index.ts`
- Create: `packages/db/src/seed.ts`

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@repo/db",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./client": "./src/index.ts"
  },
  "scripts": {
    "generate": "prisma generate",
    "migrate": "prisma migrate dev",
    "migrate:deploy": "prisma migrate deploy",
    "reset": "prisma migrate reset --force",
    "seed": "tsx src/seed.ts",
    "studio": "prisma studio",
    "typecheck": "tsc --noEmit"
  },
  "prisma": {
    "schema": "prisma/schema.prisma"
  },
  "dependencies": {
    "@prisma/client": "^6.1.0"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@types/node": "^22.10.2",
    "prisma": "^6.1.0",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "@repo/config/tsconfig",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/db/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}

datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")
  extensions = [pgcrypto, citext, pg_trgm]
}

// ─── Tenancy ───────────────────────────────────────────
model Tenant {
  id          String       @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name        String
  slug        String       @unique
  status      TenantStatus @default(ACTIVE)
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  locations   Location[]
  memberships Membership[]
  invitations Invitation[]
  auditLogs   AuditLog[]

  @@map("tenants")
}

model Location {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String         @map("tenant_id") @db.Uuid
  name              String
  slug              String
  timezone          String
  currency          String         @db.Char(3)
  locale            String         @default("en-US")
  address           Json?
  status            LocationStatus @default(ACTIVE)
  businessDayCutoff String         @default("04:00") @map("business_day_cutoff")
  createdAt         DateTime       @default(now()) @map("created_at")
  updatedAt         DateTime       @updatedAt @map("updated_at")

  tenant      Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  memberships Membership[]
  invitations Invitation[]

  @@unique([tenantId, slug])
  @@index([tenantId])
  @@map("locations")
}

// ─── Identity (Auth.js managed tables alongside our User) ──────
model User {
  id            String     @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  email         String     @unique @db.Citext
  emailVerified DateTime?  @map("email_verified")
  name          String?
  image         String?
  passwordHash  String?    @map("password_hash")
  mfaEnabled    Boolean    @default(false) @map("mfa_enabled")
  mfaSecret     String?    @map("mfa_secret")
  status        UserStatus @default(ACTIVE)
  createdAt     DateTime   @default(now()) @map("created_at")
  updatedAt     DateTime   @updatedAt @map("updated_at")

  accounts    Account[]
  sessions    Session[]
  memberships Membership[]
  invitations Invitation[] @relation("InvitedByUser")

  @@map("users")
}

model Account {
  id                String  @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId            String  @map("user_id") @db.Uuid
  type              String
  provider          String
  providerAccountId String  @map("provider_account_id")
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@map("accounts")
}

model Session {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  sessionToken String   @unique @map("session_token")
  userId       String   @map("user_id") @db.Uuid
  expires      DateTime

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("sessions")
}

model VerificationToken {
  identifier String
  token      String   @unique
  expires    DateTime

  @@unique([identifier, token])
  @@map("verification_tokens")
}

// ─── RBAC: User × Tenant × Location with role ──────────
model Membership {
  id         String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  userId     String           @map("user_id") @db.Uuid
  tenantId   String           @map("tenant_id") @db.Uuid
  locationId String?          @map("location_id") @db.Uuid
  role       Role
  status     MembershipStatus @default(ACTIVE)
  createdAt  DateTime         @default(now()) @map("created_at")

  user     User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant   Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location Location? @relation(fields: [locationId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId, locationId])
  @@index([tenantId, locationId])
  @@index([userId])
  @@map("memberships")
}

model Invitation {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String    @map("tenant_id") @db.Uuid
  locationId  String?   @map("location_id") @db.Uuid
  email       String    @db.Citext
  role        Role
  tokenHash   String    @unique @map("token_hash")
  invitedById String    @map("invited_by_id") @db.Uuid
  expiresAt   DateTime  @map("expires_at")
  acceptedAt  DateTime? @map("accepted_at")
  createdAt   DateTime  @default(now()) @map("created_at")

  tenant    Tenant    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  location  Location? @relation(fields: [locationId], references: [id], onDelete: Cascade)
  invitedBy User      @relation("InvitedByUser", fields: [invitedById], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([email])
  @@map("invitations")
}

// ─── Audit trail ─────────────────────────────────────
model AuditLog {
  id           String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId     String   @map("tenant_id") @db.Uuid
  locationId   String?  @map("location_id") @db.Uuid
  actorUserId  String?  @map("actor_user_id") @db.Uuid
  action       String
  resourceType String   @map("resource_type")
  resourceId   String?  @map("resource_id")
  metadata     Json?
  createdAt    DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId, createdAt])
  @@index([resourceType, resourceId])
  @@map("audit_logs")
}

// ─── Enums ───────────────────────────────────────────
enum Role {
  OWNER
  ADMIN
  MANAGER
  STAFF
  VIEWER
}

enum TenantStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

enum LocationStatus {
  ACTIVE
  CLOSED
  ARCHIVED
}

enum UserStatus {
  ACTIVE
  DISABLED
}

enum MembershipStatus {
  ACTIVE
  REVOKED
}
```

- [ ] **Step 4: Create `packages/db/src/index.ts`**

```ts
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
export type { Prisma } from '@prisma/client';
```

- [ ] **Step 5: Create `packages/db/src/seed.ts`**

```ts
import { randomBytes, scryptSync } from 'node:crypto';
import { prisma } from './index.js';

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

async function main() {
  console.warn('Seeding demo tenant...');

  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme' },
    update: {},
    create: {
      name: 'Acme Restaurant Group',
      slug: 'acme',
    },
  });

  const location = await prisma.location.upsert({
    where: { tenantId_slug: { tenantId: tenant.id, slug: 'mission-st' } },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Acme — Mission St',
      slug: 'mission-st',
      timezone: 'America/Los_Angeles',
      currency: 'USD',
      locale: 'en-US',
    },
  });

  const ownerEmail = 'owner@acme.test';
  const ownerPassword = 'Password123!';

  const owner = await prisma.user.upsert({
    where: { email: ownerEmail },
    update: {},
    create: {
      email: ownerEmail,
      name: 'Acme Owner',
      passwordHash: hashPassword(ownerPassword),
      emailVerified: new Date(),
    },
  });

  await prisma.membership.upsert({
    where: {
      userId_tenantId_locationId: {
        userId: owner.id,
        tenantId: tenant.id,
        locationId: null as unknown as string,
      },
    },
    update: {},
    create: {
      userId: owner.id,
      tenantId: tenant.id,
      role: 'OWNER',
    },
  });

  console.warn('\n=== Demo credentials ===');
  console.warn(`Tenant slug:  ${tenant.slug}`);
  console.warn(`Location:     ${location.slug}`);
  console.warn(`Email:        ${ownerEmail}`);
  console.warn(`Password:     ${ownerPassword}`);
  console.warn('========================\n');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

> **Note for executor:** the `userId_tenantId_locationId` unique constraint
> includes a nullable `locationId`. Postgres treats NULLs as distinct in unique
> constraints, so the upsert with `locationId: null` will not actually upsert
> by primary key — it always inserts. For a seed this is fine (it runs once on
> a fresh DB); the membership creation in production code must check first.

- [ ] **Step 6: Install and generate**

```bash
pnpm install
docker compose up -d db
pnpm --filter @repo/db generate
pnpm --filter @repo/db migrate -- --name init
```

Expected: `prisma/migrations/<timestamp>_init/` directory created with SQL. Tables exist in Postgres.

- [ ] **Step 7: Run seed and verify**

```bash
DATABASE_URL=postgres://fnb:fnb_dev@localhost:5432/fnb_control_pane pnpm --filter @repo/db seed
```

Expected: "Demo credentials" block printed. `psql -U fnb -d fnb_control_pane -c "SELECT email FROM users;"` shows `owner@acme.test`.

- [ ] **Step 8: Commit**

```bash
git add packages/db pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(db): add @repo/db package with Prisma schema and seed

Foundation tables: Tenant, Location, User (+ Auth.js Account/Session/
VerificationToken), Membership, Invitation, AuditLog. UUIDs generated
by Postgres via pgcrypto. citext for emails. Seed creates demo Acme
tenant with single location and owner user.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Shared validation package (Zod schemas)

**Files:**
- Create: `packages/validation/package.json`
- Create: `packages/validation/tsconfig.json`
- Create: `packages/validation/src/index.ts`
- Create: `packages/validation/src/auth.ts`
- Create: `packages/validation/src/tenant.ts`
- Create: `packages/validation/src/location.ts`
- Create: `packages/validation/src/membership.ts`
- Create: `packages/validation/src/invitation.ts`
- Create: `packages/validation/src/auth.test.ts`

- [ ] **Step 1: Create `packages/validation/package.json`**

```json
{
  "name": "@repo/validation",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./auth": "./src/auth.ts",
    "./tenant": "./src/tenant.ts",
    "./location": "./src/location.ts",
    "./membership": "./src/membership.ts",
    "./invitation": "./src/invitation.ts"
  },
  "scripts": {
    "lint": "eslint src",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

- [ ] **Step 2: Create `packages/validation/tsconfig.json`**

```json
{
  "extends": "@repo/config/tsconfig",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Write failing test `packages/validation/src/auth.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { signInSchema, signUpSchema } from './auth.js';

describe('signInSchema', () => {
  it('accepts a valid email and password', () => {
    const result = signInSchema.safeParse({
      email: 'user@example.com',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid email', () => {
    const result = signInSchema.safeParse({
      email: 'not-an-email',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a password shorter than 8 chars', () => {
    const result = signInSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
    });
    expect(result.success).toBe(false);
  });
});

describe('signUpSchema', () => {
  it('requires invitation token, name, and password', () => {
    const result = signUpSchema.safeParse({
      token: 'a'.repeat(48),
      name: 'Alice',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects empty name', () => {
    const result = signUpSchema.safeParse({
      token: 'a'.repeat(48),
      name: '',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

```bash
pnpm --filter @repo/validation test
```

Expected: FAIL — `signInSchema` and `signUpSchema` not exported.

- [ ] **Step 5: Implement `packages/validation/src/auth.ts`**

```ts
import { z } from 'zod';

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password is too long');

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address');

export const signInSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export type SignInInput = z.infer<typeof signInSchema>;

export const signUpSchema = z.object({
  token: z.string().min(32),
  name: z.string().trim().min(1, 'Name is required').max(120),
  password: passwordSchema,
});

export type SignUpInput = z.infer<typeof signUpSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(32),
  password: passwordSchema,
});

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const mfaChallengeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export type MfaChallengeInput = z.infer<typeof mfaChallengeSchema>;
```

- [ ] **Step 6: Run test to verify it passes**

```bash
pnpm --filter @repo/validation test
```

Expected: PASS, all 5 tests.

- [ ] **Step 7: Implement remaining schemas**

Create `packages/validation/src/tenant.ts`:

```ts
import { z } from 'zod';

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, 'Slug must be lowercase alphanumeric with hyphens');

export const createTenantSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
});
export type CreateTenantInput = z.infer<typeof createTenantSchema>;

export const updateTenantSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
});
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;
```

Create `packages/validation/src/location.ts`:

```ts
import { z } from 'zod';
import { slugSchema } from './tenant.js';

export const isoCurrencySchema = z.string().length(3).regex(/^[A-Z]{3}$/);
export const ianaTimezoneSchema = z.string().min(1);
export const businessDayCutoffSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM 24-hour format');

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: slugSchema,
  timezone: ianaTimezoneSchema,
  currency: isoCurrencySchema,
  locale: z.string().min(2).max(10).default('en-US'),
  businessDayCutoff: businessDayCutoffSchema.default('04:00'),
  address: z
    .object({
      line1: z.string().trim().max(200).optional(),
      line2: z.string().trim().max(200).optional(),
      city: z.string().trim().max(100).optional(),
      region: z.string().trim().max(100).optional(),
      postalCode: z.string().trim().max(20).optional(),
      country: z.string().trim().length(2).optional(),
    })
    .optional(),
});
export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const updateLocationSchema = createLocationSchema.partial();
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;
```

Create `packages/validation/src/membership.ts`:

```ts
import { z } from 'zod';

export const roleSchema = z.enum(['OWNER', 'ADMIN', 'MANAGER', 'STAFF', 'VIEWER']);
export type RoleInput = z.infer<typeof roleSchema>;

export const updateMembershipRoleSchema = z.object({
  membershipId: z.string().uuid(),
  role: roleSchema,
});
export type UpdateMembershipRoleInput = z.infer<typeof updateMembershipRoleSchema>;

export const revokeMembershipSchema = z.object({
  membershipId: z.string().uuid(),
});
export type RevokeMembershipInput = z.infer<typeof revokeMembershipSchema>;
```

Create `packages/validation/src/invitation.ts`:

```ts
import { z } from 'zod';
import { emailSchema } from './auth.js';
import { roleSchema } from './membership.js';

export const inviteStaffSchema = z
  .object({
    email: emailSchema,
    role: roleSchema,
    locationId: z.string().uuid().nullable().default(null),
  })
  .refine(
    (data) => {
      // OWNER and ADMIN must be tenant-wide (locationId null)
      if ((data.role === 'OWNER' || data.role === 'ADMIN') && data.locationId !== null) {
        return false;
      }
      // MANAGER, STAFF must have a locationId
      if ((data.role === 'MANAGER' || data.role === 'STAFF') && data.locationId === null) {
        return false;
      }
      return true;
    },
    {
      message:
        'OWNER/ADMIN must not be scoped to a location; MANAGER/STAFF must be scoped to a location.',
      path: ['locationId'],
    },
  );
export type InviteStaffInput = z.infer<typeof inviteStaffSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(32),
  name: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
});
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
```

Create `packages/validation/src/index.ts`:

```ts
export * from './auth.js';
export * from './tenant.js';
export * from './location.js';
export * from './membership.js';
export * from './invitation.js';
```

- [ ] **Step 8: Run tests + typecheck**

```bash
pnpm --filter @repo/validation test
pnpm --filter @repo/validation typecheck
```

Expected: all tests pass; no type errors.

- [ ] **Step 9: Commit**

```bash
git add packages/validation pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(validation): add @repo/validation package with Zod schemas

Auth, tenant, location, membership, invitation schemas. Single source
of truth shared between Pothos input types and React Hook Form.
Cross-field rule: OWNER/ADMIN must be tenant-wide; MANAGER/STAFF must
be location-scoped.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: UI package — Tailwind, theme tokens, shadcn primitives

**Files:**
- Create: `packages/ui/package.json`
- Create: `packages/ui/tsconfig.json`
- Create: `packages/ui/tailwind.config.ts`
- Create: `packages/ui/postcss.config.cjs`
- Create: `packages/ui/src/index.ts`
- Create: `packages/ui/src/lib/cn.ts`
- Create: `packages/ui/src/theme/globals.css`
- Create: `packages/ui/src/theme/tokens.ts`
- Create: `packages/ui/src/components/button.tsx`
- Create: `packages/ui/src/components/input.tsx`
- Create: `packages/ui/src/components/label.tsx`
- Create: `packages/ui/src/components/form.tsx`
- Create: `packages/ui/src/components/dialog.tsx`
- Create: `packages/ui/src/components/dropdown-menu.tsx`
- Create: `packages/ui/src/components/sonner.tsx`
- Create: `packages/ui/src/components/table.tsx`
- Create: `packages/ui/src/components/command.tsx`
- Create: `packages/ui/src/components/card.tsx`
- Create: `packages/ui/src/components/select.tsx`
- Create: `packages/ui/src/components/sheet.tsx`
- Create: `packages/ui/src/patterns/empty-state.tsx`
- Create: `packages/ui/src/patterns/data-table.tsx`

- [ ] **Step 1: Create `packages/ui/package.json`**

```json
{
  "name": "@repo/ui",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./styles": "./src/theme/globals.css",
    "./tailwind": "./tailwind.config.ts",
    "./components/*": "./src/components/*.tsx",
    "./patterns/*": "./src/patterns/*.tsx",
    "./lib/cn": "./src/lib/cn.ts",
    "./theme/tokens": "./src/theme/tokens.ts"
  },
  "scripts": {
    "lint": "eslint src",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@radix-ui/react-dialog": "^1.1.4",
    "@radix-ui/react-dropdown-menu": "^2.1.4",
    "@radix-ui/react-label": "^2.1.1",
    "@radix-ui/react-select": "^2.1.4",
    "@radix-ui/react-slot": "^1.1.1",
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "cmdk": "^1.0.4",
    "lucide-react": "^0.468.0",
    "react-hook-form": "^7.54.2",
    "@hookform/resolvers": "^3.9.1",
    "sonner": "^1.7.1",
    "tailwind-merge": "^2.5.5",
    "tailwindcss-animate": "^1.0.7"
  },
  "peerDependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^3.4.17",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@repo/config": "workspace:*",
    "@types/react": "^19.0.2",
    "@types/react-dom": "^19.0.2",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "^5.7.2",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.1"
  }
}
```

- [ ] **Step 2: Create `packages/ui/tsconfig.json`**

```json
{
  "extends": "@repo/config/tsconfig",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "preserve",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "types": ["react", "react-dom"]
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "tailwind.config.ts"]
}
```

- [ ] **Step 3: Create `packages/ui/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';
import preset from '@repo/config/tailwind';

const config: Config = {
  presets: [preset as Config],
  content: ['./src/**/*.{ts,tsx}'],
  plugins: [animate],
};

export default config;
```

- [ ] **Step 4: Create `packages/ui/postcss.config.cjs`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 5: Create `packages/ui/src/lib/cn.ts`**

```ts
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
```

- [ ] **Step 6: Create `packages/ui/src/theme/tokens.ts`**

```ts
export const tokens = {
  radius: '0.5rem',
  light: {
    'color-bg-canvas': '0.99 0 0',
    'color-bg-surface': '1 0 0',
    'color-bg-muted': '0.97 0 0',
    'color-fg-default': '0.18 0.005 285',
    'color-fg-muted': '0.50 0.01 285',
    'color-border': '0.92 0.005 285',
    'color-input': '0.92 0.005 285',
    'color-ring': '0.55 0.18 265',
    'color-accent-default': '0.55 0.18 265',
    'color-accent-fg': '0.99 0 0',
    'color-accent-emphasis': '0.45 0.20 265',
    'color-danger-default': '0.58 0.22 27',
    'color-danger-fg': '0.99 0 0',
    'color-success-default': '0.62 0.16 145',
    'color-success-fg': '0.99 0 0',
  },
  dark: {
    'color-bg-canvas': '0.14 0.005 285',
    'color-bg-surface': '0.18 0.005 285',
    'color-bg-muted': '0.22 0.005 285',
    'color-fg-default': '0.97 0 0',
    'color-fg-muted': '0.65 0.01 285',
    'color-border': '0.27 0.005 285',
    'color-input': '0.27 0.005 285',
    'color-ring': '0.65 0.18 265',
    'color-accent-default': '0.70 0.18 265',
    'color-accent-fg': '0.14 0.005 285',
    'color-accent-emphasis': '0.78 0.18 265',
    'color-danger-default': '0.65 0.22 27',
    'color-danger-fg': '0.99 0 0',
    'color-success-default': '0.70 0.16 145',
    'color-success-fg': '0.14 0.005 285',
  },
} as const;
```

- [ ] **Step 7: Create `packages/ui/src/theme/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --radius: 0.5rem;
    --color-bg-canvas: 0.99 0 0;
    --color-bg-surface: 1 0 0;
    --color-bg-muted: 0.97 0 0;
    --color-fg-default: 0.18 0.005 285;
    --color-fg-muted: 0.50 0.01 285;
    --color-border: 0.92 0.005 285;
    --color-input: 0.92 0.005 285;
    --color-ring: 0.55 0.18 265;
    --color-accent-default: 0.55 0.18 265;
    --color-accent-fg: 0.99 0 0;
    --color-accent-emphasis: 0.45 0.20 265;
    --color-danger-default: 0.58 0.22 27;
    --color-danger-fg: 0.99 0 0;
    --color-success-default: 0.62 0.16 145;
    --color-success-fg: 0.99 0 0;
  }

  .dark {
    --color-bg-canvas: 0.14 0.005 285;
    --color-bg-surface: 0.18 0.005 285;
    --color-bg-muted: 0.22 0.005 285;
    --color-fg-default: 0.97 0 0;
    --color-fg-muted: 0.65 0.01 285;
    --color-border: 0.27 0.005 285;
    --color-input: 0.27 0.005 285;
    --color-ring: 0.65 0.18 265;
    --color-accent-default: 0.70 0.18 265;
    --color-accent-fg: 0.14 0.005 285;
    --color-accent-emphasis: 0.78 0.18 265;
    --color-danger-default: 0.65 0.22 27;
    --color-danger-fg: 0.99 0 0;
    --color-success-default: 0.70 0.16 145;
    --color-success-fg: 0.14 0.005 285;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-feature-settings: 'cv02', 'cv03', 'cv04', 'cv11';
  }

  .tabular-nums {
    font-variant-numeric: tabular-nums;
  }
}
```

- [ ] **Step 8: Create core shadcn-style components**

`packages/ui/src/components/button.tsx`:

```tsx
import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-accent text-accent-foreground hover:bg-accent/90',
        destructive: 'bg-danger text-danger-foreground hover:bg-danger/90',
        outline: 'border border-input bg-surface hover:bg-muted',
        secondary: 'bg-muted text-foreground hover:bg-muted/80',
        ghost: 'hover:bg-muted',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-6',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
```

`packages/ui/src/components/input.tsx`:

```tsx
import * as React from 'react';
import { cn } from '../lib/cn.js';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex h-9 w-full rounded-md border border-input bg-surface px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
```

`packages/ui/src/components/label.tsx`:

```tsx
import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../lib/cn.js';

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn('text-sm font-medium leading-none peer-disabled:opacity-70', className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;
```

`packages/ui/src/components/card.tsx`:

```tsx
import * as React from 'react';
import { cn } from '../lib/cn.js';

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('rounded-lg border bg-surface text-foreground shadow-sm', className)}
      {...props}
    />
  ),
);
Card.displayName = 'Card';

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

export const CardTitle = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('font-semibold leading-none tracking-tight', className)} {...props} />
  ),
);
CardTitle.displayName = 'CardTitle';

export const CardDescription = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />,
);
CardContent.displayName = 'CardContent';

export const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';
```

For the remaining shadcn components (`dialog`, `dropdown-menu`, `sonner`, `table`, `command`, `select`, `sheet`, `form`), use the canonical shadcn/ui v0.x source from https://ui.shadcn.com/docs/components/<name> and adapt the imports to use `../lib/cn.js` instead of `@/lib/utils`. The components are stable upstream — copy verbatim.

For `form.tsx`, copy from https://ui.shadcn.com/docs/components/form (it depends on `react-hook-form`, already in deps).

- [ ] **Step 9: Create patterns**

`packages/ui/src/patterns/empty-state.tsx`:

```tsx
import * as React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed py-16 px-8 text-center',
        className,
      )}
    >
      {Icon ? <Icon className="h-12 w-12 text-muted-foreground" /> : null}
      <h3 className="mt-4 text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
```

`packages/ui/src/patterns/data-table.tsx`:

```tsx
import type * as React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/table.js';
import { EmptyState } from './empty-state.js';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey: (row: T) => string;
}

export function DataTable<T>({
  columns,
  rows,
  emptyTitle = 'Nothing here yet',
  emptyDescription,
  rowKey,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((c) => (
              <TableHead key={c.key} className={c.className}>
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={rowKey(row)}>
              {columns.map((c) => (
                <TableCell key={c.key} className={c.className}>
                  {c.cell(row)}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

- [ ] **Step 10: Create `packages/ui/src/index.ts`**

```ts
export { cn } from './lib/cn.js';
export * from './components/button.js';
export * from './components/input.js';
export * from './components/label.js';
export * from './components/card.js';
export * from './components/dialog.js';
export * from './components/dropdown-menu.js';
export * from './components/sonner.js';
export * from './components/table.js';
export * from './components/command.js';
export * from './components/select.js';
export * from './components/sheet.js';
export * from './components/form.js';
export * from './patterns/empty-state.js';
export * from './patterns/data-table.js';
```

- [ ] **Step 11: Verify**

```bash
pnpm install
pnpm --filter @repo/ui typecheck
```

Expected: no type errors.

- [ ] **Step 12: Commit**

```bash
git add packages/ui pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(ui): add @repo/ui package with theme tokens, shadcn primitives, patterns

Tailwind preset wired through @repo/config. OKLCH-based color tokens
for light/dark. Core shadcn components (Button, Input, Form, Dialog,
DropdownMenu, Table, Command, Select, Sheet, Sonner) plus EmptyState
and DataTable patterns.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

> **Continuation marker:** Tasks 8–26 appended in subsequent file edits. The remaining tasks are sketched below in compressed form so a subagent reading top-down has the full task list and can execute Phase 2 immediately while later phases are still being detailed.

## Compressed task index (Phases 3–5)

The full body for each task below will be inlined in subsequent edits to this file. Until then, **executing agents must pause after Task 7** and prompt the orchestrator to expand the next batch. The structure of each task follows the pattern established in Tasks 1–7.

### Phase 3 — API service

- **Task 8** — `apps/api` skeleton: package.json, tsconfig, vitest config, env validation (Zod), Pino logger, Prisma client wrapper, graceful shutdown.
- **Task 9** — Pothos schema builder (`apps/api/src/schema/builder.ts`): plugins (prisma, scope-auth, relay, dataloader, zod, errors, tracing); shared scalars (DateTime, JSON, UUID); error result types.
- **Task 10** — Auth.js session verification helper (`apps/api/src/auth.ts`): reads session cookie, queries Session table, returns `{ userId } | null`. Unit tests for token parsing.
- **Task 11** — Request context construction (`apps/api/src/context.ts`): combines auth helper + tenant slug header + location id header → `RequestContext`. Rejects when membership not found. Pino child logger bound. Integration test: anonymous request, authenticated-but-no-membership request, valid request.
- **Task 12** — Yoga + Fastify server bootstrap (`apps/api/src/server.ts`, `apps/api/src/health.ts`): `/graphql` endpoint with SSE plugin, `/health` returning `{ status, db, version }`, graceful shutdown on SIGTERM. Dockerfile (`docker/api.Dockerfile`) with deps/dev/build/prod stages. Smoke test: container builds, `/health` returns 200.
- **Task 13** — Tenant + Location GraphQL types and queries (`apps/api/src/schema/tenant.ts`, `apps/api/src/schema/location.ts`): object types via Pothos prisma plugin; queries `viewer.tenants`, `tenant.location(slug)`, `tenant.locations`, `location.bySlug`. RBAC: `authenticated` for read; only return tenants/locations the viewer has membership on.
- **Task 14** — User + Membership types and viewer queries (`apps/api/src/schema/user.ts`, `apps/api/src/schema/membership.ts`): `viewer { id email name memberships { tenant location role } }`, `tenant.members` listing, `membership.role` field-level scoped.
- **Task 15** — Mutations & email send (`apps/api/src/schema/invitation.ts`, `apps/api/src/schema/membership.ts`, `apps/api/src/email/`): `createLocation` (admin), `inviteStaff` (manager), `acceptInvitation` (anonymous + valid token), `revokeMembership` (admin), `updateMembershipRole` (admin), `removeLocation` (admin → soft delete). Nodemailer SMTP client, plain-text + HTML invitation email. Each mutation writes an `AuditLog` row.
- **Task 16** — Testcontainers integration test harness (`apps/api/src/test/`): `setupTestDb()` boots ephemeral Postgres, runs migrations, returns Prisma client + cleanup. Per-test transaction rollback. Tenant isolation regression test: create tenants A and B; userA cannot see tenantB data via any query/mutation. Forbidden-case tests for every mutation in Task 15.

### Phase 4 — Web app

- **Task 17** — `apps/web` skeleton: Next.js 15 App Router, package.json, tsconfig, tailwind config consuming `@repo/ui/tailwind`, root layout with theme provider + Inter/JetBrains Mono fonts, providers.tsx, env validation. Dockerfile (`docker/web.Dockerfile`).
- **Task 18** — Auth.js v5 setup (`apps/web/lib/auth.ts`, `apps/web/app/api/auth/[...nextauth]/route.ts`): Prisma adapter pointing at `@repo/db`, credentials provider that validates email+password against `User.passwordHash` (scrypt, matching seed format), session strategy = database, helpers `auth()`, `signIn()`, `signOut()`. Unit tests for password hash verifier.
- **Task 19** — `/api/graphql` proxy route (`apps/web/app/api/graphql/route.ts`): forwards POST + GET (for SSE) to `INTERNAL_API_URL`, attaches `X-User-Id` header derived from Auth.js session (so the api service trusts only the proxy), and forwards `X-Tenant-Slug` / `X-Location-Id` from client. Same-origin = no CORS; cookies stay first-party.
- **Task 20** — urql client + provider + codegen (`apps/web/lib/graphql/client.ts`, `apps/web/lib/graphql/provider.tsx`, `apps/web/codegen.ts`): client points at `/api/graphql`, exchange that injects tenant/location headers from React context (`TenantContext`), SSE subscription support. GraphQL Codegen config writes typed React hooks to `apps/web/lib/graphql/generated/`.
- **Task 21** — Auth pages: `(auth)/sign-in/page.tsx` (form using `signInSchema` + Auth.js `signIn('credentials')`), `(auth)/sign-up/[token]/page.tsx` (calls `acceptInvitation` mutation, then signs in), `(auth)/forgot-password/page.tsx` + `(auth)/reset-password/[token]/page.tsx` (request + complete flow), `(auth)/mfa/page.tsx` (challenge form). All use `@repo/ui` form components and `@repo/validation` schemas. Failing-then-passing component tests for sign-in form.
- **Task 22** — App shell: `(app)/layout.tsx` with sidebar + topbar, `LocationSwitcher` reading `viewer.tenants[].locations[]`, command palette skeleton (`cmdk`), root `/` redirect logic (chain owner → `/<tenantSlug>/overview`; location-scoped → `/<tenantSlug>/<locationSlug>`), `[tenantSlug]/layout.tsx` validates membership + sets tenant context, `[tenantSlug]/[locationSlug]/layout.tsx` validates location access + sets location context. Unauthorized redirect to `/sign-in?next=...`.
- **Task 23** — Admin pages: `admin/members/page.tsx` (DataTable of memberships, InviteMemberDialog, role change, revoke), `admin/locations/page.tsx` (DataTable + CreateLocationDialog), `admin/audit-log/page.tsx` (paginated DataTable from `auditLogs` query). Each uses generated urql hooks and `@repo/ui` components.

### Phase 5 — E2E, CI, prod

- **Task 24** — Playwright E2E (`apps/web/tests/e2e/`): `sign-in.spec.ts`, `invitation-acceptance.spec.ts` (create invitation via api, fetch from MailHog, follow link, set password, sign in), `tenant-isolation.spec.ts` (seed two tenants, verify userA cannot view tenantB pages or data). `playwright.config.ts` boots docker-compose stack.
- **Task 25** — GitHub Actions CI (`.github/workflows/ci.yml`): jobs for lint, typecheck, unit, integration (with Postgres service), build (Turbo remote cache), E2E (against built images), Docker push to GHCR on `main`. Renovate config (`renovate.json`) with weekly grouped PRs. PR title check via lightweight action.
- **Task 26** — Production overlay & docs: `docker-compose.prod.yml` (slim images, nginx reverse proxy, externalized DB, resource limits), `docker/nginx.conf`, expanded `docs/runbook.md`, full `docs/architecture.md` linking to spec, `docs/contributing.md` finalized. Final acceptance walkthrough: spin from clean checkout, follow README, verify all 7 acceptance criteria from Section 9 of the design doc.

---

## Self-review notes

- **Spec coverage**: every section of the design doc maps to at least one task. Sections 2 (architecture/repo) → Tasks 1–3. Section 3 (data model) → Task 5. Section 4 (gateway/auth context) → Tasks 8–16. Section 5 (frontend shell) → Tasks 17–23. Section 6 (Docker/deployment) → Tasks 4, 12, 17, 26. Section 7 (observability/testing/CI) → Tasks 8, 16, 24, 25. Section 8 (scope guard) honored throughout. Section 9 (acceptance criteria) verified in Task 26.
- **Placeholder sweep**: Tasks 8–26 are intentionally compressed pending expansion. Executors must pause after Task 7 for the orchestrator to inline the next batch with full code, exact test bodies, and exact commands.
- **Type consistency**: `Role`, `RequestContext`, `AuthContext`, schema field names (`viewer`, `tenant.location`, `inviteStaff`, etc.) are referenced consistently across the compressed task list and the design doc.
- **Scope**: each task produces an independently-committable, testable artifact. No cross-task dependencies that would force batched commits.

