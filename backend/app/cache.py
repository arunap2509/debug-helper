"""Thin cache layer so the UI doesn't have to hit Postgres/Wiremock/
LocalStack on every request. Backed by this app's own Redis (app_redis.py)
— a separate server from any "redis" connection the user points at, which
is always a monitored target, never this app's cache.

If the app's Redis is unreachable, every call here just falls through to
calling `fn()` directly — caching is a nice-to-have, not a dependency.
"""
import json
from typing import Any, Callable

import redis
from fastapi.encoders import jsonable_encoder

from . import app_redis


def _client():
    return redis.Redis(
        host=app_redis.HOST,
        port=app_redis.PORT,
        db=app_redis.CACHE_DB,
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1,
    )


def cached(key: str, ttl: int, fn: Callable[[], Any], refresh: bool = False):
    try:
        client = _client()
        if not refresh:
            raw = client.get(key)
            if raw is not None:
                return json.loads(raw)
        result = jsonable_encoder(fn())
        client.set(key, json.dumps(result), ex=ttl)
        return result
    except redis.exceptions.RedisError:
        return jsonable_encoder(fn())


def invalidate_prefix(prefix: str):
    try:
        client = _client()
        keys = list(client.scan_iter(f"{prefix}*"))
        if keys:
            client.delete(*keys)
    except redis.exceptions.RedisError:
        pass
