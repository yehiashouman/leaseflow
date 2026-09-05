#!/usr/bin/env bash
# Idempotent helper that creates missing local environment files, starts the
# full Docker Compose stack, applies migrations, seeds the demo administrator,
# waits for every service to report healthy, and prints the application URL
# and demo credentials. Used by `make demo`, `make demo-reset` and the
# Codespaces postCreateCommand.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

MODE="${1:-up}" # up | reset

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$1"; }
warn() { printf '\033[1;33mWARNING: %s\033[0m\n' "$1"; }

random_secret() {
  # Generate a secret that is guaranteed to be at least 64 alphanumeric
  # characters (comfortably over the 32-character minimum), regenerating
  # additional random bytes if filtering out non-alphanumeric characters
  # from the base64 encoding leaves the string too short.
  local secret=""
  while [ "${#secret}" -lt 64 ]; do
    secret="${secret}$(openssl rand -base64 96 2>/dev/null | tr -dc 'A-Za-z0-9')"
  done
  echo "${secret:0:64}"
}

# Detect the public Codespaces application/editor origins, if running in a
# Codespace. Empty when not applicable (e.g. local Docker Compose, CI).
codespaces_origins() {
  if [ -n "${CODESPACE_NAME:-}" ]; then
    local domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
    # The editor domain is not derivable from the port-forwarding domain by
    # convention (GitHub Enterprise instances may use unrelated domains), so
    # it is configured explicitly, defaulting to the public github.dev editor domain.
    local editor_domain="${GITHUB_CODESPACES_EDITOR_DOMAIN:-github.dev}"
    echo "https://${CODESPACE_NAME}-8080.${domain},https://${CODESPACE_NAME}.${editor_domain}"
  fi
}

ensure_env_files() {
  log "Checking local environment files"

  if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
  else
    echo ".env already exists, leaving it untouched"
  fi

  if [ ! -f api/.env ]; then
    cp api/.env.example api/.env
    echo "Created api/.env from api/.env.example"

    local access_secret refresh_secret cors_origins
    access_secret="$(random_secret)"
    refresh_secret="$(random_secret)"
    cors_origins="http://localhost:8080,http://127.0.0.1:8080"
    local codespaces
    codespaces="$(codespaces_origins)"
    [ -n "$codespaces" ] && cors_origins="${cors_origins},${codespaces}"

    # Portable in-place edit for both GNU and BSD/macOS sed.
    sedi() { sed -i.bak "$1" api/.env && rm -f api/.env.bak; }
    sedi "s#^JWT_ACCESS_SECRET=.*#JWT_ACCESS_SECRET=${access_secret}#"
    sedi "s#^JWT_REFRESH_SECRET=.*#JWT_REFRESH_SECRET=${refresh_secret}#"
    sedi "s#^CORS_ORIGINS=.*#CORS_ORIGINS=${cors_origins}#"
    if ! grep -q '^DEMO_MODE=' api/.env; then echo 'DEMO_MODE=true' >> api/.env; else sedi "s#^DEMO_MODE=.*#DEMO_MODE=true#"; fi

    echo "Generated development JWT secrets and CORS origins in api/.env (DEMO_MODE=true)"
  else
    echo "api/.env already exists, leaving it untouched"
    if [ -n "$(codespaces_origins)" ] && ! grep -q "app.github.dev\|github.dev" api/.env; then
      warn "api/.env exists but does not appear to include Codespaces CORS origins."
      warn "Codespaces origins are allowed automatically in development/test, so no edit is required."
    fi
  fi
}

wait_for_health() {
  log "Waiting for services to become healthy"
  local tries=0
  local max_tries=60
  while [ "$tries" -lt "$max_tries" ]; do
    local mysql_status api_status web_status
    mysql_status="$(docker compose ps --format '{{.Health}}' mysql 2>/dev/null || true)"
    api_status="$(docker compose ps --format '{{.Health}}' api 2>/dev/null || true)"
    web_status="$(curl -fsS -o /dev/null -w '%{http_code}' http://localhost:"${WEB_PORT:-8080}"/health 2>/dev/null || true)"
    if [ "$mysql_status" = "healthy" ] && [ "$api_status" = "healthy" ] && [ "$web_status" = "200" ]; then
      echo "All services are healthy."
      return 0
    fi
    tries=$((tries + 1))
    sleep 3
  done
  warn "Timed out waiting for services to report healthy; check 'docker compose logs' for details."
  return 1
}

print_summary() {
  # shellcheck disable=SC1091
  set -a; source api/.env 2>/dev/null || true; set +a
  local url="http://localhost:${WEB_PORT:-8080}"
  if [ -n "${CODESPACE_NAME:-}" ]; then
    local domain="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-app.github.dev}"
    url="https://${CODESPACE_NAME}-8080.${domain}"
  fi
  log "LeaseFlow is ready"
  echo "Application URL: ${url}"
  if [ "${DEMO_MODE:-false}" = "true" ]; then
    echo "Demo administrator email:    admin@leaseflow.local"
    echo "Demo administrator password: Admin123456!"
  fi
}

if [ "$MODE" = "reset" ]; then
  warn "This will DELETE all local LeaseFlow demo data (MySQL, Redis, MinIO volumes)."
  docker compose down -v --remove-orphans
fi

ensure_env_files

log "Building and starting Docker Compose"
docker compose up -d --build mysql redis minio

log "Running database migrations"
docker compose up --build migrate

log "Seeding the demo administrator (idempotent)"
docker compose up --build demo-seed

log "Starting API and web"
docker compose up -d --build api web

wait_for_health || true
print_summary
