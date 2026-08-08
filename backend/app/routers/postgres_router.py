from fastapi import APIRouter, HTTPException, Query

from .. import cache, config_store
from ..services import postgres_service

router = APIRouter(prefix="/api/postgres", tags=["postgres"])


def _resolve(conn: str | None) -> tuple[str, dict]:
    conn_id = conn or config_store.default_id("postgres")
    return conn_id, config_store.get(conn_id)["fields"]


@router.get("/tables")
def get_tables(conn: str | None = None, refresh: bool = False):
    conn_id, cfg = _resolve(conn)
    try:
        return cache.cached(f"postgres:{conn_id}:tables", 15, lambda: postgres_service.list_tables(cfg), refresh)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not reach postgres: {exc}") from exc


@router.get("/rows")
def get_rows(
    table: str = Query(...),
    mode: str = Query("top"),
    filter: str | None = Query(None),
    limit: int = Query(5, ge=1, le=5),
    conn: str | None = None,
):
    _, cfg = _resolve(conn)
    try:
        return postgres_service.fetch_rows(cfg, table, mode, filter, limit)
    except ValueError as val_err:
        raise HTTPException(400, str(val_err)) from val_err
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"could not fetch rows: {exc}") from exc
from pydantic import BaseModel


class SqlQueryPayload(BaseModel):
    sql: str
    conn: str | None = None


@router.post("/execute")
def execute_query(payload: SqlQueryPayload):
    _, cfg = _resolve(payload.conn)
    try:
        return postgres_service.execute_sql(cfg, payload.sql, limit=5)
    except ValueError as val_err:
        raise HTTPException(400, str(val_err)) from val_err
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(502, f"SQL execution failed: {exc}") from exc
