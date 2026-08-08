"""Persistent storage for data the user authors directly in this app —
workflows and queue labels — as opposed to cache.py's short-TTL mirror of
reads from Postgres/Wiremock/LocalStack.

Lives on this app's own Redis (app_redis.py), in its own db, separate
from cache.py's db and from any "redis" connection the user points at.
Keys written here are never given an expiry — this is the source of
truth, not a cache.
"""
import json

import redis

from . import app_redis


def _client():
    return redis.Redis(
        host=app_redis.HOST,
        port=app_redis.PORT,
        db=app_redis.STORE_DB,
        decode_responses=True,
        socket_connect_timeout=2,
        socket_timeout=2,
    )


def get_json(key: str, default=None):
    raw = _client().get(key)
    if raw is None:
        return default
    return json.loads(raw)


def set_json(key: str, value):
    _client().set(key, json.dumps(value))


def get_hash(key: str) -> dict:
    return _client().hgetall(key)


def hset(key: str, field: str, value: str):
    _client().hset(key, field, value)
