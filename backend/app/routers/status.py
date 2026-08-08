import time

from fastapi import APIRouter

from .. import config_store
from ..services import localstack_service, postgres_service, redis_service, wiremock_service

router = APIRouter(prefix="/api/status", tags=["status"])

_PINGERS = {
    "postgres": postgres_service.ping,
    "redis": redis_service.ping,
    "wiremock": wiremock_service.ping,
    "localstack": localstack_service.ping,
}


@router.get("")
def get_status():
    results = []
    for conn in config_store.get_all():
        ping = _PINGERS[conn["type"]]
        start = time.monotonic()
        try:
            ping(conn["fields"])
            connected, error = True, None
        except Exception as exc:  # noqa: BLE001 - surfacing any connectivity failure to the UI
            connected, error = False, str(exc)
        results.append(
            {
                "id": conn["id"],
                "type": conn["type"],
                "label": conn["label"],
                "connected": connected,
                "error": error,
                "latencyMs": int((time.monotonic() - start) * 1000),
                "host": conn["fields"].get("host"),
                "port": conn["fields"].get("port"),
            }
        )
    return results
