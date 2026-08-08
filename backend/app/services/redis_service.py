import redis

FALLBACK_NUM_DBS = 16  # redis.conf default, only used if CONFIG GET is unavailable


def _client(cfg, db):
    return redis.Redis(
        host=cfg["host"],
        port=int(cfg["port"]),
        db=db,
        decode_responses=True,
        socket_connect_timeout=3,
        socket_timeout=3,
    )


def ping(cfg):
    _client(cfg, 0).ping()


def get_num_dbs(cfg) -> int:
    """Ask the server how many logical dbs it's actually configured for,
    rather than assuming the redis.conf default of 16 — some deployments
    (managed Redis, cluster mode) configure a different count, or disable
    CONFIG entirely, in which case we fall back to the default."""
    try:
        result = _client(cfg, 0).config_get("databases")
        return int(result["databases"])
    except (redis.exceptions.RedisError, KeyError, ValueError):
        return FALLBACK_NUM_DBS


def list_dbs(cfg):
    # `reserved` is kept in the response shape for API stability, but a
    # "redis" connection here is always a monitored target now — this
    # app's own cache/store lives on a separate Redis (see app_redis.py),
    # so none of a target's dbs are reserved anymore.
    result = []
    for db in range(get_num_dbs(cfg)):
        try:
            size = _client(cfg, db).dbsize()
        except redis.exceptions.RedisError:
            size = 0
        result.append({"db": db, "keyCount": size, "reserved": False})
    return result


def _preview_value(c, key, type_):
    if type_ == "string":
        return c.get(key)
    if type_ == "hash":
        return c.hgetall(key)
    if type_ == "list":
        return c.lrange(key, 0, 49)
    if type_ == "set":
        return list(c.smembers(key))
    if type_ == "zset":
        return c.zrange(key, 0, 49, withscores=True)
    return None


def list_keys(cfg, db: int, pattern: str = "*", limit: int = 300):
    c = _client(cfg, db)
    keys = []
    cursor = 0
    iterations = 0
    while True:
        cursor, batch = c.scan(cursor=cursor, match=pattern, count=200)
        for k in batch:
            if len(keys) >= limit:
                break
            type_ = c.type(k)
            ttl = c.ttl(k)
            keys.append(
                {
                    "key": k,
                    "type": type_,
                    "ttl": ttl,
                    "preview": _preview_value(c, k, type_),
                }
            )
        iterations += 1
        if cursor == 0 or len(keys) >= limit or iterations > 500:
            break
    keys.sort(key=lambda x: x["key"])
    return keys


def get_key(cfg, db: int, key: str):
    c = _client(cfg, db)
    if not c.exists(key):
        raise KeyError(key)
    type_ = c.type(key)
    return {"key": key, "type": type_, "ttl": c.ttl(key), "value": _preview_value(c, key, type_)}


def delete_key(cfg, db: int, key: str):
    c = _client(cfg, db)
    return c.delete(key)


def set_key(cfg, db: int, key: str, value: str, ttl: int | None = None):
    c = _client(cfg, db)
    if ttl and ttl > 0:
        return c.setex(key, ttl, value)
    return c.set(key, value)


def get_recent_activity(cfg, db: int = 0, queue_names: list[str] | None = None):
    try:
        c = _client(cfg, db)
        slowlogs = c.slowlog_get(20)
        logs = []
        for s in slowlogs:
            cmd = " ".join(str(arg) for arg in s.get("command", []))
            logs.append(
                {
                    "id": s.get("id"),
                    "command": cmd,
                    "durationUs": s.get("duration"),
                    "timestamp": s.get("start_time"),
                }
            )

        active_keys = []
        if queue_names:
            for q_name in queue_names:
                matching = c.keys(f"*{q_name}*")
                for k in matching:
                    t = c.type(k)
                    active_keys.append({"key": k, "type": t, "ttl": c.ttl(k)})
        return {"slowlog": logs, "keys": active_keys}
    except Exception:
        return {"slowlog": [], "keys": []}


