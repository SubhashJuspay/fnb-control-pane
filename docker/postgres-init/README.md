Postgres entrypoint init scripts.

Currently empty. Required Postgres extensions (`pgcrypto`, `pg_trgm`,
`citext`) are installed by the first Prisma migration
(`packages/db/prisma/migrations/20260425072149_init/migration.sql`)
so that `pnpm db:migrate` works on a fresh DB without seeing drift.

If you need to add SQL that must run *before* migrations (very rarely),
drop a `*.sql` file here. It will execute once on first cluster
creation. Files run in alphabetical order.
