import subprocess
import time
from fastapi import APIRouter, HTTPException
import redis

from .. import config_store
from ..services import wiremock_service

router = APIRouter(prefix="/api/events", tags=["events"])


def _get_conn_fields(conn_id: str) -> dict:
    try:
        return config_store.get(conn_id)["fields"]
    except KeyError:
        raise HTTPException(400, f"Connection '{conn_id}' not found")


@router.get("/wiremock")
def get_wiremock_events(connId: str, since: float | int | None = None):
    cfg = _get_conn_fields(connId)
    try:
        reqs = wiremock_service.get_requests(cfg)
    except Exception as exc:
        raise HTTPException(502, f"Failed to fetch Wiremock requests: {exc}") from exc

    since_ms = int(since) if since else 0
    # Normalize since if seconds were passed instead of ms
    if 0 < since_ms < 10000000000:
        since_ms *= 1000

    results = []
    for req in reqs:
        logged_date = req.get("loggedDate", 0)
        if logged_date >= since_ms:
            req_data = req.get("request", {})
            resp_data = req.get("response", {})
            results.append(
                {
                    "id": req.get("id"),
                    "loggedDate": logged_date,
                    "method": req_data.get("method"),
                    "url": req_data.get("url"),
                    "status": resp_data.get("status"),
                    "headers": req_data.get("headers"),
                    "body": req_data.get("body"),
                    "responseBody": resp_data.get("body"),
                }
            )
    return results


@router.get("/redis")
def get_redis_events(connId: str, since: float | int | None = None):
    cfg = _get_conn_fields(connId)
    host = cfg.get("host", "localhost")
    port = int(cfg.get("port", 6390))

    try:
        r = redis.Redis(host=host, port=port, socket_timeout=3)
        slowlogs = r.slowlog_get(200)
    except Exception as exc:
        raise HTTPException(502, f"Failed to connect to Redis container at {host}:{port}: {exc}") from exc

    since_sec = int(since / 1000) if (since and since > 10000000000) else int(since or 0)

    results = []
    for entry in slowlogs:
        if isinstance(entry, dict):
            start_time = entry.get("start_time", 0)
            if start_time >= since_sec:
                command = entry.get("command", b"")
                if isinstance(command, bytes):
                    command = command.decode("utf-8", errors="ignore")
                elif isinstance(command, list):
                    command = " ".join([c.decode("utf-8", errors="ignore") if isinstance(c, bytes) else str(c) for c in command])
                results.append(
                    {
                        "id": entry.get("id"),
                        "startTime": start_time,
                        "durationUs": entry.get("duration"),
                        "command": str(command),
                    }
                )
    return results


def _fetch_docker_logs(container_name: str, since_sec: int) -> list[str]:
    cmd = ["docker", "logs"]
    if since_sec > 0:
        cmd.extend(["--since", str(since_sec)])
    cmd.append(container_name)

    try:
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
        raw_output = proc.stdout + "\n" + proc.stderr
        lines = [line for line in raw_output.splitlines() if line.strip()]
        return lines
    except Exception as exc:
        return [f"[ERROR] Failed to run docker logs for container '{container_name}': {exc}"]


@router.get("/postgres")
def get_postgres_events(connId: str, since: float | int | None = None):
    cfg = _get_conn_fields(connId)
    container_name = cfg.get("containerName")
    if not container_name or not str(container_name).strip():
        return {
            "containerName": None,
            "warning": "No containerName configured for this Postgres connection in Admin panel.",
            "since": 0,
            "logs": [],
        }

    since_sec = int(since / 1000) if (since and since > 10000000000) else int(since or 0)
    lines = _fetch_docker_logs(str(container_name).strip(), since_sec)
    return {"containerName": container_name, "since": since_sec, "logs": lines}


@router.get("/localstack")
def get_localstack_events(connId: str, since: float | int | None = None):
    cfg = _get_conn_fields(connId)
    container_name = cfg.get("containerName")
    if not container_name or not str(container_name).strip():
        return {
            "containerName": None,
            "warning": "No containerName configured for this LocalStack connection in Admin panel.",
            "since": 0,
            "logs": [],
        }

    since_sec = int(since / 1000) if (since and since > 10000000000) else int(since or 0)
    lines = _fetch_docker_logs(str(container_name).strip(), since_sec)
    return {"containerName": container_name, "since": since_sec, "logs": lines}
