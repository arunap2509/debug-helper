import time

import requests


def base_url(cfg):
    return f"http://{cfg['host']}:{cfg['port']}"


def ping(cfg):
    resp = requests.get(f"{base_url(cfg)}/__admin/mappings", timeout=3)
    resp.raise_for_status()


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


def get_logged_requests(cfg, limit=50, since_ms=None):
    try:
        resp = requests.get(f"{base_url(cfg)}/__admin/requests?limit={limit}", timeout=5)
        resp.raise_for_status()
        data = resp.json()
        requests_list = data.get("requests", [])

        result = []
        for item in requests_list:
            logged_date = item.get("loggedDate")
            if since_ms and logged_date and logged_date < since_ms:
                continue
            req = item.get("request", {})
            response_def = item.get("responseDefinition", {}) or item.get("response", {})
            stub = item.get("stubMapping", {})
            result.append(
                {
                    "id": item.get("id"),
                    "loggedDate": logged_date,
                    "loggedDateString": item.get("loggedDateString"),
                    "url": req.get("url"),
                    "method": req.get("method"),
                    "headers": req.get("headers"),
                    "body": req.get("body"),
                    "status": response_def.get("status"),
                    "wasMatched": item.get("wasMatched", True),
                    "stubName": stub.get("name") or stub.get("id") or "Wiremock Stub",
                }
            )
        return result
    except Exception:
        return []

