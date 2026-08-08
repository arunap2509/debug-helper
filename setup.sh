#!/usr/bin/env bash
# One-command bootstrap for the whole work-helper stack:
#   1. dummy docker services (postgres, redis, wiremock, localstack, listener)
#   2. seeds a few demo redis keys
#   3. python backend (FastAPI) on :8000
#   4. Next.js frontend on :3000, installing Node via nvm first if missing
#
# Safe to re-run — it restarts the backend/frontend and reuses existing
# docker volumes, so data you've poked at survives between runs.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

log()  { printf "\033[1;34m[setup]\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33m[setup]\033[0m %s\n" "$1"; }
die()  { printf "\033[1;31m[setup]\033[0m %s\n" "$1" >&2; exit 1; }

stop_pid_tree() {
  local pid="$1"
  pkill -P "$pid" >/dev/null 2>&1 || true
  kill "$pid" >/dev/null 2>&1 || true
}

restart_if_running() {
  local pidfile="$1"
  if [ -f "$pidfile" ]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      stop_pid_tree "$pid"
    fi
    rm -f "$pidfile"
  fi
}

# ---------------------------------------------------------------------------
# 0. Prerequisites
# ---------------------------------------------------------------------------
command -v docker >/dev/null 2>&1 || die "Docker is required but wasn't found. Install Docker Desktop: https://docs.docker.com/get-docker/"
docker compose version >/dev/null 2>&1 || die "Docker Compose v2 is required (bundled with modern Docker Desktop)."
docker info >/dev/null 2>&1 || die "Docker daemon isn't running. Start Docker Desktop and re-run this script."

PYTHON_BIN="$(command -v python3 || true)"
[ -n "$PYTHON_BIN" ] || die "python3 is required but wasn't found. Install Python 3.10+ and re-run."
log "using $($PYTHON_BIN --version)"

if ! command -v node >/dev/null 2>&1; then
  warn "node not found — installing it via nvm (self-contained under ~/.nvm, no sudo)..."
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install --lts
  nvm use --lts
else
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true
fi
command -v node >/dev/null 2>&1 || die "node install failed — install Node.js 18+ manually and re-run."
log "using node $(node -v), npm $(npm -v)"

# ---------------------------------------------------------------------------
# 1. App Redis Container
# ---------------------------------------------------------------------------
log "starting app redis container..."
docker compose up -d

wait_healthy() {
  local name="$1" tries=60
  while [ "$tries" -gt 0 ]; do
    local status
    status="$(docker inspect --format '{{.State.Health.Status}}' "$name" 2>/dev/null || echo "unknown")"
    [ "$status" = "healthy" ] && return 0
    tries=$((tries - 1))
    sleep 2
  done
  die "$name did not become healthy in time — check 'docker logs $name'"
}
log "waiting for wh-app-redis to be healthy..."
wait_healthy "wh-app-redis"
log "app redis is healthy."

# ---------------------------------------------------------------------------
# 2. Backend (FastAPI)
# ---------------------------------------------------------------------------
log "setting up backend virtualenv..."
if [ ! -d backend/venv ]; then
  "$PYTHON_BIN" -m venv backend/venv
fi
backend/venv/bin/pip install --quiet -r backend/requirements.txt

restart_if_running "$RUN_DIR/backend.pid"
log "starting backend on http://localhost:8000 ..."
(
  cd backend
  nohup ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload \
    > "$RUN_DIR/backend.log" 2>&1 &
  echo $! > "$RUN_DIR/backend.pid"
)

# ---------------------------------------------------------------------------
# 3. Frontend (Next.js)
# ---------------------------------------------------------------------------
if [ ! -d frontend/node_modules ]; then
  log "installing frontend dependencies (first run only, can take a minute)..."
  (cd frontend && npm install --no-fund --no-audit)
fi

restart_if_running "$RUN_DIR/frontend.pid"
log "starting frontend on http://localhost:3000 ..."
(
  cd frontend
  nohup npm run dev -- -p 3000 > "$RUN_DIR/frontend.log" 2>&1 &
  echo $! > "$RUN_DIR/frontend.pid"
)

sleep 3
log "----------------------------------------------------------------------"
log "  UI          http://localhost:3000"
log "  API         http://localhost:8000  (interactive docs at /docs)"
log "  App Redis   localhost:6391   (internal cache & workflow storage)"
log "----------------------------------------------------------------------"
log "Logs: .run/backend.log, .run/frontend.log, or 'docker compose logs -f'"
log "Stop everything with: ./stop.sh"
