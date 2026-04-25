# Runbook

Operational guide for deploying, monitoring, and troubleshooting the F&B
Control Pane Foundation. Production runs the same `docker-compose.yml` as
dev, layered with the `docker-compose.prod.yml` overlay.

## Required environment variables

All values live in a host-side `.env` (or your secret store) and are read by
docker compose. The api service treats every variable below as required at
boot — it logs a Zod validation error and exits if anything is missing.

| Variable       | Service  | Description                                                                                |
| -------------- | -------- | ------------------------------------------------------------------------------------------ |
| `DATABASE_URL` | api      | Postgres connection string. Must point at a managed instance with backups in prod.         |
| `AUTH_SECRET`  | api, web | 32-byte base64 secret for Auth.js JWE encryption. Generate with `openssl rand -base64 32`. |
| `AUTH_URL`     | api, web | Public origin where the web app is served. Used for callback URLs in invitation emails.    |
| `SMTP_HOST`    | api      | SMTP server hostname. In dev this is `mailhog`; in prod use your provider (SES, Postmark). |
| `SMTP_PORT`    | api      | SMTP port. Typically 587 (STARTTLS) or 465 (TLS).                                          |
| `SMTP_USER`    | api      | SMTP username (omit for unauthenticated dev relays).                                       |
| `SMTP_PASS`    | api      | SMTP password.                                                                             |
| `EMAIL_FROM`   | api      | `From:` header on transactional emails. Format: `"Brand <noreply@example.com>"`.           |
| `LOG_LEVEL`    | api      | Pino log level. Use `info` in prod, `debug` only when actively diagnosing.                 |
| `IMAGE_API`    | overlay  | GHCR image tag for the api service. Pin to a specific SHA before promotion.                |
| `IMAGE_WEB`    | overlay  | GHCR image tag for the web service. Pin to a specific SHA before promotion.                |

The web container also expects:

