from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import cache, config_store
from ..services import wiremock_service

router = APIRouter(prefix="/api/wiremock", tags=["wiremock"])


def _resolve(conn: str | None) -> tuple[str, dict]:
    conn_id = conn or config_store.default_id("wiremock")
    return conn_id, config_store.get(conn_id)["fields"]


class TryRequest(BaseModel):
    method: str
    path: str
    headers: dict | None = None
    body: str | None = None
    conn: str | None = None


@router.get("/mappings")
def get_mappings(conn: str | None = None, refresh: bool = False):
    conn_id, cfg = _resolve(conn)
    try:
        return cache.cached(f"wiremock:{conn_id}:mappings", 10, lambda: wiremock_service.list_mappings(cfg), refresh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach wiremock: {exc}") from exc


@router.post("/reset")
def reset_mappings(conn: str | None = None):
    conn_id, cfg = _resolve(conn)
    try:
        wiremock_service.reset_mappings(cfg)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reset wiremock mappings: {exc}") from exc
    cache.invalidate_prefix(f"wiremock:{conn_id}:mappings")
    return {"status": "reset"}


@router.post("/try")
def try_mapping(body: TryRequest):
    _, cfg = _resolve(body.conn)
    try:
        return wiremock_service.try_request(cfg, body.method, body.path, body.headers, body.body)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"request to wiremock failed: {exc}") from exc

