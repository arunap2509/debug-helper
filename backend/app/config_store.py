"""Connections this app watches: postgres/redis/wiremock/localstack targets.

Unlike the original single-connection-per-type model, this stores a *list*
of named connections, each with a `type` (one of FIELD_SCHEMAS' keys). The
four defaults seeded on first run point at the docker-compose dummy stack;
more can be added of any of the same four types (e.g. a second Postgres).

These are all monitored targets, never this app's own infrastructure —
including any "redis" connection here, which points at the dummy stack's
Redis (what the Django listener writes to). This app's own Redis (its
response cache and workflow/label storage) is a separate server entirely,
configured in app_redis.py, not part of this editable connections list.

Persisted to a JSON file so edits survive a backend restart.
"""
import json
from pathlib import Path
from threading import Lock

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
CONFIG_FILE = DATA_DIR / "connections.json"

FIELD_SCHEMAS = {
    "postgres": [
        {"name": "host", "kind": "text", "default": "localhost"},
        {"name": "port", "kind": "number", "default": 5439},
        {"name": "user", "kind": "text", "default": "appuser"},
        {"name": "password", "kind": "password", "default": "apppass"},
        {"name": "dbname", "kind": "text", "default": "appdb"},
        {"name": "containerName", "kind": "text", "default": ""},
    ],
    "redis": [
        {"name": "host", "kind": "text", "default": "localhost"},
        {"name": "port", "kind": "number", "default": 6390},
    ],
    "wiremock": [
        {"name": "host", "kind": "text", "default": "localhost"},
        {"name": "port", "kind": "number", "default": 8089},
    ],
    "localstack": [
        {"name": "host", "kind": "text", "default": "localhost"},
        {"name": "port", "kind": "number", "default": 4566},
        {"name": "region", "kind": "text", "default": "us-east-1"},
        {"name": "access_key", "kind": "text", "default": "test"},
        {"name": "secret_key", "kind": "password", "default": "test"},
        {"name": "containerName", "kind": "text", "default": ""},
    ],
}

TYPE_LABELS = {
    "postgres": "Postgres",
    "redis": "Redis",
    "wiremock": "Wiremock",
    "localstack": "LocalStack",
}


def _default_fields(type_: str) -> dict:
    return {f["name"]: f["default"] for f in FIELD_SCHEMAS[type_]}


def _default_connections() -> list[dict]:
    return []


_lock = Lock()


def _migrate_legacy(raw: dict) -> list[dict]:
    """Old format was {"postgres": {...fields}, "redis": {...}, ...}."""
    connections = []
    for type_ in FIELD_SCHEMAS:
        fields = {**_default_fields(type_), **raw.get(type_, {})}
        connections.append({"id": type_, "type": type_, "label": TYPE_LABELS[type_], "fields": fields})
    return connections


def _load() -> list[dict]:
    if not CONFIG_FILE.exists():
        return []
    with CONFIG_FILE.open() as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        return _migrate_legacy(raw)
    return raw


def _get_state() -> list[dict]:
    global _state
    _state = _load()
    return _state


_state: list[dict] = _load()


def _save():
    with CONFIG_FILE.open("w") as f:
        json.dump(_state, f, indent=2)


def _find(conn_id: str) -> dict:
    for conn in _get_state():
        if conn["id"] == conn_id:
            return conn
    raise KeyError(conn_id)


def schemas():
    return FIELD_SCHEMAS


def get_all() -> list[dict]:
    with _lock:
        return json.loads(json.dumps(_get_state()))


def list_by_type(type_: str) -> list[dict]:
    with _lock:
        return json.loads(json.dumps([c for c in _state if c["type"] == type_]))


def get(conn_id: str) -> dict:
    with _lock:
        return json.loads(json.dumps(_find(conn_id)))


def default_id(type_: str) -> str:
    """id to use when a router isn't told which connection to use: the
    original default (id == type) if it still exists, else the first
    connection of that type."""
    with _lock:
        for conn in _state:
            if conn["id"] == type_:
                return type_
        for conn in _state:
            if conn["type"] == type_:
                return conn["id"]
    raise KeyError(f"no connection of type '{type_}' configured")


def _next_id(type_: str) -> str:
    existing = {c["id"] for c in _state}
    if type_ not in existing:
        return type_
    n = 2
    while f"{type_}-{n}" in existing:
        n += 1
    return f"{type_}-{n}"


def create(type_: str, label: str, fields: dict) -> dict:
    if type_ not in FIELD_SCHEMAS:
        raise ValueError(f"unknown connection type '{type_}'")
    with _lock:
        conn = {
            "id": _next_id(type_),
            "type": type_,
            "label": label or TYPE_LABELS[type_],
            "fields": {**_default_fields(type_), **fields},
        }
        _state.append(conn)
        _save()
        return json.loads(json.dumps(conn))


def update(conn_id: str, label: str | None = None, fields: dict | None = None) -> dict:
    with _lock:
        conn = _find(conn_id)
        if label is not None:
            conn["label"] = label
        if fields:
            conn["fields"].update(fields)
        _save()
        return json.loads(json.dumps(conn))


def reset(conn_id: str) -> dict:
    """Only meaningful for the original default connections (id == type)."""
    with _lock:
        conn = _find(conn_id)
        if conn["id"] not in FIELD_SCHEMAS:
            raise ValueError("reset only applies to the original default connections")
        conn["fields"] = _default_fields(conn["type"])
        conn["label"] = TYPE_LABELS[conn["type"]]
        _save()
        return json.loads(json.dumps(conn))


def delete(conn_id: str):
    with _lock:
        conn = _find(conn_id)
        remaining_of_type = [c for c in _state if c["type"] == conn["type"] and c["id"] != conn_id]
        if not remaining_of_type:
            raise ValueError(f"can't delete the last {conn['type']} connection")
        _state.remove(conn)
        _save()
