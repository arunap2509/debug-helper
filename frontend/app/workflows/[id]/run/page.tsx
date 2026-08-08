"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Code,
  Database,
  Globe,
  Layers,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sliders,
  Trash2,
  Workflow as WorkflowIcon,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { SendMessageResult, Workflow, WorkflowTelemetry } from "@/lib/types";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import { JsonEditor, jsonValidity } from "@/components/CodeEditor";

const CONSTANTS = {
  LABELS: {
    PAGE_TITLE: "Workflow Queue Runner",
    NO_VERSIONS_WARNING: "No message versions configured for this step. Please add versions on the Workflows page.",
  },
} as const;

export default function WorkflowRunPage() {
  const params = useParams<{ id: string }>();
  const workflowId = params.id;

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [stepIndex, setStepIndex] = useState(0);

  // Selected message body text & active version index per step
  const [activeVersionIndexByStep, setActiveVersionIndexByStep] = useState<Record<string, number>>({});
  const [customBodyByStep, setCustomBodyByStep] = useState<Record<string, string>>({});
  const [sentByStep, setSentByStep] = useState<Record<string, SendMessageResult>>({});
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [telemetryKey, setTelemetryKey] = useState(0);
  const [purging, setPurging] = useState(false);
  const [purgedQueue, setPurgedQueue] = useState<string | null>(null);

  const handlePurgeQueue = async () => {
    if (!step?.queueName) return;
    setPurging(true);
    try {
      await api.localstack.purgeQueue("localstack", step.queueName);
      setPurgedQueue(step.queueName);
      setTelemetryKey((k) => k + 1);
      setTimeout(() => setPurgedQueue(null), 2500);
    } catch (e) {
      console.error("Purge queue error:", e);
    } finally {
      setPurging(false);
    }
  };

  useEffect(() => {
    Promise.all([
      api.workflows.get(workflowId),
      api.workflows.resetRunSession(workflowId).catch(() => null),
    ])
      .then(([wf]) => {
        setWorkflow(wf);

        // Pre-fill active version indices & user bodies
        const initialIndices: Record<string, number> = {};
        const initialBodies: Record<string, string> = {};

        wf.steps.forEach((s) => {
          let selectedIdx = 0;
          if (s.activeVersionId) {
            const foundIdx = s.versions.findIndex((v) => v.id === s.activeVersionId);
            if (foundIdx >= 0) selectedIdx = foundIdx;
          }
          initialIndices[s.id] = selectedIdx;
          initialBodies[s.id] = s.versions[selectedIdx]?.body ?? "";
        });

        setActiveVersionIndexByStep(initialIndices);
        setCustomBodyByStep(initialBodies);
        setSentByStep({});
        setTelemetryKey((k) => k + 1);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [workflowId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
        <Spinner />
        <span>Loading workflow execution runner...</span>
      </div>
    );
  }

  if (error || !workflow) {
    return <ErrorBox message={error ?? "Workflow not found"} />;
  }

  if (workflow.steps.length === 0) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorBox message="This workflow has no queue steps. Add steps from the Workflows page first." />
      </div>
    );
  }

  const step = workflow.steps[stepIndex];
  const activeVersionIdx = activeVersionIndexByStep[step.id] ?? 0;
  const currentBody = customBodyByStep[step.id] ?? "";
  const bodyCheck = jsonValidity(currentBody);
  const sentCount = Object.keys(sentByStep).length;

  // Use ONLY user-provided versions for this step
  const userVersions = step.versions ?? [];

  const handleSelectVersion = (idx: number) => {
    setActiveVersionIndexByStep((prev) => ({ ...prev, [step.id]: idx }));
    const chosen = userVersions[idx];
    setCustomBodyByStep((prev) => ({ ...prev, [step.id]: chosen ? chosen.body : "" }));
  };

  const handleSend = async () => {
    if (!bodyCheck.valid || !currentBody.trim()) return;
    setSending(true);
    setSendError(null);
    try {
      const selectedVersion = userVersions[activeVersionIdx];
      const versionIdToSend = selectedVersion?.id ?? step.activeVersionId ?? undefined;

      if (selectedVersion?.id) {
        await api.workflows.updateVersion(workflow.id, step.id, selectedVersion.id, selectedVersion.label, currentBody);
      }

      const result = await api.workflows.send(workflow.id, step.id, versionIdToSend, currentBody);
      setSentByStep((s) => ({ ...s, [step.id]: result }));
      setTelemetryKey((k) => k + 1);

      // Automatically advance to next step in workflow if not on last step
      if (stepIndex < workflow.steps.length - 1) {
        setStepIndex((idx) => idx + 1);
      }
    } catch (e) {
      setSendError(String(e));
    } finally {
      setSending(false);
    }
  };

  const restart = async () => {
    if (!workflow) return;
    try {
      await api.workflows.resetRunSession(workflow.id);
    } catch (e) {
      console.error("Failed to reset run session:", e);
    }
    setSentByStep({});
    setStepIndex(0);
    setSendError(null);
    setTelemetryKey((k) => k + 1);
  };

  const handleDeleteRun = async () => {
    if (!workflow) return;
    try {
      await api.workflows.deleteRunSession(workflow.id);
    } catch (e) {
      console.error("Failed to delete run session:", e);
    }
    setSentByStep({});
    setStepIndex(0);
    setSendError(null);
    setTelemetryKey((k) => k + 1);
  };

  return (
    <div className="space-y-6 pb-12">
      <BackLink />

      <PageHeader
        icon={WorkflowIcon}
        iconClassName="bg-emerald-500/15 text-emerald-400"
        title={workflow.name}
        subtitle={`Queue Step ${stepIndex + 1} of ${workflow.steps.length}`}
        action={
          <div className="flex items-center gap-2.5">
            <Badge tone={sentCount === workflow.steps.length ? "green" : "neutral"}>
              {sentCount}/{workflow.steps.length} sent
            </Badge>
            <Button variant="default" onClick={restart}>
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              Reset Pipeline
            </Button>
            <Button variant="danger" onClick={handleDeleteRun}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete Run Session
            </Button>
          </div>
        }
      />

      {/* Pipeline Progress Stepper */}
      <div className="flex flex-wrap items-center gap-2">
        {workflow.steps.map((s, i) => {
          const sent = Boolean(sentByStep[s.id]);
          const active = i === stepIndex;

          return (
            <button
              key={s.id}
              onClick={() => setStepIndex(i)}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-mono transition-all ${
                active
                  ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-300 shadow-sm font-semibold"
                  : sent
                  ? "border-slate-800 bg-slate-900/80 text-emerald-400"
                  : "border-slate-800/80 bg-slate-950/60 text-slate-400 hover:border-slate-700"
              }`}
            >
              {sent ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <span className="flex h-4 w-4 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold">
                  {i + 1}
                </span>
              )}
              <span>{s.queueName}</span>
            </button>
          );
        })}
      </div>

      {/* Workflow Variables Run Bar */}
      <WorkflowVariablesRunBar workflow={workflow} onUpdate={setWorkflow} />

      {/* Main Execution Card */}
      <Card className="p-6 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl space-y-5">
        {/* Step Destination Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Target Queue Listener</div>
            <div className="font-mono text-lg font-bold text-slate-100 flex flex-wrap items-center gap-2">
              <span>{step.queueName}</span>
              <Badge tone="blue">SQS Queue</Badge>

              <Button
                variant="danger"
                onClick={handlePurgeQueue}
                disabled={purging}
                className="ml-2 py-1 px-2.5 text-xs"
              >
                {purging ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
                Purge Queue
              </Button>
              {purgedQueue === step.queueName && (
                <span className="flex items-center gap-1 text-xs font-semibold text-rose-400 animate-fade-in">
                  <Check className="h-3.5 w-3.5 text-rose-400" /> Queue Purged!
                </span>
              )}
            </div>
          </div>

          {sentByStep[step.id] && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2 text-right text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-300">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                Dispatched to Listener
              </div>
              <div className="font-mono text-[11px] text-slate-400 mt-0.5">
                Message ID: <span className="text-slate-200">{sentByStep[step.id].messageId}</span>
              </div>
            </div>
          )}
        </div>

        {/* User-Configured Message Versions Selector */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-emerald-400" />
              Configured Message Versions
            </span>
            <span className="text-[11px] text-slate-500">{userVersions.length} Version(s) Configured</span>
          </div>

          {userVersions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-800 bg-slate-950 p-4 text-xs text-slate-500">
              {CONSTANTS.LABELS.NO_VERSIONS_WARNING}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {userVersions.map((v, idx) => {
                const isActive = activeVersionIdx === idx;
                const isDefault = v.id === step.activeVersionId;

                return (
                  <button
                    key={v.id}
                    onClick={() => handleSelectVersion(idx)}
                    className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-left text-xs font-mono transition-all border ${
                      isActive
                        ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-200 shadow-sm"
                        : "border-slate-800 bg-slate-950/80 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                    }`}
                  >
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-slate-800 text-[9px] font-bold text-slate-300">
                      v{idx + 1}
                    </span>
                    <span className="font-semibold">{v.label}</span>
                    {isDefault && <Badge tone="amber">default</Badge>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* JSON Payload Editor / Inspector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Code className="h-3.5 w-3.5 text-emerald-400" />
              Message Payload JSON
            </span>
            {userVersions[activeVersionIdx] && (
              <span className="text-[11px] text-slate-500">
                Active: {userVersions[activeVersionIdx].label}
              </span>
            )}
          </div>

          <JsonEditor
            value={currentBody}
            onChange={(val) => setCustomBodyByStep((prev) => ({ ...prev, [step.id]: val }))}
            height="320px"
          />

          {!bodyCheck.valid && (
            <p className="text-[11px] text-rose-400">{bodyCheck.message}</p>
          )}
        </div>

        {sendError && <ErrorBox message={sendError} />}

        {/* Action Controls */}
        <div className="flex items-center justify-between border-t border-slate-800 pt-4">
          <div className="flex items-center gap-2">
            <Button onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous Step
            </Button>
            <Button
              onClick={() => setStepIndex((i) => Math.min(workflow.steps.length - 1, i + 1))}
              disabled={stepIndex === workflow.steps.length - 1}
            >
              Next Step
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Button
            variant="primary"
            onClick={handleSend}
            disabled={sending || !bodyCheck.valid || !currentBody.trim()}
          >
            {sending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
            Send to {step.queueName}
          </Button>
        </div>
      </Card>

      {/* Live Cross-Service Telemetry Audit Log */}
      <WorkflowTelemetryPanel workflowId={workflow.id} refreshKey={telemetryKey} />
    </div>
  );
}

function WorkflowTelemetryPanel({ workflowId, refreshKey }: { workflowId: string; refreshKey?: number }) {
  const [telemetry, setTelemetry] = useState<WorkflowTelemetry | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "localstack" | "wiremock" | "redis" | "postgres">("all");
  const [filterText, setFilterText] = useState("");

  const loadTelemetry = async () => {
    setLoading(true);
    try {
      const res = await api.workflows.getTelemetry(workflowId);
      if (res) setTelemetry(res);
    } catch {
      // Fail-safe silent catch for background polling
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTelemetry();
    const timer = setInterval(() => {
      loadTelemetry();
    }, 3000);
    return () => clearInterval(timer);
  }, [workflowId, refreshKey]);

  const localstackList = telemetry?.localstack?.filter(
    (l) =>
      !filterText.trim() ||
      l.queueName.toLowerCase().includes(filterText.toLowerCase()) ||
      (l.body && l.body.toLowerCase().includes(filterText.toLowerCase()))
  ) ?? [];
  const wiremockList = telemetry?.wiremock?.filter(
    (w) =>
      !filterText.trim() ||
      w.url.toLowerCase().includes(filterText.toLowerCase()) ||
      w.stubName.toLowerCase().includes(filterText.toLowerCase())
  ) ?? [];
  const redisList = telemetry?.redis?.filter(
    (r) =>
      !filterText.trim() ||
      (r.key && r.key.toLowerCase().includes(filterText.toLowerCase())) ||
      (r.command && r.command.toLowerCase().includes(filterText.toLowerCase()))
  ) ?? [];
  const postgresList = telemetry?.postgres?.filter(
    (p) => !filterText.trim() || p.query.toLowerCase().includes(filterText.toLowerCase())
  ) ?? [];

  const totalCount = localstackList.length + wiremockList.length + redisList.length + postgresList.length;

  return (
    <Card className="p-4 border-slate-800 bg-slate-950/80 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-emerald-400" />
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
            Live Workflow Telemetry & Cross-Service Inspector
          </h3>
          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live Audit Active
          </span>
        </div>

        <div className="flex items-center gap-2">
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter telemetry..."
            className="rounded-lg border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-200 placeholder:text-slate-600 focus:border-slate-700 focus:outline-none"
          />
          <Button variant="default" onClick={loadTelemetry} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Service Filter Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-800/60 pb-2">
        <button
          onClick={() => setActiveTab("all")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "all"
              ? "bg-slate-800 text-slate-100 border border-slate-700"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Activity className="h-3.5 w-3.5 text-indigo-400" />
          All Events ({totalCount})
        </button>

        <button
          onClick={() => setActiveTab("localstack")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "localstack"
              ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Layers className="h-3.5 w-3.5 text-emerald-400" />
          LocalStack SQS ({localstackList.length})
        </button>

        <button
          onClick={() => setActiveTab("wiremock")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "wiremock"
              ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Globe className="h-3.5 w-3.5 text-amber-400" />
          Wiremock Calls ({wiremockList.length})
        </button>

        <button
          onClick={() => setActiveTab("redis")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "redis"
              ? "bg-rose-500/15 text-rose-300 border border-rose-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Zap className="h-3.5 w-3.5 text-rose-400" />
          Redis Cache ({redisList.length})
        </button>

        <button
          onClick={() => setActiveTab("postgres")}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
            activeTab === "postgres"
              ? "bg-sky-500/15 text-sky-300 border border-sky-500/30"
              : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
          }`}
        >
          <Database className="h-3.5 w-3.5 text-sky-400" />
          Postgres Queries ({postgresList.length})
        </button>
      </div>

      {/* Tab Panels */}
      <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
        {(activeTab === "all" || activeTab === "localstack") &&
          localstackList.map((l) => (
            <div
              key={l.id}
              className="flex flex-col gap-1.5 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 text-xs font-mono"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone="green">LocalStack SQS</Badge>
                  <span className="font-bold text-slate-200">{l.action}</span>
                  <span className="text-emerald-300 font-semibold truncate max-w-[280px]">queue/{l.queueName}</span>
                </div>
                <span className="text-[10px] text-slate-500">{l.time.split("T")[1]?.slice(0, 8) || l.time}</span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center gap-2">
                <span>MessageID: <code className="text-slate-300 font-mono">{l.messageId}</code></span>
              </div>
              {l.body && (
                <div className="mt-1 rounded bg-slate-950 p-2 text-[11px] text-slate-300 overflow-x-auto">
                  <pre>{l.body}</pre>
                </div>
              )}
            </div>
          ))}
        {(activeTab === "all" || activeTab === "wiremock") &&
          wiremockList.map((w) => (
            <div
              key={w.id}
              className="flex flex-col gap-1.5 rounded-xl border border-slate-800/80 bg-slate-900/40 p-3 text-xs font-mono"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone="amber">Wiremock API</Badge>
                  <span className="font-bold text-slate-200">{w.method}</span>
                  <span className="text-slate-300 truncate max-w-[320px]">{w.url}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                      w.status >= 200 && w.status < 300
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                    }`}
                  >
                    {w.status > 0 ? `HTTP ${w.status}` : "FAILED"}
                  </span>
                </div>
                <span className="text-[10px] text-slate-500">{w.time.split("T")[1]?.slice(0, 8) || w.time}</span>
              </div>
              <div className="text-[11px] text-slate-400 truncate">Matched Stub: {w.stubName}</div>
              {w.body && (
                <div
                  className={`mt-1 rounded bg-slate-950 p-2 text-[11px] overflow-x-auto ${
                    w.status === 0 ? "text-rose-300" : "text-slate-300"
                  }`}
                >
                  <pre>{w.body}</pre>
                </div>
              )}
            </div>
          ))}

        {(activeTab === "all" || activeTab === "redis") &&
          redisList.map((r) => {
            const failed = r.action?.includes("FAILED");
            return (
              <div
                key={r.id}
                className={`flex flex-col gap-1 rounded-xl border p-2.5 text-xs font-mono ${
                  failed ? "border-rose-900/60 bg-rose-950/20" : "border-slate-800/80 bg-slate-900/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge tone={failed ? "red" : "red"}>Redis Cache</Badge>
                    <span className={`font-semibold ${failed ? "text-rose-400" : "text-rose-300"}`}>{r.action}</span>
                    {r.key && <span className="text-slate-200 font-bold">{r.key}</span>}
                    {r.command && <span className="text-slate-300 truncate max-w-[300px]">{r.command}</span>}
                  </div>
                  <span className="text-[10px] text-slate-500">{r.time.split("T")[1]?.slice(0, 8) || r.time}</span>
                </div>
                {failed && r.error && <div className="text-[11px] text-rose-300">{r.error}</div>}
              </div>
            );
          })}

        {(activeTab === "all" || activeTab === "postgres") &&
          postgresList.map((p) => {
            const failed = p.state === "failed";
            return (
              <div
                key={p.id}
                className={`flex flex-col gap-1.5 rounded-xl border p-2.5 text-xs font-mono ${
                  failed ? "border-rose-900/60 bg-rose-950/20" : "border-slate-800/80 bg-slate-900/40"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge tone={failed ? "red" : "blue"}>{failed ? "Postgres FAILED" : "Postgres DB"}</Badge>
                    <span className="text-slate-200 font-medium truncate max-w-[420px]">{p.query}</span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] shrink-0">
                    {p.durationMs !== undefined && p.durationMs !== null && (
                      <span className="text-emerald-400 font-bold">{p.durationMs}ms</span>
                    )}
                    <span className="text-slate-500">{p.time.split("T")[1]?.slice(0, 8) || p.time}</span>
                  </div>
                </div>
                {failed && p.error && <div className="text-[11px] text-rose-300">{p.error}</div>}
              </div>
            );
          })}

        {totalCount === 0 && (
          <div className="text-center py-6 text-xs text-slate-500">
            No activity logged yet for this run. Send a step above to see it ripple across LocalStack, Wiremock,
            Redis and Postgres — configure downstream Wiremock/Postgres/Redis triggers per step on the Workflows
            page to see more than just the SQS send.
          </div>
        )}
      </div>
    </Card>
  );
}

function WorkflowVariablesRunBar({
  workflow,
  onUpdate,
}: {
  workflow: Workflow;
  onUpdate: (wf: Workflow) => void;
}) {
  const [prefixes, setPrefixes] = useState<Record<string, string>>({});
  const [editingVars, setEditingVars] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.connections.getVariablePrefixes().then((pfx) => {
      const globalPfx = pfx ?? {};
      setPrefixes(globalPfx);

      const existingVars = { ...(workflow.variables ?? {}) };
      // Auto-initialize any Admin configured prefix keys if missing
      Object.entries(globalPfx).forEach(([k, p]) => {
        if (!(k in existingVars)) {
          existingVars[k] = p ? `${p}001` : "";
        }
      });
      setEditingVars(existingVars);
    }).catch(() => {
      setEditingVars(workflow.variables ?? {});
    });
  }, [workflow.id, workflow.variables]);

  const handleSave = async (updated: Record<string, string>) => {
    setSaving(true);
    try {
      const res = await api.workflows.update(workflow.id, { variables: updated });
      onUpdate(res);
      setEditingVars(res.variables ?? updated);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAdd = () => {
    if (!newKey.trim()) return;
    const cleanKey = newKey.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    const pfx = prefixes[cleanKey] ?? "";
    const val = newValue.trim();
    const finalVal = pfx && !val.startsWith(pfx) ? `${pfx}${val}` : val || `${pfx}001`;
    const updated = { ...editingVars, [cleanKey]: finalVal };
    setNewKey("");
    setNewValue("");
    handleSave(updated);
  };

  const handleRemove = (k: string) => {
    const updated = { ...editingVars };
    delete updated[k];
    handleSave(updated);
  };

  const varEntries = Object.entries(editingVars);

  return (
    <div className="rounded-2xl border border-slate-800/90 bg-slate-900/60 backdrop-blur-xl p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
          <Sliders className="h-4 w-4 text-emerald-400" />
          <span>Workflow Variable Overrides & Placeholders</span>
          <Badge tone={varEntries.length > 0 ? "green" : "neutral"}>
            {varEntries.length} Active
          </Badge>
        </div>
        <div className="text-[11px] text-slate-500">
          Substituted in step payloads before dispatching to SQS
        </div>
      </div>

      {varEntries.length === 0 ? (
        <div className="text-xs text-slate-500 py-1">
          No variables active. Add variable keys below (e.g. <span className="font-mono text-slate-300">ASSET_ID</span>, <span className="font-mono text-slate-300">TITLE_ID</span>) to substitute in message payloads.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {varEntries.map(([k, v]) => {
            const pfx = prefixes[k];
            return (
              <div key={k} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono w-full">
                <span className="font-bold text-emerald-400 shrink-0 min-w-[140px]">{"{{"}{k}{"}}"}</span>
                {pfx && (
                  <span className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs text-amber-300 font-bold shrink-0">
                    {pfx}
                  </span>
                )}
                <input
                  type="text"
                  value={v}
                  onChange={(e) => setEditingVars((prev) => ({ ...prev, [k]: e.target.value }))}
                  onBlur={() => handleSave(editingVars)}
                  placeholder="Value..."
                  className="flex-1 bg-transparent text-slate-200 focus:outline-none min-w-0 font-mono text-xs"
                />
                <button
                  onClick={() => handleRemove(k)}
                  className="text-slate-500 hover:text-rose-400 p-1 transition-colors shrink-0"
                  title="Remove Variable"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add inline variable on Run page */}
      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60">
        <input
          type="text"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="New Key (e.g. ASSET_ID)"
          className="w-44 rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
        <input
          type="text"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          placeholder="Value / Suffix (e.g. 001)"
          className="flex-1 min-w-[140px] rounded-xl border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
        />
        <Button variant="primary" onClick={handleAdd} disabled={saving || !newKey.trim()}>
          {saving ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
          Add Run Variable
        </Button>
      </div>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/workflows"
      className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to Queue Workflows
    </Link>
  );
}
