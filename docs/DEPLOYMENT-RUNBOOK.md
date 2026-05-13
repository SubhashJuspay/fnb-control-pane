# Deployment runbook (do these from your terminal)

The Vercel MCP plugin couldn't complete OAuth in this Claude session, so the deploy is being driven from your laptop. The full architecture + tradeoffs are in `DEPLOYMENT.md`; this file is just the commands, in order.

> Prereq: Node 24 active (`nvm use 24`), Rancher Desktop running, the local stack up (`pnpm stack:up`).

---

## 1. Install Vercel CLI + sign in

```bash
pnpm add -g vercel
vercel login          # opens a browser tab, log in to your Vercel account
```

## 2. Provision Neon Postgres (browser, ~2 min)

1. Go to https://console.neon.tech/, free signup.
2. Create a project (any name, region close to you).
3. Copy the **connection string with pooler** — looks like:
   ```
   postgresql://neondb_owner:npg_RTriZPL6e1kV@ep-round-art-ao3o5p9q.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

## 3. Migrate your local data to Neon

```bash
# Repo root.
NEON_URL='postgresql://neondb_owner:npg_RTriZPL6e1kV@ep-round-art-ao3o5p9q.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'

# Apply schema + seed.
DATABASE_URL="$NEON_URL" pnpm --filter @repo/db exec prisma migrate deploy
DATABASE_URL="$NEON_URL" pnpm --filter @repo/db seed
DATABASE_URL="$NEON_URL" pnpm --filter @repo/db seed:demo

# Switch local dev to use Neon too (optional, but simpler).
sed -i '' "s|^DATABASE_URL=.*|DATABASE_URL=$NEON_URL|" .env
docker compose restart api
```

Smoke check Neon is reachable + has data:

```bash
PGPASSWORD=$(echo "$NEON_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|') \
  psql "$NEON_URL" -c "SELECT count(*) FROM tenants;"
# expect: 2 (acme + bistro-marais)
```

## 4. Tunnel the API with ngrok

```bash
brew install ngrok
ngrok config add-authtoken <your-token-from-ngrok.com/your-authtoken>

# In a terminal that you'll leave running.
ngrok http 4000
```

Note the HTTPS URL it prints, e.g. `https://abc123.ngrok-free.app`. **This rotates on every restart of `ngrok` on the free tier — leave it up for the duration of the demo.**

Verify from anywhere:

```bash
curl -s -X POST https://abc123.ngrok-free.app/graphql \
     -H 'content-type: application/json' \
     -d '{"query":"{__typename}"}'
# expect: {"data":{"__typename":"Query"}}
```

## 5. Link the repo to a Vercel project

```bash
# Repo root.
vercel link
```

When it prompts:

| Question | Answer |
|---|---|
| Set up and deploy? | **Y** |
| Which scope? | (your personal Vercel account or team) |
| Link to existing project? | **N** (first time) |
| Project name? | `fnb-control-pane` (or whatever) |
| Code directory? | **`./apps/web`** |

This creates `.vercel/project.json` linking the local repo to the Vercel project. Don't commit that file — it's already in `.gitignore`.

## 6. Set environment variables

Easiest: use the dashboard (Vercel project → Settings → Environment Variables). Paste each row from the table below for **all three** environments (Development, Preview, Production).

Or via CLI:

```bash
# Replace these three values, then paste the whole block:
NEON_URL='postgres://...neon.tech/...?sslmode=require'
NGROK_URL='https://abc123.ngrok-free.app'
AUTH_SECRET="$(openssl rand -base64 32)"

# Vercel URL — fill in after first deploy if you don't know it yet.
VERCEL_URL='https://fnb-control-pane.vercel.app'

cd apps/web

# Use --environment=production for the production env (preview is default).
for ENV in development preview production; do
  echo "$NEON_URL"                             | vercel env add DATABASE_URL $ENV
  echo "$AUTH_SECRET"                          | vercel env add AUTH_SECRET $ENV
  echo "$VERCEL_URL"                           | vercel env add AUTH_URL $ENV
  echo "$NGROK_URL/graphql"                    | vercel env add INTERNAL_API_URL $ENV
  echo "$VERCEL_URL/api/graphql"               | vercel env add NEXT_PUBLIC_API_URL $ENV
  echo "$VERCEL_URL"                           | vercel env add NEXT_PUBLIC_APP_URL $ENV
  echo "noreply@example.com"                   | vercel env add EMAIL_FROM $ENV
done
```

> Skipping `SMTP_*` is fine for the internal demo — the email-on-submit branches in the API just log a warning when SMTP isn't configured. Add them later when you wire Resend.

## 7. First deploy

```bash
# Preview deploy first — proves the build works without affecting prod.
vercel
# After it finishes, follow the URL it prints to spot-check.

# Once happy, promote to production.
vercel --prod
```

## 8. Smoke checks against the live URL

Replace `URL=` with what `vercel --prod` printed:

```bash
URL=https://fnb-control-pane-<hash>.vercel.app

# 1. Web reachable.
curl -s -o /dev/null -w "sign-in           %{http_code}\n" "$URL/sign-in"

# 2. /api/graphql proxy reaches the laptop through ngrok.
curl -s -X POST "$URL/api/graphql" \
     -H 'content-type: application/json' \
     -d '{"query":"{__typename}"}'

# 3. Public order surface.
curl -s -o /dev/null -w "/order/acme/...   %{http_code}\n" \
     "$URL/order/acme/mission-st"

# 4. Public booking page.
curl -s -o /dev/null -w "/book/acme/...    %{http_code}\n" \
     "$URL/book/acme/mission-st"

# 5. Public sign-up.
curl -s -o /dev/null -w "/sign-up          %{http_code}\n" \
     "$URL/sign-up"
```

All five should return HTTP 200 and the introspection should print `{"data":{"__typename":"Query"}}`. If GraphQL fails:
- 502 / 504 → ngrok tunnel is down or rotated. Check `ngrok` is still running, copy the new URL into `INTERNAL_API_URL`, redeploy with `vercel --prod` (or just update the env via dashboard — Vercel auto-applies on next request, no rebuild needed).
- 401 / 403 → ngrok's interstitial warning page. Free tier ngrok shows a HTML page on first visit; the Next.js proxy will forward that to your browser. Add `ngrok-skip-browser-warning: true` header in `apps/web/app/api/graphql/route.ts` if this becomes a problem.

## 9. Test it as a reviewer

Sign in at `$URL/sign-in` with `owner@acme.test` / `Password123!`, walk through the customer-facing flows:

- `/order/acme/mission-st` → add Latte to cart → checkout → confirmation → tracking
- `/book/acme/mission-st` → request a table for tomorrow → confirmation card
- `/sign-up` → create a fresh tenant → land on the new dashboard

If sign-in itself fails with a 500, your `DATABASE_URL` env var is probably wrong — Vercel can't reach Neon. Check the Neon dashboard's "Connection Details" for the exact pooler URL.

---

## After-deploy hygiene

```bash
# Keep the laptop awake while reviewers are using it.
caffeinate -di -t 14400 &

# When the ngrok URL rotates, refresh the env without rebuilding:
cd apps/web
echo "$NEW_NGROK_URL/graphql" | vercel env add INTERNAL_API_URL production --force
```

The full deployment plan, alternative architectures, and "outgrowing this setup" thresholds are in `DEPLOYMENT.md`.
