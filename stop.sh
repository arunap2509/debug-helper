#!/usr/bin/env bash
# Stops the backend/frontend processes started by setup.sh and tears down
# the dummy docker stack. Docker volumes (postgres/redis/localstack data)
# are kept — pass --volumes to also wipe them for a totally clean slate.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"
RUN_DIR="$ROOT_DIR/.run"

log() { printf "\033[1;34m[stop]\033[0m %s\n" "$1"; }

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

  for pid in $pids; do
    log "stopping listener on port $port (pid $pid)"
    stop_pid_tree "$pid"
    kill "$pid" >/dev/null 2>&1 || true
  done
}

for name in backend frontend; do
  pidfile="$RUN_DIR/$name.pid"
  if [ -f "$pidfile" ]; then
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" >/dev/null 2>&1; then
      log "stopping $name (pid $pid)"
      stop_pid_tree "$pid"
    fi
    rm -f "$pidfile"
  fi
done

stop_listeners_on_port 8000
stop_listeners_on_port 3000

log "stopping docker stack..."
if [ "${1:-}" = "--volumes" ]; then
  docker compose down --volumes
else
  docker compose down
fi

log "done."
