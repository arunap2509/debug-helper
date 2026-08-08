from fastapi import APIRouter, HTTPException, Query

from .. import cache, config_store
from ..services import redis_service

router = APIRouter(prefix="/api/redis", tags=["redis"])


def _resolve(conn: str | None) -> tuple[str, dict]:
    conn_id = conn or config_store.default_id("redis")
    return conn_id, config_store.get(conn_id)["fields"]


@router.get("/dbs")
def get_dbs(conn: str | None = None, refresh: bool = False):
    conn_id, cfg = _resolve(conn)
    try:
        return cache.cached(f"redis:{conn_id}:dbs", 5, lambda: redis_service.list_dbs(cfg), refresh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach redis: {exc}") from exc


@router.get("/keys")
def get_keys(
    db: int = Query(..., ge=0),
    pattern: str = "*",
    limit: int = Query(300, ge=1, le=1000),
    conn: str | None = None,
    refresh: bool = False,
):
    conn_id, cfg = _resolve(conn)
    key = f"redis:{conn_id}:keys:{db}:{pattern}:{limit}"
    try:
        return cache.cached(key, 5, lambda: redis_service.list_keys(cfg, db, pattern, limit), refresh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach redis: {exc}") from exc


@router.get("/key")
def get_key(db: int = Query(..., ge=0), key: str = Query(...), conn: str | None = None):
    _, cfg = _resolve(conn)
    try:
        return redis_service.get_key(cfg, db, key)
    except KeyError:
        raise HTTPException(404, f"key '{key}' not found in db {db}")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach redis: {exc}") from exc


from pydantic import BaseModel, Field


class SetKeyPayload(BaseModel):
    db: int = Field(..., ge=0)
    key: str
    value: str
    ttl: int | None = None
    conn: str | None = None


@router.delete("/key")
def delete_key(db: int = Query(..., ge=0), key: str = Query(...), conn: str | None = None):
    conn_id, cfg = _resolve(conn)
    try:
        deleted = redis_service.delete_key(cfg, db, key)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach redis: {exc}") from exc
    cache.invalidate_prefix(f"redis:{conn_id}:keys:{db}")
    cache.invalidate_prefix(f"redis:{conn_id}:dbs")
    return {"deleted": deleted}


@router.post("/key")
def set_key(payload: SetKeyPayload):
    conn_id, cfg = _resolve(payload.conn)
    try:
        redis_service.set_key(cfg, payload.db, payload.key, payload.value, payload.ttl)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach redis: {exc}") from exc
    cache.invalidate_prefix(f"redis:{conn_id}:keys:{payload.db}")
    cache.invalidate_prefix(f"redis:{conn_id}:dbs")
    return {"status": "ok", "key": payload.key}

