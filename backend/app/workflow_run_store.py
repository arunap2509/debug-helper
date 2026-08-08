"""Workflow Run Session Store:

Persists active workflow run sessions (startedAt timestamp set on first
message send, cached variable snapshots, runId, which steps have been
sent) in Redis under 'app:workflow_run:{workflow_id}'. Used purely to
drive run-page progress (which step you're on, what's already been sent)
— no cross-service telemetry here.
"""
import uuid
from datetime import datetime, timezone

from . import store


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
    return run


def delete_active_run(workflow_id: str) -> dict:
    key = f"app:workflow_run:{workflow_id}"
    store.set_json(key, None)
    return {"deleted": True}


def record_step_sent(workflow_id: str, step_id: str, variables: dict | None = None) -> dict:
    run = get_active_run(workflow_id)
    key = f"app:workflow_run:{workflow_id}"

    # Initialize startedAt & startedAtMs on first message sent
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
