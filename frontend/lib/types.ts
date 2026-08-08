export type ServiceType = "postgres" | "redis" | "wiremock" | "localstack";

export type ConnectionFields = Record<string, string | number>;

export interface Connection {
  id: string;
  type: ServiceType;
  label: string;
  fields: ConnectionFields;
}

export interface FieldSchemaEntry {
  name: string;
  kind: "text" | "number" | "password";
  default: string | number;
}

export type FieldSchema = Record<ServiceType, FieldSchemaEntry[]>;

export interface StatusEntry {
  id: string;
  type: ServiceType;
  label: string;
  connected: boolean;
  error: string | null;
  latencyMs: number;
  host: string;
  port: number;
}

export interface PgColumn {
  column_name: string;
  data_type: string;
}

export interface PgTable {
  name: string;
  rowCount: number;
  columns: PgColumn[];
}

export interface RedisDb {
  db: number;
  keyCount: number;
  reserved: boolean;
}

export type RedisValueType = "string" | "hash" | "list" | "set" | "zset" | "none";

export interface RedisKeyEntry {
  key: string;
  type: RedisValueType;
  ttl: number;
  preview: unknown;
}

export interface WiremockMapping {
  id: string;
  name: string | null;
  method: string;
  url: string;
  status: number;
  priority: number | null;
  delayMs: number | null;
  insertedOrder?: number;
}

export interface WiremockTryResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  elapsedMs: number;
}

export interface SqsQueue {
  name: string;
  url: string;
  label: string;
  visible: number;
  inFlight: number;
  hasRedrivePolicy: boolean;
}

export interface S3Object {
  key: string;
  sizeBytes: number;
  lastModified: string;
}

export interface S3Bucket {
  name: string;
  createdAt: string;
  objects: S3Object[];
}

export interface SsmParam {
  name: string;
  value: string;
  type: string;
}

export interface MessageVersion {
  id: string;
  label: string;
  body: string;
  createdAt: string;
}

export interface StepDownstream {
  wiremockConn?: string | null;
  wiremockMethod?: string | null;
  wiremockPath?: string | null;
  postgresConn?: string | null;
  postgresSql?: string | null;
  redisConn?: string | null;
  redisAction?: string | null;
  redisKey?: string | null;
  redisValue?: string | null;
}

export interface WorkflowStep {
  id: string;
  queueName: string;
  activeVersionId: string | null;
  versions: MessageVersion[];
  downstream?: StepDownstream | null;
}

export interface Workflow {
  id: string;
  name: string;
  localstackConn: string;
  variables?: Record<string, string>;
  steps: WorkflowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface SendMessageResult {
  messageId: string;
  sentAt: string;
}

export interface WiremockTelemetryItem {
  id: string;
  service: "wiremock";
  time: string;
  method: string;
  url: string;
  status: number;
  stubName: string;
  body?: string;
}

export interface RedisTelemetryItem {
  id: string;
  service: "redis";
  time: string;
  key?: string;
  type?: string;
  command?: string;
  action: string;
  ttl?: number;
  body?: string;
  error?: string;
}

export interface PostgresTelemetryItem {
  id: string;
  service: "postgres";
  time: string;
  query: string;
  durationMs?: number;
  state?: string;
  rowsCount?: number;
  error?: string;
}

export interface LocalstackTelemetryItem {
  id: string;
  service: "localstack";
  time: string;
  action: string;
  queueName: string;
  messageId: string;
  body?: string;
  md5?: string;
}

export interface WorkflowRunSession {
  runId: string;
  startedAt: string;
  sentStepIds: string[];
  status: string;
}

export interface WorkflowTelemetry {
  workflowId: string;
  workflowName: string;
  runId?: string;
  startedAt?: string;
  timestamp: string;
  localstack: LocalstackTelemetryItem[];
  wiremock: WiremockTelemetryItem[];
  redis: RedisTelemetryItem[];
  postgres: PostgresTelemetryItem[];
}
