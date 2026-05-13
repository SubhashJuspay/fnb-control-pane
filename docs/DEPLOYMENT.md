# Deployment plan — internal demo

**Scope:** put the Next.js web on Vercel so a small group of internal reviewers can poke at it. The API + Postgres run on your laptop, talked to over an `ngrok` tunnel. Not a production deployment.

> If your audience grows past "a few people inside the company," skip to **Outgrowing this setup** at the bottom.

---

## What lives where

```
  Browser ──▶ Vercel (Next.js)            (apps/web)
                 │
                 │ HTTPS
                 ▼
              ngrok ──▶ localhost:4000   fnb_api
                                          │
                                          │ Postgres protocol
                                          ▼
                                       Neon (cloud)   ← option B (recommended)
                                       OR
                                       fnb_db on your laptop, exposed via
                                       a second ngrok TCP tunnel ← option A

  Outbound from Vercel:
    SMTP — pick a real provider (Resend free tier is fine), MailHog can't
           be reached from Vercel.
```

Vercel's server-side has two outbound dependencies it cannot resolve on its own:

1. **The GraphQL API** — `INTERNAL_API_URL` is read by `serverFetch` and the `/api/graphql` proxy. Without it, sign-in still loads, but every server-rendered page errors out and `/api/graphql` returns 502.
2. **Postgres** — `Auth.js` Credentials provider verifies passwords with a direct `prisma.user.findUnique`. Without DB access from Vercel, `/sign-in` always rejects.

There is no way to run **both** API and DB on your laptop with a single free ngrok endpoint, so you have to pick one of three paths:

- **Option A** — two ngrok tunnels (paid plan).
- **Option B** — one ngrok tunnel + Neon free Postgres (recommended).
- **Option C** — one ngrok tunnel + refactor Auth.js to go through the API (cleanest, more code).

---

## Option B (recommended) — ngrok + Neon

### 1. Move the dev DB to Neon

```bash
# 1.1 Sign up at neon.tech (free) and create a project. Grab the connection string:
#     postgres://<user>:<pw>@<host>.neon.tech/<db>?sslmode=require

# 1.2 Update your local .env to point at Neon (from now on, local dev uses
#     the same DB the deployed Vercel app does).
sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=postgres://...neon.tech/...|" .env

# 1.3 Apply the schema + seed.
pnpm db:migrate
pnpm db:seed
pnpm db:seed:demo

# 1.4 Restart the local API so it picks up the new DATABASE_URL.
docker compose restart api
```

> If you'd rather keep the laptop's docker Postgres for local dev and use Neon only for the deployed env, set `DATABASE_URL` per-environment instead — but two sources of truth gets confusing fast.

### 2. ngrok the API

Free ngrok account, free tier:

```bash
brew install ngrok
ngrok config add-authtoken <your-token-from-ngrok.com>

# In one terminal — leave this running.
ngrok http 4000
# Copy the https URL it prints, e.g. https://abc123.ngrok-free.app
```

Validate from anywhere:

```bash
curl -s -X POST https://abc123.ngrok-free.app/graphql \
     -H 'content-type: application/json' \
     -d '{"query":"{__typename}"}'
# expect: {"data":{"__typename":"Query"}}
```

> Free tier URLs change on every restart. Pin one with the `--url` flag (paid feature) or accept that you'll update Vercel env vars when you rotate it.

### 3. Real SMTP (optional but flag-worthy)

Without this, invite + password-reset emails silently fail in the deployed env. Cheapest fix:

- Sign up for Resend (free tier — 100 emails/day, 1 verified sender).
- Set `SMTP_HOST=smtp.resend.com`, `SMTP_PORT=587`, `SMTP_USER=resend`, `SMTP_PASS=<api-key>`, `EMAIL_FROM="<verified sender>"`.
- If you skip this for the demo, just remember invites won't deliver — you'll have to seed users via `pnpm db:seed:demo`.

### 3.5. Refresh the GraphQL SDL snapshot before pushing

This trips up every Vercel deploy if you forget. The build runs `pnpm codegen` with **no live API** — it reads `apps/web/lib/graphql/schema.graphql` (the committed SDL snapshot) instead of introspecting `localhost:4000`. Every time you change the API schema you have to refresh that snapshot and commit it, otherwise the build fails on the changed fields.

```bash
# With the local API running:
docker compose up -d api
cd apps/web
CODEGEN_SCHEMA_URL=http://localhost:4000/graphql pnpm codegen
git add lib/graphql/schema.graphql lib/graphql/generated
git commit -m "chore(graphql): refresh schema snapshot"
```

