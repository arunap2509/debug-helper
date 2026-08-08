"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  Check,
  Clock,
  Copy,
  Database,
  Globe,
  Layers,
  Plus,
  RefreshCw,
  Search,
  Server,
  Sliders,
  Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { Connection, ServiceType, WorkflowRunSession } from "@/lib/types";
import { useConnections } from "@/lib/useConnections";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import ConnectionPicker from "@/components/ConnectionPicker";

type EventTab = "postgres" | "localstack" | "redis" | "wiremock";

const TAB_CONFIGS: { id: EventTab; label: string; service: ServiceType }[] = [
  { id: "postgres", label: "Postgres Container Logs", service: "postgres" },
  { id: "localstack", label: "LocalStack Container Logs", service: "localstack" },
  { id: "redis", label: "Redis Slowlog & Events", service: "redis" },
  { id: "wiremock", label: "Wiremock HTTP Requests", service: "wiremock" },
];

function EventsPageContent() {
  const searchParams = useSearchParams();
  const workflowIdParam = searchParams.get("workflowId");

  const [activeTab, setActiveTab] = useState<EventTab>("postgres");
  const [workflowRunSession, setWorkflowRunSession] = useState<WorkflowRunSession | null>(null);

  // Time filter state
  const [timeMode, setTimeMode] = useState<"run" | "5m" | "15m" | "1h" | "manual" | "all">("run");
  const [manualTime, setManualTime] = useState<string>("");
  const [sinceMs, setSinceMs] = useState<number | undefined>(undefined);

  // Search filter
  const [searchQuery, setSearchQuery] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);

  // Data states
  const [logs, setLogs] = useState<any[]>([]);
  const [containerName, setContainerName] = useState<string>("");
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeService = TAB_CONFIGS.find((t) => t.id === activeTab)!.service;
  const { connections, selected, setSelected, loadingConnections } = useConnections(activeService);

  const handleTabChange = (tab: EventTab) => {
    setActiveTab(tab);
    setLogs([]);
    setContainerName("");
    setWarning(null);
    setError(null);
  };

  // Load workflow run session if workflowId is passed in URL
  useEffect(() => {
    if (workflowIdParam) {
      api.workflows
        .getRunSession(workflowIdParam)
        .then((sess) => {
          setWorkflowRunSession(sess);
          if (sess?.startedAtMs) {
            setSinceMs(sess.startedAtMs);
            setTimeMode("run");
          }
        })
        .catch(() => null);
    }
  }, [workflowIdParam]);

  // Re-calculate sinceMs based on timeMode selection
  useEffect(() => {
    const nowMs = Date.now();
    if (timeMode === "run" && workflowRunSession?.startedAtMs) {
      setSinceMs(workflowRunSession.startedAtMs);
    } else if (timeMode === "5m") {
      setSinceMs(nowMs - 5 * 60 * 1000);
    } else if (timeMode === "15m") {
      setSinceMs(nowMs - 15 * 60 * 1000);
    } else if (timeMode === "1h") {
      setSinceMs(nowMs - 60 * 60 * 1000);
    } else if (timeMode === "manual" && manualTime) {
      const parsed = new Date(manualTime).getTime();
      if (!isNaN(parsed)) setSinceMs(parsed);
    } else if (timeMode === "all") {
      setSinceMs(undefined);
    }
  }, [timeMode, manualTime, workflowRunSession]);

  const loadEvents = () => {
    if (!selected) {
      setLogs([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    setWarning(null);

    const sinceParam = sinceMs ? Math.floor(sinceMs / 1000) : undefined;

    if (activeTab === "postgres") {
      api.events
        .postgres(selected, sinceParam)
        .then((res: any) => {
          if (res.warning) {
            setWarning(res.warning);
            setLogs([]);
          } else {
            setContainerName(res.containerName);
            setLogs(res.logs || []);
          }
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else if (activeTab === "localstack") {
      api.events
        .localstack(selected, sinceParam)
        .then((res: any) => {
          if (res.warning) {
            setWarning(res.warning);
            setLogs([]);
          } else {
            setContainerName(res.containerName);
            setLogs(res.logs || []);
          }
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else if (activeTab === "redis") {
      api.events
        .redis(selected, sinceParam)
        .then((res) => {
          setLogs(res || []);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    } else if (activeTab === "wiremock") {
      api.events
        .wiremock(selected, sinceMs)
        .then((res) => {
          setLogs(res || []);
        })
        .catch((e) => setError(String(e)))
        .finally(() => setLoading(false));
    }
  };

  // Auto refresh interval (only when user manually turns ON autoRefresh)
  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      loadEvents();
    }, 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, activeTab, selected, sinceMs]);

  const handleCopyLogs = () => {
    const text = Array.isArray(logs)
      ? logs.map((l) => (typeof l === "string" ? l : JSON.stringify(l, null, 2))).join("\n")
      : "";
    navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 1500);
  };

  // Filter logs by searchQuery
  const filteredLogs = logs.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (typeof item === "string") return item.toLowerCase().includes(q);
    return JSON.stringify(item).toLowerCase().includes(q);
  });

  const activeTheme = SERVICE_THEME[activeService];

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={Activity}
        iconClassName="bg-cyan-500/15 text-cyan-400"
        title="Live Container & Service Logs"
        subtitle="Un-truncated live subprocess docker logs and service event streams."
        action={
          <div className="flex items-center gap-3">
            <Button variant="primary" onClick={loadEvents} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Fetch Logs
            </Button>
            <Button
              variant={autoRefresh ? "success" : "default"}
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="text-xs"
            >
              <Clock className="h-3.5 w-3.5" />
              {autoRefresh ? "Auto-Refresh ON" : "Auto-Refresh OFF"}
            </Button>
          </div>
        }
      />

      {/* Tabs Row */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-800 pb-3 gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {TAB_CONFIGS.map((t) => {
            const isActive = activeTab === t.id;
            const theme = SERVICE_THEME[t.service];
            return (
              <button
                key={t.id}
                onClick={() => handleTabChange(t.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all border ${
                  isActive
                    ? `${theme.activeNav} border-slate-700 shadow-md font-bold`
                    : "border-slate-800/80 bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                }`}
              >
                <theme.icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Connection Picker for active tab */}
        {connections && connections.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <span className="font-semibold">Target Connection:</span>
            <ConnectionPicker connections={connections} selected={selected} onChange={setSelected} />
          </div>
        )}
      </div>

      {/* Time Filter Controls Bar */}
      <Card className="p-4 border-slate-800 bg-slate-900/40 backdrop-blur-xl space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-cyan-400" />
              Log Timestamp Filter:
            </span>

            {workflowRunSession?.startedAtMs && (
              <button
                onClick={() => setTimeMode("run")}
                className={`rounded-lg px-2.5 py-1 font-mono transition-all border ${
                  timeMode === "run"
                    ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold"
                    : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
                }`}
              >
                Since Workflow Run Start
              </button>
            )}

            <button
              onClick={() => setTimeMode("5m")}
              className={`rounded-lg px-2.5 py-1 font-mono transition-all border ${
                timeMode === "5m"
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 font-bold"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
              }`}
            >
              Last 5m
            </button>

            <button
              onClick={() => setTimeMode("15m")}
              className={`rounded-lg px-2.5 py-1 font-mono transition-all border ${
                timeMode === "15m"
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 font-bold"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
              }`}
            >
              Last 15m
            </button>

            <button
              onClick={() => setTimeMode("1h")}
              className={`rounded-lg px-2.5 py-1 font-mono transition-all border ${
                timeMode === "1h"
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 font-bold"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
              }`}
            >
              Last 1h
            </button>

            <button
              onClick={() => setTimeMode("all")}
              className={`rounded-lg px-2.5 py-1 font-mono transition-all border ${
                timeMode === "all"
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 font-bold"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
              }`}
            >
              All Time
            </button>

            <button
              onClick={() => setTimeMode("manual")}
              className={`rounded-lg px-2.5 py-1 font-mono transition-all border ${
                timeMode === "manual"
                  ? "border-cyan-500 bg-cyan-500/20 text-cyan-300 font-bold"
                  : "border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700"
              }`}
            >
              Custom Date/Time
            </button>
          </div>

          {timeMode === "manual" && (
            <div className="flex items-center gap-2">
              <input
                type="datetime-local"
                value={manualTime}
                onChange={(e) => setManualTime(e.target.value)}
                className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-200 focus:border-cyan-500 focus:outline-none"
              />
            </div>
          )}
        </div>

        {sinceMs && (
          <div className="text-[11px] text-slate-400 font-mono flex items-center gap-2 pt-1 border-t border-slate-800/60">
            <span>Filter Active: Logs since {new Date(sinceMs).toLocaleString()}</span>
            <Badge tone="blue">UNIX: {Math.floor(sinceMs / 1000)}s</Badge>
          </div>
        )}
      </Card>

      {/* Main Logs View Container */}
      <Card className="p-5 border-slate-800 bg-slate-950/80 backdrop-blur-xl space-y-4">
        {/* Search & Actions Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search logs in real-time..."
              className="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-9 pr-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-cyan-500 focus:outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-3">
            <Badge tone="neutral">{filteredLogs.length} Entries</Badge>
            <Button variant="default" onClick={handleCopyLogs} disabled={filteredLogs.length === 0}>
              {copiedLogs ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
              Copy All Logs
            </Button>
          </div>
        </div>

        {error && <ErrorBox message={error} />}

        {loadingConnections ? (
          <div className="flex items-center justify-center p-12 text-xs text-slate-500 gap-2">
            <Spinner />
            <span>Loading target connections...</span>
          </div>
        ) : warning ? (
          <Card className="p-8 text-center space-y-4 max-w-xl mx-auto border-dashed border-amber-500/40 bg-amber-950/20">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertCircle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">No Container Name Configured</h3>
              <p className="text-xs text-slate-400 mt-1">{warning}</p>
            </div>
            <Link href="/admin">
              <Button variant="primary">
                <Plus className="h-3.5 w-3.5" />
                Configure Container Name in Admin
              </Button>
            </Link>
          </Card>
        ) : connections && connections.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            No connections configured for {activeTab}. Configure a connection in Admin to view logs.
          </div>
        ) : (
          <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 font-mono text-xs overflow-x-auto max-h-[600px] space-y-1 text-slate-300">
            {containerName && (
              <div className="text-[11px] font-bold text-cyan-400 pb-2 border-b border-slate-800 mb-2">
                Subprocess Command: docker logs --since {sinceMs ? Math.floor(sinceMs / 1000) : 0} {containerName}
              </div>
            )}

            {filteredLogs.length === 0 ? (
              <div className="p-8 text-center text-slate-500 font-sans">
                No logs recorded since {sinceMs ? new Date(sinceMs).toLocaleTimeString() : "start"}.
              </div>
            ) : (
              filteredLogs.map((item, idx) => {
                if (typeof item === "string") {
                  return (
                    <div key={idx} className="hover:bg-slate-900/60 py-0.5 px-1 rounded flex items-start gap-3">
                      <span className="text-slate-600 select-none w-8 text-right shrink-0">{idx + 1}</span>
                      <span className="break-all whitespace-pre-wrap font-mono">{item}</span>
                    </div>
                  );
                }

                // Render JSON log objects (Wiremock / Redis slowlogs)
                return (
                  <div key={item.id || idx} className="hover:bg-slate-900/60 p-2 rounded border border-slate-800/80 mb-2 space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="font-bold text-cyan-300">{item.action || item.command || item.method}</span>
                      <span>{item.time || (item.loggedDate ? new Date(item.loggedDate).toLocaleString() : "")}</span>
                    </div>
                    <pre className="text-[11px] text-slate-200 overflow-x-auto p-2 bg-slate-900/90 rounded border border-slate-800">
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  </div>
                );
              })
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

export default function EventsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12 text-xs text-slate-500 gap-2">
          <Spinner />
          <span>Loading live events...</span>
        </div>
      }
    >
      <EventsPageContent />
    </Suspense>
  );
}
