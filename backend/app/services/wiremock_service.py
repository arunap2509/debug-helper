import time

import requests


def base_url(cfg):
    return f"http://{cfg['host']}:{cfg['port']}"


def ping(cfg):
    resp = requests.get(f"{base_url(cfg)}/__admin/mappings", timeout=3)
    resp.raise_for_status()


def get_requests(cfg) -> list[dict]:
    resp = requests.get(f"{base_url(cfg)}/__admin/requests", timeout=5)
    resp.raise_for_status()
    data = resp.json()
    return data.get("requests", [])


def list_mappings(cfg):
    resp = requests.get(f"{base_url(cfg)}/__admin/mappings", timeout=5)
    resp.raise_for_status()
    data = resp.json()

    result = []
    for idx, m in enumerate(data.get("mappings", [])):
        req = m.get("request", {})
        resp_def = m.get("response", {})
        result.append(
            {
                "id": m.get("id"),
                "name": m.get("name"),
                "method": req.get("method"),
                "url": req.get("url") or req.get("urlPath") or req.get("urlPathPattern") or req.get("urlPattern"),
                "status": resp_def.get("status"),
                "priority": m.get("priority"),
                "delayMs": resp_def.get("fixedDelayMilliseconds"),
                "insertedOrder": idx,
            }
        )
    result.sort(key=lambda m: (m["url"] or "", m["method"] or ""))
    return result


def reset_mappings(cfg):
    resp = requests.post(f"{base_url(cfg)}/__admin/mappings/reset", timeout=5)
    resp.raise_for_status()
    return True



def try_request(cfg, method: str, path: str, headers: dict | None = None, body: str | None = None):
    url = f"{base_url(cfg)}{path}"
    start = time.monotonic()
    resp = requests.request(
        method.upper(),
        url,
        headers=headers or {},
        data=body if body else None,
        timeout=10,
    )
    elapsed_ms = int((time.monotonic() - start) * 1000)

    try:
        parsed_body = resp.json()
    except ValueError:
        parsed_body = resp.text

    return {
        "status": resp.status_code,
        "headers": dict(resp.headers),
        "body": parsed_body,
        "elapsedMs": elapsed_ms,
    }

