from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import cache, config_store, store
from ..services import localstack_service

router = APIRouter(prefix="/api/localstack", tags=["localstack"])


def _resolve(conn: str | None) -> tuple[str, dict]:
    conn_id = conn or config_store.default_id("localstack")
    return conn_id, config_store.get(conn_id)["fields"]


def _labels_key(conn_id: str) -> str:
    return f"app:queue_labels:{conn_id}"


class SetLabel(BaseModel):
    label: str


@router.get("/queues")
def get_queues(conn: str | None = None, refresh: bool = False):
    conn_id, cfg = _resolve(conn)
    try:
        queues = cache.cached(f"localstack:{conn_id}:queues", 10, lambda: localstack_service.list_queues(cfg), refresh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach localstack: {exc}") from exc

    # Editable display names live outside the cached snapshot so renaming
    # a queue's label shows up immediately, not after the next TTL refresh.
    labels = store.get_hash(_labels_key(conn_id))
    for q in queues:
        q["label"] = labels.get(q["name"], q["name"])
    return queues


@router.put("/queues/{queue_name}/label")
def set_queue_label(queue_name: str, body: SetLabel, conn: str | None = None):
    conn_id, _ = _resolve(conn)
    label = body.label.strip() or queue_name
    store.hset(_labels_key(conn_id), queue_name, label)
    return {"queueName": queue_name, "label": label}


@router.post("/queues/{queue_name}/purge")
def purge_queue(queue_name: str, conn: str | None = None):
    conn_id, cfg = _resolve(conn)
    try:
        localstack_service.purge_queue(cfg, queue_name)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"failed to purge queue '{queue_name}': {exc}") from exc
    cache.invalidate_prefix(f"localstack:{conn_id}:queues")
    return {"purged": True}


@router.get("/buckets")
def get_buckets(conn: str | None = None, refresh: bool = False):
    conn_id, cfg = _resolve(conn)
    try:
        return cache.cached(
            f"localstack:{conn_id}:buckets", 15, lambda: localstack_service.list_buckets(cfg), refresh
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach localstack: {exc}") from exc


@router.get("/ssm")
def get_ssm(conn: str | None = None, refresh: bool = False):
    conn_id, cfg = _resolve(conn)
    try:
        return cache.cached(f"localstack:{conn_id}:ssm", 15, lambda: localstack_service.list_ssm_params(cfg), refresh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach localstack: {exc}") from exc
