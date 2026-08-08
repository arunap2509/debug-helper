#!/usr/bin/env bash
# One-command bootstrap for the whole work-helper stack:
#   1. dummy docker services (postgres, redis, wiremock, localstack, listener)
#   2. seeds a few demo redis keys
#   3. python backend (FastAPI) on :8000
#   4. Next.js frontend on :3010, installing Node via nvm first if missing
#
# Safe to re-run — it restarts the backend/frontend and reuses existing
# docker volumes, so data you've poked at survives between runs.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

RUN_DIR="$ROOT_DIR/.run"
mkdir -p "$RUN_DIR"

BACKEND_PORT="${BACKEND_PORT:-8010}"
FRONTEND_PORT="${FRONTEND_PORT:-3010}"

log()  { printf "\033[1;34m[setup]\033[0m %s\n" "$1"; }
warn() { printf "\033[1;33m[setup]\033[0m %s\n" "$1"; }
die()  { printf "\033[1;31m[setup]\033[0m %s\n" "$1" >&2; exit 1; }

version_ge() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -n1)" = "$2" ]
}

python_version_ge() {
  local bin="$1"
  "$bin" -c 'import sys; raise SystemExit(0 if sys.version_info >= (3, 10) else 1)'
}

wait_for_http() {
  local name="$1" url="$2" tries="${3:-30}"
  while [ "$tries" -gt 0 ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    tries=$((tries - 1))
    sleep 1
  done
  return 1
}

assert_pid_alive() {
  local pidfile="$1" name="$2" logfile="$3"
  if [ ! -f "$pidfile" ]; then
    die "$name pid file was not created"
  fi

  local pid
  pid="$(cat "$pidfile")"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    warn "$name exited during startup; recent log output:"
    tail -n 40 "$logfile" >&2 || true
    die "$name failed to start"
  fi
}

stop_pid_tree() {
  local pid="$1"
  pkill -P "$pid" >/dev/null 2>&1 || true
  kill "$pid" >/dev/null 2>&1 || true
}

stop_listeners_on_port() {
  local port="$1"
  local pids
  pids="$(lsof -ti tcp:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  [ -n "$pids" ] || return 0

  warn "stopping existing listener(s) on port $port: $pids"
  for pid in $pids; do
    stop_pid_tree "$pid"
    kill "$pid" >/dev/null 2>&1 || true
  done
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
if ! python_version_ge "$PYTHON_BIN"; then
  if command -v pyenv >/dev/null 2>&1; then
    for candidate in 3.11 3.10; do
      if pyenv prefix "$candidate" >/dev/null 2>&1; then
        PYTHON_BIN="$(pyenv prefix "$candidate")/bin/python"
        break
      fi
    done
  fi
fi
python_version_ge "$PYTHON_BIN" || die "Python 3.10+ is required. Current interpreter is $($PYTHON_BIN --version 2>&1)."
log "using $($PYTHON_BIN --version)"

NODE_VERSION="$(node -v 2>/dev/null | sed 's/^v//' || true)"
if ! version_ge "$NODE_VERSION" "20.9.0"; then
  if [ -n "$NODE_VERSION" ]; then
    warn "node $NODE_VERSION is too old — Next.js requires Node 20.9.0+; switching via nvm..."
  else
    warn "node not found — installing it via nvm (self-contained under ~/.nvm, no sudo)..."
  fi
  export NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 20.19.0
  nvm use 20.19.0
else
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true
fi
command -v node >/dev/null 2>&1 || die "node install failed — install Node.js 20.9+ manually and re-run."
NODE_VERSION="$(node -v | sed 's/^v//')"
version_ge "$NODE_VERSION" "20.9.0" || die "Node.js 20.9+ is required. Current version is v$NODE_VERSION."
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
if [ -x backend/venv/bin/python ] && ! python_version_ge backend/venv/bin/python; then
  warn "backend virtualenv uses $(backend/venv/bin/python --version 2>&1); rebuilding it with $($PYTHON_BIN --version 2>&1)..."
  rm -rf backend/venv
fi
if [ ! -d backend/venv ]; then
  "$PYTHON_BIN" -m venv backend/venv
fi
backend/venv/bin/pip install --quiet -r backend/requirements.txt

restart_if_running "$RUN_DIR/backend.pid"
stop_listeners_on_port "$BACKEND_PORT"
log "starting backend on http://localhost:$BACKEND_PORT ..."
(
  cd backend
  nohup ./venv/bin/uvicorn app.main:app --host 0.0.0.0 --port "$BACKEND_PORT" --reload \
    > "$RUN_DIR/backend.log" 2>&1 &
  echo $! > "$RUN_DIR/backend.pid"
)
assert_pid_alive "$RUN_DIR/backend.pid" "backend" "$RUN_DIR/backend.log"
if ! wait_for_http "backend" "http://localhost:$BACKEND_PORT/api/health" 30; then
  warn "backend did not answer health checks; recent log output:"
  tail -n 40 "$RUN_DIR/backend.log" >&2 || true
  die "backend failed to become ready on http://localhost:$BACKEND_PORT"
fi

# ---------------------------------------------------------------------------
# 3. Frontend (Next.js)
# ---------------------------------------------------------------------------
if [ ! -d frontend/node_modules ] || ! (cd frontend && node -e "require('@tailwindcss/postcss')" >/dev/null 2>&1); then
  log "installing frontend dependencies (can take a minute if npm needs to repair optional packages)..."
  (cd frontend && npm install --no-fund --no-audit)
fi

restart_if_running "$RUN_DIR/frontend.pid"
stop_listeners_on_port "$FRONTEND_PORT"
log "starting frontend on http://localhost:$FRONTEND_PORT ..."
(
  cd frontend
  NEXT_PUBLIC_API_BASE="http://localhost:$BACKEND_PORT" \
    nohup npm run dev -- -p "$FRONTEND_PORT" > "$RUN_DIR/frontend.log" 2>&1 &
  echo $! > "$RUN_DIR/frontend.pid"
)
assert_pid_alive "$RUN_DIR/frontend.pid" "frontend" "$RUN_DIR/frontend.log"
if ! wait_for_http "frontend" "http://localhost:$FRONTEND_PORT" 45; then
  warn "frontend did not answer HTTP requests; recent log output:"
  tail -n 60 "$RUN_DIR/frontend.log" >&2 || true
  die "frontend failed to become ready on http://localhost:$FRONTEND_PORT"
fi

sleep 3
log "----------------------------------------------------------------------"
log "  UI          http://localhost:$FRONTEND_PORT"
log "  API         http://localhost:$BACKEND_PORT  (interactive docs at /docs)"
log "  App Redis   localhost:6391   (internal cache & workflow storage)"
log "----------------------------------------------------------------------"
log "Logs: .run/backend.log, .run/frontend.log, or 'docker compose logs -f'"
log "Stop everything with: ./stop.sh"
