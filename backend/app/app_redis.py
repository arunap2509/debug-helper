"""Connection details for the Redis instance this app owns for itself —
its response cache and its persistent store (workflows, queue labels).

Deliberately a separate server from the "redis" connection in
config_store.py, which points at the dummy stack's Redis: the one the
Django listener writes to and the one the Redis page browses. The two
must never be the same instance — mixing this app's own bookkeeping into
a monitored target's keyspace would make the Redis page lie about what's
actually in the target system.

Configured via environment variables (matching docker-compose.yml's
app-redis service) rather than the editable connections system, since
this isn't a target you inspect — it's this app's own infrastructure.
"""
import os

HOST = os.environ.get("APP_REDIS_HOST", "localhost")
PORT = int(os.environ.get("APP_REDIS_PORT", "6391"))

CACHE_DB = 0
STORE_DB = 1
