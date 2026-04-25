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

## Deployment

Production runs the same `docker-compose.yml` plus
`docker-compose.prod.yml` overlay. Postgres is externalized — point
`DATABASE_URL` at a managed instance. Pin the GHCR image SHAs via the
`IMAGE_API` and `IMAGE_WEB` env vars before promoting:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
docker compose exec api node node_modules/.bin/prisma migrate deploy
```

See [`docs/runbook.md`](docs/runbook.md) for the full bootstrap, TLS,
backup, and incident-response procedures.

## Documentation

- [Architecture](docs/architecture.md)
- [Contributing](docs/contributing.md)
- [Runbook](docs/runbook.md)