- `NEXT_PUBLIC_API_URL` — public URL for the GraphQL endpoint (typically
  served via the web app's `/api/graphql` proxy, e.g. `https://app.example.com/api/graphql`).
- `NEXT_PUBLIC_APP_URL` — public origin where the web app is served.
- `INTERNAL_API_URL` — server-side URL the proxy forwards to. Inside docker
  compose this is `http://api:4000/graphql`.

## Provisioning Postgres

The platform requires Postgres 16 with `pgcrypto`, `citext`, and `pg_trgm`.
Recommended managed options:

- **Neon** — branchable, generous free tier, automatic PITR.
- **Supabase** — convenient if you also want their auth/storage features.
- **AWS RDS / GCP Cloud SQL** — pick when you need VPC peering, larger
  instances, or compliance certifications.

Self-hosted Postgres works too, but you own backups, replication, and patching.
Daily snapshots plus point-in-time recovery is the minimum bar.

## Initial bootstrap

1. **Pull container images.**

   ```bash
   docker pull ghcr.io/<org>/fnb-control-pane/api:<sha>
   docker pull ghcr.io/<org>/fnb-control-pane/web:<sha>
   ```

2. **Create `.env`** with the variables in the table above. Override the
   image tags so the overlay pins them:

   ```bash
   IMAGE_API=ghcr.io/<org>/fnb-control-pane/api:<sha>
   IMAGE_WEB=ghcr.io/<org>/fnb-control-pane/web:<sha>
   ```

3. **Provision TLS certs.** Drop `fullchain.pem` and `privkey.pem` in
   `docker/certs/`. We do **not** ship certbot inside the overlay — choose one:
   - Run certbot on the host in `--webroot` mode against the nginx container.
   - Replace the `nginx` service with a managed proxy (`jwilder/nginx-proxy`
     plus `acme-companion`, Caddy, or a load balancer that terminates TLS
     for you).

4. **Boot the stack.**

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

5. **Apply migrations and seed inside the api container.** (The api image
   ships the Prisma migration files.)

   ```bash
   docker compose exec api node node_modules/.bin/prisma migrate deploy
   docker compose exec api node dist/seed.js   # optional: only for greenfield demo data
   ```

6. **Verify health.**

   ```bash
   curl -fsS https://app.example.com/health        # via nginx → web → api
   curl -fsS http://localhost:4000/health          # direct, on the host network
   ```

   The api responds `{ "status": "ok", "db": "ok", "version": "..." }`.

## Backups

The application is stateless. **Postgres is the only thing you need to back
up.**

- Managed Postgres: enable automated daily snapshots and PITR. Test restores
  quarterly into a staging environment.
- Self-hosted: `pg_dumpall` to encrypted object storage on a cron, or
  WAL-G/`pgBackRest` for incremental + PITR. Verify by replaying weekly.

## Logs

Both services log structured JSON to stdout via Pino.

- Local: `docker compose logs -f api` / `docker compose logs -f web`.
- Loki: deploy Promtail or Grafana Alloy as a sidecar; ship `app=fnb-api` /
  `app=fnb-web` labels.
- Datadog: the official `dd-agent` autodiscovers JSON-stdout containers.
- Vector: a small `vector.toml` with a `docker_logs` source pointed at your
  preferred sink works fine.

Sensitive fields (passwords, invitation tokens) are never logged — Pino
serializers redact them. If you see one, file a bug.

## Common incidents

### Forbidden on every request

- Confirm the browser is sending `X-Tenant-Slug` (the web app's GraphQL
  proxy injects it from the URL). Use devtools → Network → request headers.
- Confirm a `Membership` row exists for the signed-in user in that tenant.
  `select * from "Membership" where "userId" = '...';`
- Verify the Auth.js session cookie is reaching api — the web proxy forwards
  `Cookie` plus `X-Tenant-Slug` and `X-Location-Id`. If the deployment splits
  origins, make sure cookies are not stripped by an upstream proxy.

### Sign-in succeeds but app shows tenant 404

The user authenticated but has no `Membership` for any tenant. Either:

- Have an existing owner invite them via `/<tenant>/admin/members`.
- Or, for the very first user of a tenant, insert the membership manually
  (`role = OWNER`, `locationId = NULL`).

### Subscriptions not delivering

Foundation runs GraphQL subscriptions over SSE.

- In browser devtools → Network, filter for `EventStream` and confirm a
  long-lived connection to `/api/graphql`.
- Verify nginx is **not** buffering the response. The shipped `nginx.conf`
  sets `proxy_buffering off` for `location /` — if you wrote your own,
  replicate that.
- Confirm Postgres `LISTEN/NOTIFY` works:
  `docker compose exec db psql -U fnb -d fnb_control_pane -c 'NOTIFY ping;'`.

### Emails not sending

- Tail api logs for `nodemailer` errors — they include the full SMTP
  conversation at `LOG_LEVEL=debug`.
- Verify `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and that the
  mail server allows the api's source IP.
- Check provider dashboards (SES, Postmark, etc.) for bounces and reputation
  warnings.

## Upgrading

1. Pull the new images and update `IMAGE_API` / `IMAGE_WEB` in `.env` to the
   new SHA.
2. Run migrations against the live DB:

   ```bash
   docker compose exec api node node_modules/.bin/prisma migrate deploy
   ```

3. Redeploy:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
   ```

4. Verify `/health` and a smoke flow (sign in, view a tenant page).

## Rolling back

Pin `IMAGE_API` and `IMAGE_WEB` back to the previous SHA tag, then re-run
the deploy command. Migrations are not auto-reversed — coordinate any
schema-incompatible rollbacks ahead of time, or roll forward with a
compensating migration.

## Performance knobs

- **API replicas.** The api is stateless. Scale with
  `docker compose up -d --scale api=3` and let nginx round-robin via the
  upstream block. Add more upstreams to `docker/nginx.conf` if you front
  the cluster differently.
- **Postgres pool.** Set `DATABASE_URL` query params, e.g.
  `?connection_limit=20&pool_timeout=10`. Prisma maps these to the
  underlying pool. Watch `pg_stat_activity` for pool exhaustion.
- **Web (Next standalone).** CPU-bound rendering benefits from horizontal
  scaling; memory ceiling is set in the overlay (512Mi). Bump if your
  traffic pattern justifies it.

## Health endpoints

- `GET /health` on the api returns `{ status, db, version }` and is wired
  into both the api container `HEALTHCHECK` and the prod overlay
  `healthcheck` block.
- The web app has no dedicated health endpoint; treat a `200 OK` on `/`
  as a liveness probe.
