import psycopg2
import psycopg2.extras


def _connect(cfg):
    return psycopg2.connect(
        host=cfg["host"],
        port=int(cfg["port"]),
        user=cfg["user"],
        password=cfg["password"],
        dbname=cfg["dbname"],
        connect_timeout=3,
    )


def ping(cfg):
    with _connect(cfg) as conn, conn.cursor() as cur:
        cur.execute("SELECT 1")
        cur.fetchone()


def list_tables(cfg):
    with _connect(cfg) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' ORDER BY table_name"
        )
        table_names = [r["table_name"] for r in cur.fetchall()]

        result = []
        for name in table_names:
            # Catalog estimate (from the last ANALYZE/VACUUM), not COUNT(*) —
            # this stays instant even on huge tables instead of a full scan.
            cur.execute(
                "SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = %s AND relkind = 'r'",
                (name,),
            )
            row = cur.fetchone()
            row_count = max(row["estimate"], 0) if row else 0

            cur.execute(
                "SELECT column_name, data_type FROM information_schema.columns "
                "WHERE table_schema = 'public' AND table_name = %s "
                "ORDER BY ordinal_position",
                (name,),
            )
            columns = cur.fetchall()
            result.append({"name": name, "rowCount": row_count, "columns": columns})
        return result


def fetch_rows(cfg, table_name: str, mode: str = "top", query_filter: str | None = None, limit: int = 5):
    with _connect(cfg) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = %s",
            (table_name,),
        )
        if not cur.fetchone():
            raise ValueError(f"table '{table_name}' does not exist")

        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_schema = 'public' AND table_name = %s "
            "ORDER BY ordinal_position LIMIT 1",
            (table_name,),
        )
        first_col_row = cur.fetchone()
        first_col = first_col_row["column_name"] if first_col_row else "1"

        order = "DESC" if mode == "latest" else "ASC"
        where_clause = ""
        if mode == "custom" and query_filter and query_filter.strip():
            clean_filter = query_filter.strip()
            for forbidden in ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", ";"]:
                if forbidden in clean_filter.upper():
                    raise ValueError(f"filter clause cannot contain '{forbidden}' keyword")
            if not clean_filter.upper().startswith("WHERE"):
                where_clause = f"WHERE {clean_filter}"
            else:
                where_clause = clean_filter

        query_str = f'SELECT * FROM "{table_name}" {where_clause} ORDER BY "{first_col}" {order} LIMIT %s'
        cur.execute(query_str, (min(limit, 5),))
        rows = [dict(r) for r in cur.fetchall()]
        return rows


import re


def execute_sql(cfg, sql: str, limit: int = 5):
    raw = sql.strip()
    if not raw:
        raise ValueError("SQL query cannot be empty")

    upper = raw.upper()
    if not upper.startswith("SELECT"):
        raise ValueError("Only SELECT queries are allowed")

    forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT", "REVOKE"]
    for word in forbidden:
        if re.search(r"\b" + word + r"\b", upper):
            raise ValueError(f"query cannot contain '{word}' keyword")

    cleaned_sql = raw.rstrip(";").strip()

    if not re.search(r"\bLIMIT\s+\d+\b", cleaned_sql, re.IGNORECASE):
        cleaned_sql += f" LIMIT {min(limit, 5)}"
    else:
        def limit_replacer(match):
            val = int(match.group(1))
            return f"LIMIT {min(val, 5)}"

        cleaned_sql = re.sub(r"\bLIMIT\s+(\d+)\b", limit_replacer, cleaned_sql, flags=re.IGNORECASE)

    with _connect(cfg) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(cleaned_sql)
        rows = [dict(r) for r in cur.fetchall()]
        return rows


def get_recent_activity(cfg):
    try:
        with _connect(cfg) as conn, conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT pid, usename, datname, query, state, "
                "query_start::text AS query_start, "
                "round(extract(epoch from (now() - query_start)) * 1000) AS duration_ms "
                "FROM pg_stat_activity WHERE state IS NOT NULL AND query != '' "
                "AND query NOT LIKE '%pg_stat_activity%' "
                "ORDER BY query_start DESC LIMIT 20"
            )
            return [dict(r) for r in cur.fetchall()]
    except Exception:
        return []




