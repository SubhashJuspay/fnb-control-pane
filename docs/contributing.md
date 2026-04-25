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
