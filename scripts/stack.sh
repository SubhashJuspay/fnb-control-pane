#!/usr/bin/env bash
# One-stop stack manager for F&B Control Pane.
#
#   pnpm stack:up        bring everything up + migrate + seed (default)
#   pnpm stack:rebuild   rebuild images + recreate containers, keep data
#   pnpm stack:reset     wipe DB volume, rebuild, migrate, seed
#   pnpm stack:down      stop containers (keep data + images)
#   pnpm stack:status    show what's running + URLs
#   pnpm stack:logs      tail api+web logs
#
# Designed to be idempotent: re-running `up` is safe.

set -euo pipefail

# ─── Pretty output ──────────────────────────────────────────────────
if [ -t 1 ]; then
  BOLD='\033[1m'; DIM='\033[2m'; RED='\033[31m'; GREEN='\033[32m'
  YELLOW='\033[33m'; CYAN='\033[36m'; RESET='\033[0m'
else
  BOLD=''; DIM=''; RED=''; GREEN=''; YELLOW=''; CYAN=''; RESET=''
fi

step()  { printf "${CYAN}▸${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}✓${RESET} %s\n" "$*"; }
warn()  { printf "${YELLOW}!${RESET} %s\n" "$*"; }
die()   { printf "${RED}✗${RESET} %s\n" "$*" >&2; exit 1; }

# ─── Resolve repo root + cd there ───────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

# ─── Make sure docker CLI is reachable (Rancher Desktop ships it
#     under ~/.rd/bin which isn't always on PATH) ───────────────────
if ! command -v docker >/dev/null 2>&1; then
  if [ -x "$HOME/.rd/bin/docker" ]; then
    export PATH="$HOME/.rd/bin:$PATH"
  else
    die "docker not found on PATH. Install Docker / Rancher Desktop, or add ~/.rd/bin to PATH."
  fi
fi

# ─── First-time .env bootstrap ──────────────────────────────────────
ensure_env() {
  if [ ! -f .env ]; then
    if [ ! -f .env.example ]; then
      die ".env and .env.example both missing"
    fi
    step "No .env found — bootstrapping from .env.example"
    cp .env.example .env
    if command -v openssl >/dev/null 2>&1; then
      local secret
      secret="$(openssl rand -base64 32)"
      # BSD sed (mac) needs the empty '' for -i; GNU sed accepts it via ''.
      sed -i.bak "s|^AUTH_SECRET=.*|AUTH_SECRET=${secret}|" .env && rm -f .env.bak
    else
      warn "openssl not found — leaving AUTH_SECRET as the placeholder. Replace it manually in .env."
    fi
    # Postgres host port often clashes with another local DB. Default to
    # 5434 (matches docker-compose.override.yml), only update if 5432 is
    # currently in use.
    if lsof -nP -iTCP:5432 -sTCP:LISTEN >/dev/null 2>&1; then
      warn "Port 5432 is already in use on this host — pointing DATABASE_URL at 5434"
      sed -i.bak "s|@localhost:5432|@localhost:5434|" .env && rm -f .env.bak
    fi
    ok ".env created"
  fi
}

# ─── Load .env into this shell so Prisma sees DATABASE_URL etc ─────
load_env() {
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
}

# ─── Wait helpers ───────────────────────────────────────────────────
wait_for_db() {
  step "Waiting for Postgres to be healthy"
  local i
  for i in $(seq 1 60); do
    if docker exec fnb_db pg_isready -U fnb -d fnb_control_pane >/dev/null 2>&1; then
      ok "Postgres healthy ($((i * 1))s)"
      return 0
    fi
    sleep 1
  done
  die "Postgres did not become healthy within 60s"
}

wait_for_http() {
  local label="$1" url="$2" deadline=120 i
  step "Waiting for $label ($url)"
  for i in $(seq 1 "$deadline"); do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "$url" || echo 000)
    if [ "$code" = "200" ] || [ "$code" = "204" ]; then
      ok "$label ready in ${i}s"
      return 0
    fi
    sleep 1
  done
  die "$label not ready after ${deadline}s"
}

