# syntax=docker/dockerfile:1.7

# ── deps stage: install all workspace dependencies once ──────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

# ── dev stage: source-mounted hot reload via next dev ────────────────
FROM deps AS dev
COPY . .
RUN pnpm --filter @repo/db exec prisma generate
EXPOSE 3000
CMD ["sh", "-c", "pnpm --filter @repo/db exec prisma generate && pnpm --filter @app/web dev"]

# ── build stage: produce a Next standalone bundle ────────────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @repo/db exec prisma generate
RUN pnpm --filter @app/web build

# ── prod stage: minimal runtime image, non-root ──────────────────────
FROM node:24-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S app && adduser -S app -G app
# Next standalone output bundles only what the server needs.
COPY --from=build --chown=app:app /app/apps/web/.next/standalone /app
COPY --from=build --chown=app:app /app/apps/web/.next/static /app/apps/web/.next/static
COPY --from=build --chown=app:app /app/apps/web/public /app/apps/web/public
USER app
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3000/ || exit 1
CMD ["node", "apps/web/server.js"]
