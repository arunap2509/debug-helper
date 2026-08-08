"""Workflows: a named, ordered chain of queue steps.

Step message payloads are saved and tagged per Queue Name in queue_payload_store,
allowing message versions to be shared, persisted, and reused across any workflow
referencing the same queue. Deleting a step or workflow preserves all saved payloads.
"""
import json
import uuid
from datetime import datetime, timezone

from . import queue_payload_store, store

STORE_KEY = "app:workflows"
MAX_VERSIONS = 5


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def _load() -> list[dict]:
    state = store.get_json(STORE_KEY, [])
    # Populate reusable queue-centric versions for every step
    for wf in state:
        for step in wf.get("steps", []):
            queue_name = step.get("queueName")
            if queue_name:
                # Migrate any legacy inline step versions to queue_payload_store
                inline_versions = step.pop("versions", [])
                if inline_versions and not queue_payload_store.get_versions(queue_name):
                    for v in inline_versions:
                        try:
                            queue_payload_store.add_version(queue_name, v["body"], v.get("label"))
                        except Exception:  # noqa: BLE001
                            pass

                # Dynamically attach shared queue versions
                versions = queue_payload_store.get_versions(queue_name)
                step["versions"] = versions

                # Ensure activeVersionId is valid
                if not step.get("activeVersionId") and versions:
                    step["activeVersionId"] = versions[0]["id"]
                elif step.get("activeVersionId") and not any(v["id"] == step["activeVersionId"] for v in versions):
                    step["activeVersionId"] = versions[0]["id"] if versions else None
    return state


def _save(state: list[dict]):
    # Strip dynamic versions array before persisting workflow structure to avoid duplication
    cleaned_state = []
    for wf in state:
        wf_copy = dict(wf)
        cleaned_steps = []
        for step in wf.get("steps", []):
            step_copy = dict(step)
            step_copy.pop("versions", None)
            cleaned_steps.append(step_copy)
        wf_copy["steps"] = cleaned_steps
        cleaned_state.append(wf_copy)

    store.set_json(STORE_KEY, cleaned_state)


def _find(state: list[dict], workflow_id: str) -> dict:
    for wf in state:
        if wf["id"] == workflow_id:
            return wf
    raise KeyError(workflow_id)


def _find_step(wf: dict, step_id: str) -> dict:
    for step in wf["steps"]:
        if step["id"] == step_id:
            return step
    raise KeyError(step_id)


def list_all() -> list[dict]:
    return _load()


def get(workflow_id: str) -> dict:
    return _find(_load(), workflow_id)


def create(name: str, localstack_conn: str) -> dict:
    state = _load()
    wf = {
        "id": _new_id("wf"),
        "name": name or "Untitled workflow",
        "localstackConn": localstack_conn,
        "steps": [],
        "createdAt": _now(),
        "updatedAt": _now(),
    }
    state.append(wf)
    _save(state)
    return wf


def update(workflow_id: str, name: str | None = None, localstack_conn: str | None = None) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    if name is not None:
        wf["name"] = name
    if localstack_conn is not None:
        wf["localstackConn"] = localstack_conn
    wf["updatedAt"] = _now()
    _save(state)
    return wf


def delete(workflow_id: str):
    state = _load()
    wf = _find(state, workflow_id)
    state.remove(wf)
    _save(state)


def add_step(workflow_id: str, queue_name: str, index: int | None = None) -> dict:
    state = _load()
    wf = _find(state, workflow_id)

    # Resolve existing active version for this queue if available
    queue_versions = queue_payload_store.get_versions(queue_name)
    active_vid = queue_versions[0]["id"] if queue_versions else None

    step = {"id": _new_id("step"), "queueName": queue_name, "activeVersionId": active_vid, "versions": queue_versions}
    if index is not None and 0 <= index <= len(wf["steps"]):
        wf["steps"].insert(index, step)
    else:
        wf["steps"].append(step)
    wf["updatedAt"] = _now()
    _save(state)
    return wf


def remove_step(workflow_id: str, step_id: str) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)
    wf["steps"].remove(step)
    wf["updatedAt"] = _now()
    _save(state)
    return wf


def move_step(workflow_id: str, step_id: str, direction: str) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    steps = wf["steps"]
    idx = next((i for i, s in enumerate(steps) if s["id"] == step_id), None)
    if idx is None:
        raise KeyError(step_id)
    target = idx - 1 if direction == "up" else idx + 1
    if 0 <= target < len(steps):
        steps[idx], steps[target] = steps[target], steps[idx]
        wf["updatedAt"] = _now()
        _save(state)
    return wf


def add_version(workflow_id: str, step_id: str, body: str, label: str | None = None) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)

    # Persist version tagged against the queue name
    updated_versions = queue_payload_store.add_version(step["queueName"], body, label)

    # Set as active version if none set
    if not step["activeVersionId"] and updated_versions:
        step["activeVersionId"] = updated_versions[-1]["id"]

    wf["updatedAt"] = _now()
    _save(state)
    return get(workflow_id)


def remove_version(workflow_id: str, step_id: str, version_id: str) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)

    updated_versions = queue_payload_store.remove_version(step["queueName"], version_id)

    if step["activeVersionId"] == version_id:
        step["activeVersionId"] = updated_versions[-1]["id"] if updated_versions else None

    wf["updatedAt"] = _now()
    _save(state)
    return get(workflow_id)


def update_version(
    workflow_id: str, step_id: str, version_id: str, label: str | None = None, body: str | None = None
) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)

    queue_payload_store.update_version(step["queueName"], version_id, label, body)

    wf["updatedAt"] = _now()
    _save(state)
    return get(workflow_id)


def set_active_version(workflow_id: str, step_id: str, version_id: str) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)
    versions = queue_payload_store.get_versions(step["queueName"])
    if not any(v["id"] == version_id for v in versions):
        raise KeyError(version_id)
    step["activeVersionId"] = version_id
    wf["updatedAt"] = _now()
    _save(state)
    return get(workflow_id)


def resolve_message(workflow_id: str, step_id: str, version_id: str | None = None) -> tuple[str, str, str]:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)
    versions = queue_payload_store.get_versions(step["queueName"])

    vid = version_id or step.get("activeVersionId")
    if not vid and versions:
        vid = versions[0]["id"]

    if not vid:
        raise ValueError(f"Queue '{step['queueName']}' has no message versions yet")

    version = next((v for v in versions if v["id"] == vid), None)
    if not version:
        raise KeyError(vid)

    return wf["localstackConn"], step["queueName"], version["body"]


def update_step_downstream(workflow_id: str, step_id: str, downstream: dict | None) -> dict:
    state = _load()
    wf = _find(state, workflow_id)
    step = _find_step(wf, step_id)
    step["downstream"] = downstream
    wf["updatedAt"] = _now()
    _save(state)
    return get(workflow_id)
