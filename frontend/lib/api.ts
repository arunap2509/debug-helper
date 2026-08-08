import type {
  Connection,
  ConnectionFields,
  FieldSchema,
  MessageVersion,
  PgTable,
  RedisDb,
  RedisKeyEntry,
  S3Bucket,
  SendMessageResult,
  ServiceType,
  SqsQueue,
  SsmParam,
  StatusEntry,
  WiremockMapping,
  WiremockTryResult,
  Workflow,
  WorkflowRunSession,
} from "./types";

export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => "");
    }
    throw new Error(detail || `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const q = (params: Record<string, string | number | boolean | undefined>) => {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
};

export const api = {
  status: () => request<StatusEntry[]>("/api/status"),

  connections: {
    list: () => request<Connection[]>("/api/connections"),
    schema: () => request<FieldSchema>("/api/connections/schema"),
    create: (type: ServiceType, label: string, fields: ConnectionFields) =>
      request<Connection>("/api/connections", { method: "POST", body: JSON.stringify({ type, label, fields }) }),
    update: (id: string, patch: { label?: string; fields?: ConnectionFields }) =>
      request<Connection>(`/api/connections/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    reset: (id: string) => request<Connection>(`/api/connections/${id}/reset`, { method: "POST" }),
    remove: (id: string) => request<{ deleted: boolean }>(`/api/connections/${id}`, { method: "DELETE" }),
    getVariablePrefixes: () => request<Record<string, string>>("/api/connections/variable-prefixes"),
    setVariablePrefixes: (prefixes: Record<string, string>) =>
      request<Record<string, string>>("/api/connections/variable-prefixes", {
        method: "POST",
        body: JSON.stringify({ prefixes }),
      }),
  },

  postgres: {
    tables: (conn: string, refresh = false) => request<PgTable[]>(`/api/postgres/tables${q({ conn, refresh })}`),
    rows: (conn: string, table: string, mode = "top", filter?: string, limit = 5) =>
      request<Record<string, unknown>[]>(`/api/postgres/rows${q({ conn, table, mode, filter, limit })}`),
    execute: (conn: string, sql: string) =>
      request<Record<string, unknown>[]>("/api/postgres/execute", {
        method: "POST",
        body: JSON.stringify({ conn, sql }),
      }),
  },

  redis: {
    dbs: (conn: string, refresh = false) => request<RedisDb[]>(`/api/redis/dbs${q({ conn, refresh })}`),
    keys: (conn: string, db: number, pattern = "*", refresh = false) =>
      request<RedisKeyEntry[]>(`/api/redis/keys${q({ conn, db, pattern, refresh })}`),
    deleteKey: (conn: string, db: number, key: string) =>
      request<{ deleted: number }>(`/api/redis/key${q({ conn, db, key })}`, { method: "DELETE" }),
    setKey: (conn: string, db: number, key: string, value: string, ttl?: number) =>
      request<{ status: string; key: string }>("/api/redis/key", {
        method: "POST",
        body: JSON.stringify({ conn, db, key, value, ttl }),
      }),
  },

  wiremock: {
    mappings: (conn: string, refresh = false) =>
      request<WiremockMapping[]>(`/api/wiremock/mappings${q({ conn, refresh })}`),
    reset: (conn: string) =>
      request<{ status: string }>(`/api/wiremock/reset${q({ conn })}`, { method: "POST" }),
    try: (payload: { conn: string; method: string; path: string; headers?: Record<string, string>; body?: string }) =>
      request<WiremockTryResult>("/api/wiremock/try", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
  },

  localstack: {
    queues: (conn: string, refresh = false) => request<SqsQueue[]>(`/api/localstack/queues${q({ conn, refresh })}`),
    setQueueLabel: (conn: string, name: string, label: string) =>
      request<{ queueName: string; label: string }>(`/api/localstack/queues/${name}/label${q({ conn })}`, {
        method: "PUT",
        body: JSON.stringify({ label }),
      }),
    purgeQueue: (conn: string, name: string) =>
      request<{ purged: boolean }>(`/api/localstack/queues/${name}/purge${q({ conn })}`, { method: "POST" }),
    createQueue: (conn: string, queueName: string) =>
      request<{ name: string; url: string }>(`/api/localstack/queues${q({ conn })}`, {
        method: "POST",
        body: JSON.stringify({ queueName }),
      }),
    buckets: (conn: string, refresh = false) => request<S3Bucket[]>(`/api/localstack/buckets${q({ conn, refresh })}`),
    createBucket: (conn: string, bucketName: string) =>
      request<{ name: string }>(`/api/localstack/buckets${q({ conn })}`, {
        method: "POST",
        body: JSON.stringify({ bucketName }),
      }),
    ssm: (conn: string, refresh = false) => request<SsmParam[]>(`/api/localstack/ssm${q({ conn, refresh })}`),
    createSsm: (conn: string, name: string, value: string, type = "String") =>
      request<{ name: string; value: string; type: string }>(`/api/localstack/ssm${q({ conn })}`, {
        method: "POST",
        body: JSON.stringify({ name, value, type }),
      }),
  },

  workflows: {
    list: () => request<Workflow[]>("/api/workflows"),
    get: (id: string) => request<Workflow>(`/api/workflows/${id}`),
    create: (name: string, localstackConn: string) =>
      request<Workflow>("/api/workflows", { method: "POST", body: JSON.stringify({ name, localstackConn }) }),
    update: (id: string, patch: { name?: string; localstackConn?: string; variables?: Record<string, string> }) =>
      request<Workflow>(`/api/workflows/${id}`, { method: "PUT", body: JSON.stringify(patch) }),
    remove: (id: string) => request<{ deleted: boolean }>(`/api/workflows/${id}`, { method: "DELETE" }),

    addStep: (id: string, queueName: string, index?: number) =>
      request<Workflow>(`/api/workflows/${id}/steps`, {
        method: "POST",
        body: JSON.stringify({ queueName, index }),
      }),
    removeStep: (id: string, stepId: string) =>
      request<Workflow>(`/api/workflows/${id}/steps/${stepId}`, { method: "DELETE" }),
    moveStep: (id: string, stepId: string, direction: "up" | "down") =>
      request<Workflow>(`/api/workflows/${id}/steps/${stepId}/move`, {
        method: "POST",
        body: JSON.stringify({ direction }),
      }),

    addVersion: (id: string, stepId: string, body: string, label?: string) =>
      request<Workflow>(`/api/workflows/${id}/steps/${stepId}/versions`, {
        method: "POST",
        body: JSON.stringify({ body, label }),
      }),
    removeVersion: (id: string, stepId: string, versionId: string) =>
      request<Workflow>(`/api/workflows/${id}/steps/${stepId}/versions/${versionId}`, { method: "DELETE" }),
    updateVersion: (id: string, stepId: string, versionId: string, label?: string, body?: string) =>
      request<Workflow>(`/api/workflows/${id}/steps/${stepId}/versions/${versionId}`, {
        method: "PUT",
        body: JSON.stringify({ label, body }),
      }),
    setActiveVersion: (id: string, stepId: string, versionId: string) =>
      request<Workflow>(`/api/workflows/${id}/steps/${stepId}/active-version`, {
        method: "PUT",
        body: JSON.stringify({ versionId }),
      }),

    send: (id: string, stepId: string, versionId?: string, overrideBody?: string) =>
      request<SendMessageResult>(`/api/workflows/${id}/steps/${stepId}/send`, {
        method: "POST",
        body: JSON.stringify({ versionId, overrideBody }),
      }),

    getQueuePayloads: (queueName: string) =>
      request<MessageVersion[]>(`/api/workflows/queues/${encodeURIComponent(queueName)}/payloads`),
    getRunSession: (id: string) => request<WorkflowRunSession>(`/api/workflows/${id}/run-session`),
    resetRunSession: (id: string) =>
      request<WorkflowRunSession>(`/api/workflows/${id}/run-session/reset`, { method: "POST" }),
    deleteRunSession: (id: string) =>
      request<{ deleted: boolean }>(`/api/workflows/${id}/run-session`, { method: "DELETE" }),
  },
  events: {
    wiremock: (connId: string, since?: number) =>
      request<any[]>(`/api/events/wiremock?connId=${encodeURIComponent(connId)}${since ? `&since=${since}` : ""}`),
    redis: (connId: string, since?: number) =>
      request<any[]>(`/api/events/redis?connId=${encodeURIComponent(connId)}${since ? `&since=${since}` : ""}`),
    postgres: (connId: string, since?: number) =>
      request<{ containerName: string; since: number; logs: string[] }>(
        `/api/events/postgres?connId=${encodeURIComponent(connId)}${since ? `&since=${since}` : ""}`
      ),
    localstack: (connId: string, since?: number) =>
      request<{ containerName: string; since: number; logs: string[] }>(
        `/api/events/localstack?connId=${encodeURIComponent(connId)}${since ? `&since=${since}` : ""}`
      ),
  },
};
