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

| Symptom                                   | First check                                                                       |
| ----------------------------------------- | --------------------------------------------------------------------------------- |
| "Forbidden" on every request              | Verify `X-Tenant-Slug` header reaches `api`; check Membership row exists          |
| Sign-in succeeds but app shows tenant 404 | User has no Membership; create one or invite via UI                               |
| Subscriptions not delivering              | Check SSE connection in browser devtools; verify Postgres `LISTEN/NOTIFY` working |
