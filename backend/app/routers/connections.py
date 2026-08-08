from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from .. import cache, config_store

router = APIRouter(prefix="/api/connections", tags=["connections"])


class CreateConnection(BaseModel):
    type: str
    label: str
    fields: dict


class UpdateConnection(BaseModel):
    label: str | None = None
    fields: dict | None = None


@router.get("")
def list_connections():
    return config_store.get_all()


@router.get("/schema")
def get_schema():
    return config_store.schemas()


@router.post("")
def create_connection(body: CreateConnection):
    try:
        return config_store.create(body.type, body.label, body.fields)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.put("/{conn_id}")
def update_connection(conn_id: str, body: UpdateConnection):
    try:
        updated = config_store.update(conn_id, label=body.label, fields=body.fields)
    except KeyError:
        raise HTTPException(404, f"unknown connection '{conn_id}'")
    cache.invalidate_prefix(conn_id)
    return updated


@router.post("/{conn_id}/reset")
def reset_connection(conn_id: str):
    try:
        updated = config_store.reset(conn_id)
    except KeyError:
        raise HTTPException(404, f"unknown connection '{conn_id}'")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    cache.invalidate_prefix(conn_id)
    return updated


@router.delete("/{conn_id}")
def delete_connection(conn_id: str):
    try:
        config_store.delete(conn_id)
    except KeyError:
        raise HTTPException(404, f"unknown connection '{conn_id}'")
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    cache.invalidate_prefix(conn_id)
    return {"deleted": True}
