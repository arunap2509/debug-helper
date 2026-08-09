"use client";

import { useEffect, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Sliders,
  Trash2,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { invalidateConnectionsCache } from "@/lib/useConnections";
import { Connection, FieldSchema, ServiceType, StatusEntry } from "@/lib/types";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";

const CONSTANTS = {
  SAVED_TOAST_DURATION_MS: 2000,
  DEFAULT_SERVICE_TYPE: "postgres" as ServiceType,
  LABELS: {
    PAGE_TITLE: "Admin & Connections",
    PAGE_SUBTITLE: "Manage target service endpoints, update connection parameters, and monitor live health status.",
    ADD_CONNECTION: "Add Connection",
    NEW_CONNECTION_TITLE: "Create New Connection",
    DELETE_MODAL_TITLE: "Confirm Deletion",
    RESET_MODAL_TITLE: "Reset Connection Defaults",
    STATUS_ONLINE: "Online",
    STATUS_OFFLINE: "Offline / Error",
  },
} as const;

const TYPES = Object.keys(SERVICE_THEME) as ServiceType[];

function toDraft(fields: Record<string, string | number>): Record<string, string> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, String(v)]));
}

type AdminTab = ServiceType | "prefixes";

export default function AdminPage() {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const [statuses, setStatuses] = useState<Record<string, StatusEntry>>({});
  const [schema, setSchema] = useState<FieldSchema | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Record<string, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [visiblePasswords, setVisiblePasswords] = useState<Record<string, boolean>>({});

  // Active Admin Tab (Postgres, Redis, Wiremock, LocalStack, or Workflow Prefixes)
  const [activeTab, setActiveTab] = useState<AdminTab>(CONSTANTS.DEFAULT_SERVICE_TYPE);

  // Modal states for Create, Delete, and Reset
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newType, setNewType] = useState<ServiceType>(CONSTANTS.DEFAULT_SERVICE_TYPE);
  const [newLabel, setNewLabel] = useState("");
  const [newFields, setNewFields] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);

  const [confirmDeleteConn, setConfirmDeleteConn] = useState<Connection | null>(null);

  const load = (refresh = false) => {
    if (refresh) setBusyId("global-refresh");
    else setLoading(true);

    Promise.all([api.connections.list(), api.connections.schema(), api.status()])
      .then(([conns, sch, stats]) => {
        setConnections(conns);
        setSchema(sch);

        const statusMap: Record<string, StatusEntry> = {};
        for (const s of stats) {
          statusMap[s.id] = s;
        }
        setStatuses(statusMap);

        setDrafts(Object.fromEntries(conns.map((c) => [c.id, toDraft(c.fields)])));
        setNewFields(Object.fromEntries(sch[newType].map((f) => [f.name, String(f.default)])));
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        setLoading(false);
        setBusyId(null);
      });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectNewType = (type: ServiceType) => {
    setNewType(type);
    if (schema) {
      setNewFields(Object.fromEntries(schema[type].map((f) => [f.name, String(f.default)])));
    }
  };

  const handleCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const togglePasswordVisibility = (fieldKey: string) => {
    setVisiblePasswords((prev) => ({ ...prev, [fieldKey]: !prev[fieldKey] }));
  };

  const handleSave = async (conn: Connection) => {
    setBusyId(conn.id);
    setSavedId(null);
    try {
      const draft = drafts[conn.id];
      const fields: Record<string, string | number> = {};
      for (const fieldSchema of schema![conn.type]) {
        const raw = draft[fieldSchema.name];
        fields[fieldSchema.name] = fieldSchema.kind === "number" ? Number(raw) : raw;
      }
      const updated = await api.connections.update(conn.id, { fields });
      setConnections((cs) => cs!.map((c) => (c.id === conn.id ? updated : c)));
      invalidateConnectionsCache();

      const stats = await api.status();
      const statusMap: Record<string, StatusEntry> = {};
      for (const s of stats) statusMap[s.id] = s;
      setStatuses(statusMap);

      setSavedId(conn.id);
      setError(null);
      setTimeout(() => setSavedId(null), CONSTANTS.SAVED_TOAST_DURATION_MS);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!confirmDeleteConn) return;
    const conn = confirmDeleteConn;
    setBusyId(conn.id);
    setConfirmDeleteConn(null);
    try {
      await api.connections.remove(conn.id);
      setConnections((cs) => cs!.filter((c) => c.id !== conn.id));
      invalidateConnectionsCache();
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const fieldSchema = schema![newType];
      const fields: Record<string, string | number> = {};
      for (const f of fieldSchema) {
        fields[f.name] = f.kind === "number" ? Number(newFields[f.name]) : newFields[f.name];
      }
      const created = await api.connections.create(newType, newLabel || SERVICE_THEME[newType].label, fields);
      setConnections((cs) => [...(cs ?? []), created]);
      invalidateConnectionsCache();
      setDrafts((d) => ({ ...d, [created.id]: toDraft(created.fields) }));

      const stats = await api.status();
      const statusMap: Record<string, StatusEntry> = {};
      for (const s of stats) statusMap[s.id] = s;
      setStatuses(statusMap);

      setNewLabel("");
      setIsCreateOpen(false);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  if (loading && !connections) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Spinner />
        <p className="text-sm text-slate-400">Loading service connections & status...</p>
      </div>
    );
  }

  const isPrefixesTab = activeTab === "prefixes";
  const activeTheme = isPrefixesTab ? SERVICE_THEME.postgres : SERVICE_THEME[activeTab];
  const ActiveIcon = activeTheme.icon;
  const activeConnections = isPrefixesTab ? [] : (connections ?? []).filter((c) => c.type === activeTab);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <PageHeader
        title={CONSTANTS.LABELS.PAGE_TITLE}
        subtitle={CONSTANTS.LABELS.PAGE_SUBTITLE}
        icon={Server}
        iconClassName="bg-indigo-500/15 text-indigo-400"
        action={
          <div className="flex items-center gap-3">
            <Button variant="default" onClick={() => load(true)} disabled={busyId === "global-refresh"}>
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${busyId === "global-refresh" ? "animate-spin" : ""}`} />
              Test Connection Health
            </Button>
            {!isPrefixesTab && (
              <Button
                variant="primary"
                onClick={() => {
                  selectNewType(isPrefixesTab ? "postgres" : activeTab);
                  setIsCreateOpen(true);
                }}
              >
                <Plus className="h-4 w-4" />
                {CONSTANTS.LABELS.ADD_CONNECTION}
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {/* Admin Navigation Tabs (Service Connections & Workflow Prefixes) */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        {TYPES.map((type) => {
          const theme = SERVICE_THEME[type];
          const Icon = theme.icon;
          const count = (connections ?? []).filter((c) => c.type === type).length;
          const isActive = activeTab === type;

          return (
            <button
              key={type}
              onClick={() => setActiveTab(type)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                isActive
                  ? `${theme.activeNav} border border-slate-700/60 shadow-md`
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
              }`}
            >
              <Icon className={`h-4 w-4 ${theme.iconText}`} />
              <span>{theme.label}</span>
              <span
                className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                  isActive ? "bg-slate-950/60 text-slate-200" : "bg-slate-800 text-slate-400"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}

        {/* Dedicated Tab for Workflow Variable Prefixes */}
        <button
          onClick={() => setActiveTab("prefixes")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
            isPrefixesTab
              ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md font-bold"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
          }`}
        >
          <Sliders className="h-4 w-4 text-amber-400" />
          <span>Workflow Variable Prefixes</span>
          <Badge tone="amber">Admin Settings</Badge>
        </button>
      </div>

      {/* Main Tab Content */}
      {isPrefixesTab ? (
        <VariablePrefixesAdminTable />
      ) : (
        /* Selected Service Section */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${activeTheme.iconBg} border border-slate-700/40`}
              >
                <ActiveIcon className={`h-3.5 w-3.5 ${activeTheme.iconText}`} />
              </span>
              <h2 className="text-sm font-semibold tracking-tight text-slate-200">
                {activeTheme.label} Connections ({activeConnections.length})
              </h2>
            </div>
          </div>

          {activeConnections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-900/20 p-8 text-center">
              <p className="text-xs text-slate-500">No {activeTheme.label} connections configured.</p>
              <div className="mt-3">
                <Button
                  variant="primary"
                  onClick={() => {
                    selectNewType(isPrefixesTab ? "postgres" : activeTab);
                    setIsCreateOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add {activeTheme.label} Connection
                </Button>
              </div>
            </div>
          ) : (
            /* Cards Grid for selected Service tab */
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {activeConnections.map((conn) => {
                const isDefault = conn.id === conn.type;
                const isSaved = savedId === conn.id;
                const status = statuses[conn.id];

                return (
                  <Card
                    key={conn.id}
                    className="group flex flex-col justify-between p-6 border-slate-800/90 bg-slate-900/60 backdrop-blur-xl hover:border-slate-700 transition-all duration-200 shadow-xl shadow-black/40"
                  >
                    <div className="space-y-5">
                      {/* Card Header & Health Status */}
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h3 className="truncate font-semibold text-base text-slate-100 group-hover:text-indigo-200 transition-colors">
                              {conn.label}
                            </h3>
                            {isDefault && (
                              <span className="shrink-0 rounded-md bg-indigo-500/10 px-2 py-0.5 text-xs font-medium text-indigo-400 border border-indigo-500/20">
                                Default Stack
                              </span>
                            )}
                          </div>
                          <div className="mt-1 truncate font-mono text-xs text-slate-400">ID: {conn.id}</div>
                        </div>

                        {/* Live Connection Status Badge */}
                        <div className="shrink-0">
                          {status ? (
                            status.connected ? (
                              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 border border-emerald-500/20 shadow-sm">
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                                <span>{CONSTANTS.LABELS.STATUS_ONLINE}</span>
                                <span className="font-mono text-[11px] text-emerald-400/80">({status.latencyMs}ms)</span>
                              </div>
                            ) : (
                              <div
                                className="flex items-center gap-1.5 rounded-xl bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 border border-rose-500/20"
                                title={status.error ?? "Connection failed"}
                              >
                                <WifiOff className="h-3.5 w-3.5 text-rose-400" />
                                <span>{CONSTANTS.LABELS.STATUS_OFFLINE}</span>
                              </div>
                            )
                          ) : (
                            <div className="flex items-center gap-1.5 rounded-xl bg-slate-800/60 px-3 py-1.5 text-xs text-slate-400">
                              <Spinner /> Checking...
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Unreachable Status Error Box */}
                      {status && !status.connected && status.error && (
                        <div className="rounded-lg border border-rose-900/40 bg-rose-950/20 p-2.5 text-xs font-mono text-rose-300 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                          <span className="break-all">{status.error}</span>
                        </div>
                      )}

                      {/* Dynamic Form Inputs */}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {schema![conn.type].map((f) => {
                          const fieldKey = `${conn.id}:${f.name}`;
                          const isPassword = f.kind === "password";
                          const isVisible = visiblePasswords[fieldKey];
                          const currentValue = drafts[conn.id]?.[f.name] ?? "";

                          return (
                            <div key={f.name} className="space-y-1.5">
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-mono text-slate-300 text-xs uppercase tracking-wider font-semibold">
                                  {f.name.replace(/_/g, " ")}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleCopy(fieldKey, currentValue)}
                                  className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-200 transition-colors"
                                  title="Copy field value"
                                >
                                  {copiedField === fieldKey ? (
                                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                                  ) : (
                                    <Copy className="h-3.5 w-3.5" />
                                  )}
                                </button>
                              </div>

                              <div className="relative">
                                <input
                                  type={isPassword && !isVisible ? "password" : "text"}
                                  value={currentValue}
                                  onChange={(e) =>
                                    setDrafts((d) => ({
                                      ...d,
                                      [conn.id]: { ...d[conn.id], [f.name]: e.target.value },
                                    }))
                                  }
                                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-all pr-9 shadow-inner"
                                />
                                {isPassword && (
                                  <button
                                    type="button"
                                    onClick={() => togglePasswordVisibility(fieldKey)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                                  >
                                    {isVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Card Actions Footer */}
                    <div className="mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4">
                      <div className="flex items-center gap-3">
                        <Button
                          variant="primary"
                          onClick={() => handleSave(conn)}
                          disabled={busyId === conn.id}
                        >
                          {busyId === conn.id ? <Spinner /> : <Save className="h-4 w-4" />}
                          Save Changes
                        </Button>
                        {isSaved && (
                          <span className="flex items-center gap-1 text-xs font-medium text-emerald-400 animate-fade-in">
                            <CheckCircle2 className="h-4 w-4" /> Saved!
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="danger"
                          onClick={() => setConfirmDeleteConn(conn)}
                          disabled={busyId === conn.id}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* CREATE CONNECTION MODAL */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">
                    {CONSTANTS.LABELS.NEW_CONNECTION_TITLE}
                  </h3>
                  <p className="text-xs text-slate-400">Select target service type and configure endpoints</p>
                </div>
              </div>
              <button
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Service Type Selector Cards */}
            <div className="grid grid-cols-2 gap-2.5">
              {TYPES.map((t) => {
                const theme = SERVICE_THEME[t];
                const Icon = theme.icon;
                const isSelected = newType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => selectNewType(t)}
                    className={`flex items-center gap-2.5 rounded-xl border p-3 text-left transition-all ${
                      isSelected
                        ? "border-indigo-500/80 bg-indigo-500/10 text-slate-100 shadow-md"
                        : "border-slate-800 bg-slate-950/40 text-slate-400 hover:border-slate-700 hover:bg-slate-900"
                    }`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${theme.iconBg}`}>
                      <Icon className={`h-3.5 w-3.5 ${theme.iconText}`} />
                    </span>
                    <span className="text-xs font-medium">{theme.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Form inputs */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Connection Label</label>
                <input
                  type="text"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  placeholder={`e.g. ${SERVICE_THEME[newType].label} (Staging)`}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {schema &&
                schema[newType].map((f) => (
                  <div key={f.name} className="space-y-1">
                    <label className="text-xs font-medium text-slate-300 uppercase tracking-wider text-[10px]">
                      {f.name.replace(/_/g, " ")}
                    </label>
                    <input
                      type={f.kind === "password" ? "password" : "text"}
                      value={newFields[f.name] ?? ""}
                      onChange={(e) => setNewFields((v) => ({ ...v, [f.name]: e.target.value }))}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                ))}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <Button onClick={() => setIsCreateOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreate} disabled={creating}>
                {creating ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                Create Connection
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE MODAL */}
      {confirmDeleteConn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/50 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">{CONSTANTS.LABELS.DELETE_MODAL_TITLE}</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              Are you sure you want to remove the custom connection &quot;
              <strong className="text-slate-100 font-mono">{confirmDeleteConn.label}</strong>&quot; (ID:{" "}
              <code className="text-rose-300">{confirmDeleteConn.id}</code>)?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button onClick={() => setConfirmDeleteConn(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteConfirmed}>
                Confirm Delete
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function VariablePrefixesAdminTable() {
  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newPrefix, setNewPrefix] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.connections.getVariablePrefixes()
      .then((p) => setPrefixes(p ?? {}))
      .catch((e) => console.error(e))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (updated: Record<string, string>) => {
    setSaving(true);
    try {
      const result = await api.connections.setVariablePrefixes(updated);
      setPrefixes(result ?? {});
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newKey.trim()) return;
    const cleanKey = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const updated = { ...prefixes, [cleanKey]: newPrefix.trim() };
    setNewKey("");
    setNewPrefix("");
    handleSave(updated);
  };

  const handleRemove = (keyToRemove: string) => {
    const updated = { ...prefixes };
    delete updated[keyToRemove];
    handleSave(updated);
  };

  const entries = Object.entries(prefixes);

  return (
    <Card className="p-6 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Sliders className="h-4 w-4 text-amber-400" />
            Global Workflow Variable Prefixes
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure default constant prefixes for workflow variables (e.g. <code className="font-mono text-amber-300">ASSET_ID</code> prefix: <code className="font-mono text-amber-300">AST-REG-2026-</code>).
          </p>
        </div>
        <Badge tone="amber">{entries.length} Prefixes Set</Badge>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-4 text-xs text-slate-500">
          <Spinner />
          <span>Loading variable prefixes...</span>
        </div>
      ) : (
        <div className="space-y-3">
          {entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-xs text-slate-500">
              No variable prefixes configured yet. Add default prefixes below!
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <table className="w-full text-left text-xs font-mono">
                <thead className="border-b border-slate-800 bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="px-4 py-2.5 font-semibold">Placeholder Key</th>
                    <th className="px-4 py-2.5 font-semibold">Constant Prefix</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {entries.map(([k, pfx]) => (
                    <tr key={k} className="hover:bg-slate-900/40">
                      <td className="px-4 py-2.5 font-bold text-emerald-400">{"{{"}{k}{"}}"}</td>
                      <td className="px-4 py-2.5">
                        <input
                          type="text"
                          value={pfx}
                          onChange={(e) => {
                            const updated = { ...prefixes, [k]: e.target.value };
                            setPrefixes(updated);
                          }}
                          onBlur={() => handleSave(prefixes)}
                          className="w-full rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none"
                        />
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={() => handleRemove(k)}
                          className="rounded p-1 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Prefix"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add New Prefix Row */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Variable Key (e.g. ASSET_ID)"
              className="w-48 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <input
              type="text"
              value={newPrefix}
              onChange={(e) => setNewPrefix(e.target.value)}
              placeholder="Default Prefix (e.g. AST-REG-2026-)"
              className="flex-1 min-w-[200px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-amber-500 focus:outline-none"
            />
            <Button variant="primary" onClick={handleAdd} disabled={saving || !newKey.trim()}>
              {saving ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
              Add Prefix Rule
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
