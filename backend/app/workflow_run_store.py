"""Workflow Run Session Store:

Persists active workflow run sessions (startedAt timestamp set on FIRST message send,
cached variable snapshots, runId, sent steps) and associated cross-service telemetry
event streams in Redis under 'app:workflow_run:{workflow_id}'.
"""
import uuid
from datetime import datetime, timezone

from . import store

MAX_LOGS_PER_RUN = 150


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_active_run(workflow_id: str) -> dict:
    key = f"app:workflow_run:{workflow_id}"
    run = store.get_json(key, None)
    if not run:
        run = {
            "runId": f"run-{uuid.uuid4().hex[:8]}",
            "startedAt": None,
            "startedAtMs": None,
            "variables": {},
            "sentStepIds": [],
            "status": "idle",
        }
        store.set_json(key, run)
    return run


def reset_run(workflow_id: str) -> dict:
    key = f"app:workflow_run:{workflow_id}"
    run = {
        "runId": f"run-{uuid.uuid4().hex[:8]}",
        "startedAt": None,
        "startedAtMs": None,
        "variables": {},
        "sentStepIds": [],
        "status": "idle",
    }
    store.set_json(key, run)
    telemetry_key = f"app:workflow_telemetry:{workflow_id}"
    store.set_json(telemetry_key, [])
    return run


def delete_active_run(workflow_id: str) -> dict:
    key = f"app:workflow_run:{workflow_id}"
    telemetry_key = f"app:workflow_telemetry:{workflow_id}"
    store.set_json(key, None)
    store.set_json(telemetry_key, [])
    return {"deleted": True}


def record_step_sent(workflow_id: str, step_id: str, variables: dict | None = None) -> dict:
    run = get_active_run(workflow_id)
    key = f"app:workflow_run:{workflow_id}"

    # Initialize startedAt & startedAtMs ON FIRST MESSAGE SENT
    if not run.get("startedAt"):
        dt = datetime.now(timezone.utc)
        run["startedAt"] = dt.isoformat()
        run["startedAtMs"] = int(dt.timestamp() * 1000)
        run["status"] = "active"

    if variables is not None:
        run["variables"] = variables

    if step_id not in run.get("sentStepIds", []):
        run.setdefault("sentStepIds", []).append(step_id)

    store.set_json(key, run)
    return run


def record_telemetry_event(workflow_id: str, service: str, action: str, details: dict) -> dict:
    run = get_active_run(workflow_id)
    telemetry_key = f"app:workflow_telemetry:{workflow_id}"
    logs = store.get_json(telemetry_key, []) or []

    event = {
        "id": f"{service}-{uuid.uuid4().hex[:8]}",
        "runId": run.get("runId"),
        "service": service,
        "action": action,
        "time": _now(),
        **details,
    }

    logs.append(event)
    if len(logs) > MAX_LOGS_PER_RUN:
        logs = logs[-MAX_LOGS_PER_RUN:]

    store.set_json(telemetry_key, logs)
    return event


def get_telemetry_events(workflow_id: str) -> list[dict]:
    run = get_active_run(workflow_id)
    active_run_id = run.get("runId")
    telemetry_key = f"app:workflow_telemetry:{workflow_id}"
    logs = store.get_json(telemetry_key, []) or []
    return [e for e in logs if e.get("runId") == active_run_id]