# ─── Subcommands ────────────────────────────────────────────────────

cmd_up() {
  ensure_env
  load_env

  step "docker compose up -d --build"
  docker compose up -d --build >/dev/null

  wait_for_db

  step "Applying Prisma migrations (pnpm db:migrate)"
  pnpm --silent db:migrate

  step "Loading dev + demo seed data"
  pnpm --silent db:seed
  pnpm --silent db:seed:demo

  wait_for_http "API"     "http://localhost:4000/graphql"
  wait_for_http "Web app" "http://localhost:3000/sign-in"

  print_summary
}

cmd_rebuild() {
  ensure_env
  load_env

  step "Rebuilding api + web images"
  docker compose build api web >/dev/null

  step "Recreating containers"
  docker compose up -d >/dev/null

  wait_for_db
  wait_for_http "API"     "http://localhost:4000/graphql"
  wait_for_http "Web app" "http://localhost:3000/sign-in"

  ok "Rebuilt — DB volume preserved, no migrations or seeds run."
  print_summary
}

cmd_reset() {
  load_env || true

  warn "This will DELETE the Postgres volume and all demo data."
  if [ "${ASSUME_YES:-}" != "1" ] && [ -t 0 ]; then
    read -r -p "Type 'yes' to continue: " confirm
    if [ "$confirm" != "yes" ]; then
      die "Aborted."
    fi
  fi

  step "docker compose down -v (drops the db volume)"
  docker compose down -v >/dev/null

  cmd_up
}

cmd_down() {
  step "docker compose down"
  docker compose down
  ok "Stopped. Data + images preserved."
}

cmd_status() {
  [ -f .env ] && load_env
  step "Container status"
  docker compose ps
  echo
  print_urls
}

cmd_logs() {
  exec docker compose logs -f --tail=80 api web
}

print_urls() {
  # Pull the host-side Postgres port out of DATABASE_URL: the segment between
  # the @host: and the trailing /db. Falls back to 5432 if .env hasn't loaded.
  local pg_port="${DATABASE_URL#*://*@*:}"
  pg_port="${pg_port%%/*}"
  : "${pg_port:=5432}"
  printf "${BOLD}URLs${RESET}\n"
  cat <<EOF
  Web app              http://localhost:3000/sign-in
  Public ordering      http://localhost:3000/order/acme/mission-st
  Public booking       http://localhost:3000/book/acme/mission-st
  Public tenant signup http://localhost:3000/sign-up
  GraphQL endpoint     http://localhost:4000/graphql
  MailHog inbox        http://localhost:8025
  Postgres host port   localhost:${pg_port}
EOF
}

print_summary() {
  echo
  printf "${BOLD}${GREEN}Stack is up.${RESET}\n\n"
  print_urls
  echo
  printf "${BOLD}Demo accounts${RESET} (password ${DIM}Password123!${RESET} for all):\n"
  cat <<EOF
  owner@acme.test            OWNER   tenant acme
  manager.mission@acme.test  MANAGER mission-st
  server.mission@acme.test   STAFF   mission-st
  cook.mission@acme.test     STAFF   mission-st
  owner@bistro.test          OWNER   tenant bistro-marais
EOF
  echo
  printf "${DIM}Full list: docs/DEMO-CREDENTIALS.md   Test plan: docs/TESTING-GUIDE.md${RESET}\n"
}

# ─── Dispatch ───────────────────────────────────────────────────────
case "${1:-up}" in
  up)       cmd_up ;;
  rebuild)  cmd_rebuild ;;
  reset)    cmd_reset ;;
  down)     cmd_down ;;
  status)   cmd_status ;;
  logs)     cmd_logs ;;
  *)        die "Unknown subcommand: $1. Try: up | rebuild | reset | down | status | logs" ;;
esac
