"""Queue Payload Store:

Persists reusable message versions per Queue Name (e.g. orders-queue, payments-queue).
Payload versions are tagged against the queue name, ensuring that deleting a step or
workflow preserves all saved payloads, and any workflow referencing that queue can
instantly reuse all existing message versions.

Stored in backend Redis (app_redis.py) under 'app:queue_payloads'.
"""
import json
import uuid
from datetime import datetime, timezone

from . import store

STORE_KEY = "app:queue_payloads"
MAX_VERSIONS_PER_QUEUE = 5


function_now = lambda: datetime.now(timezone.utc).isoformat()
function_new_id = lambda prefix: f"{prefix}-{uuid.uuid4().hex[:8]}"


def _load_all() -> dict[str, list[dict]]:
    """Returns a dict mapping queue_name -> list of version dicts."""
    return store.get_json(STORE_KEY, {})


def _save_all(data: dict[str, list[dict]]):
    store.set_json(STORE_KEY, data)


def get_versions(queue_name: str) -> list[dict]:
    data = _load_all()
    return data.get(queue_name, [])


def add_version(queue_name: str, body: str, label: str | None = None) -> list[dict]:
    data = _load_all()
    versions = data.get(queue_name, [])

    if len(versions) >= MAX_VERSIONS_PER_QUEUE:
        raise ValueError(f"Queue '{queue_name}' can only hold up to {MAX_VERSIONS_PER_QUEUE} reusable message versions")

    try:
        json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Message body must be valid JSON: {exc}") from exc

    version = {
        "id": function_new_id("v"),
        "label": label.strip() if label and label.strip() else f"v{len(versions) + 1}",
        "body": body,
        "createdAt": function_now(),
    }
    versions.append(version)
    data[queue_name] = versions
    _save_all(data)
    return versions


def update_version(
    queue_name: str, version_id: str, label: str | None = None, body: str | None = None
) -> list[dict]:
    data = _load_all()
    versions = data.get(queue_name, [])
    version = next((v for v in versions if v["id"] == version_id), None)
    if not version:
        raise KeyError(f"Version '{version_id}' not found for queue '{queue_name}'")

    if label is not None and label.strip():
        version["label"] = label.strip()

    if body is not None:
        try:
            json.loads(body)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Message body must be valid JSON: {exc}") from exc
        version["body"] = body

    data[queue_name] = versions
    _save_all(data)
    return versions


def remove_version(queue_name: str, version_id: str) -> list[dict]:
    data = _load_all()
    versions = data.get(queue_name, [])
    version = next((v for v in versions if v["id"] == version_id), None)
    if not version:
        raise KeyError(f"Version '{version_id}' not found for queue '{queue_name}'")

    versions.remove(version)
    data[queue_name] = versions
    _save_all(data)
    return versions
