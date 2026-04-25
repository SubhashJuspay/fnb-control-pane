# syntax=docker/dockerfile:1.7

# ── deps stage: install all workspace dependencies once ──────────────
FROM node:24-alpine AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/types/package.json packages/types/
COPY packages/ui/package.json packages/ui/
COPY packages/validation/package.json packages/validation/
RUN pnpm install --frozen-lockfile

# ── dev stage: source-mounted hot reload via tsx watch ───────────────
FROM deps AS dev
COPY . .
RUN pnpm --filter @repo/db exec prisma generate
EXPOSE 4000
CMD ["sh", "-c", "pnpm --filter @repo/db exec prisma generate && pnpm --filter @app/api dev"]

# ── build stage: compile with tsup, prune for production ─────────────
FROM deps AS build
COPY . .
RUN pnpm --filter @repo/db exec prisma generate
RUN pnpm --filter @app/api build
RUN pnpm --filter @app/api deploy --prod /out

# ── prod stage: minimal runtime image, non-root ──────────────────────
FROM node:24-alpine AS prod
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /out /app
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4000/health || exit 1
CMD ["node", "dist/server.js"]