`apps/web/codegen.ts` writes both the snapshot **and** the TypeScript types in one pass — so a successful local codegen run is what Vercel will read. If you skip this step, every new field on `OnlineOrderTracking`, `Ticket`, `Guest`, etc. blows up the prebuild.

### 4. Vercel project setup

In the Vercel dashboard:

| Field | Value |
|---|---|
| Framework preset | Next.js |
| Root directory | `apps/web` |
| Install command | `pnpm install` |
| Build command | (default) |
| Node version | 24.x |

#### Env vars (all environments)

| Key | Value |
|---|---|
| `DATABASE_URL` | Neon connection string with `?sslmode=require` |
| `AUTH_SECRET` | `openssl rand -base64 32` (don't reuse the dev one) |
| `AUTH_URL` | `https://<your-vercel-project>.vercel.app` |
| `INTERNAL_API_URL` | `https://abc123.ngrok-free.app/graphql` (your tunnel) |
| `NEXT_PUBLIC_API_URL` | `https://<your-vercel-project>.vercel.app/api/graphql` (the proxy on Vercel itself) |
| `NEXT_PUBLIC_APP_URL` | `https://<your-vercel-project>.vercel.app` |
| `SMTP_HOST` | (from §3 — leave blank to skip email) |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | (from §3) |
| `SMTP_PASS` | (from §3) |
| `EMAIL_FROM` | `"F&B <noreply@yourdomain.com>"` |

The Twilio vars stay unset — SMS becomes a no-op, which is what you want for a demo.

### 5. Deploy + smoke test

```bash
vercel --prod          # or push to a connected branch
```

Then:

```bash
URL=https://<your-vercel-project>.vercel.app

curl -s -o /dev/null -w "sign-in       %{http_code}\n" "$URL/sign-in"
curl -s -o /dev/null -w "public order  %{http_code}\n" "$URL/order/acme/mission-st"
curl -s -X POST "$URL/api/graphql" \
     -H 'content-type: application/json' \
     -d '{"query":"{__typename}"}'
```

All three should return 200 and the introspection should print `{"data":{"__typename":"Query"}}`. If GraphQL probes 502, your ngrok session has rotated — refresh the URL in Vercel env and redeploy (env-only change → no rebuild needed).

### 6. Hand it to reviewers

- Send them the Vercel URL + the demo accounts in `docs/DEMO-CREDENTIALS.md` (password `Password123!` for everyone).
- Tell them the site goes dark when your laptop sleeps. Or run `caffeinate -di &` while reviews are happening.

---

## Option A — two ngrok tunnels

Same as B, but skip §1 (Postgres stays in Rancher's docker volume) and instead:

```bash
# Terminal 1
ngrok http 4000

# Terminal 2 (needs ngrok Personal — $8/mo for multi-endpoint)
ngrok tcp 5434
```

Then in Vercel:

```
DATABASE_URL=postgres://fnb:fnb_dev@<tcp-tunnel-host>:<port>/fnb_control_pane
INTERNAL_API_URL=https://<http-tunnel-host>/graphql
```

Pros: nothing leaves your laptop. Cons: $8/mo, both tunnels rotate when reset, longer reconnect time.

---

## Option C — one tunnel, refactor Auth

If you want the cleanest single-tunnel setup without paying anyone, the right code change is to stop using Prisma directly in the Auth.js `Credentials.authorize` callback and instead call a new `signInWithPassword(email, password)` GraphQL mutation that runs on the API. After that:

- Vercel only needs `INTERNAL_API_URL` (no `DATABASE_URL`).
- Auth.js still issues JWTs; the rest of the auth flow is unchanged.

Estimated work: ~1 hour for the resolver + Auth.js callback rewrite + a unit test. Tell me if you want this and I'll knock it out.

---

## Outgrowing this setup

When any of these become true, walk away from "laptop as backend":

- Reviewers complain that the site is down a lot.
- You want to hand the URL to someone outside the company.
- Self-serve `/sign-up` lets randos create tenants.

The next step is the same `docker-compose.prod.yml` overlay this repo already ships, run on a $5–10/mo VPS (Hetzner, Fly.io, Railway). The web stays on Vercel; the compose stack moves to a real host.

---

## Daily-driver shortcuts

```bash
# Wake everything up (laptop just unlocked).
docker compose up -d
ngrok http 4000

# Tunnel rotated and Vercel started 502'ing — update env without redeploying.
vercel env rm INTERNAL_API_URL production
vercel env add INTERNAL_API_URL production   # paste the new URL
# Vercel picks it up on the next request; no rebuild needed.

# Let reviewers in for the next 4 hours without touching anything.
caffeinate -di -t 14400 &
```
