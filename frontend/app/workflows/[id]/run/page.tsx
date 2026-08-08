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
  Layers,
  Plus,
  RotateCcw,
  Send,
  Sliders,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { SendMessageResult, Workflow } from "@/lib/types";
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
  const [purging, setPurging] = useState(false);
  const [purgedQueue, setPurgedQueue] = useState<string | null>(null);

  const handlePurgeQueue = async () => {
    if (!step?.queueName) return;
    setPurging(true);
    try {
      await api.localstack.purgeQueue("localstack", step.queueName);
      setPurgedQueue(step.queueName);
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
      api.workflows.getRunSession(workflowId).catch(() => null),
    ])
      .then(([wf, runSession]) => {
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

        // Restore sent steps from active run session
        const initialSent: Record<string, SendMessageResult> = {};
        if (runSession?.sentStepIds) {
          runSession.sentStepIds.forEach((sId) => {
            initialSent[sId] = { messageId: "session-restored", sentAt: runSession.startedAt ?? "" };
          });
        }

        setActiveVersionIndexByStep(initialIndices);
        setCustomBodyByStep(initialBodies);
        setSentByStep(initialSent);

        // Position stepIndex at first unsent step if run in-progress
        if (runSession?.sentStepIds && runSession.sentStepIds.length > 0) {
          const firstUnsentIdx = wf.steps.findIndex((s) => !runSession.sentStepIds.includes(s.id));
          if (firstUnsentIdx >= 0) {
            setStepIndex(firstUnsentIdx);
          } else {
            setStepIndex(wf.steps.length - 1);
          }
        }

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
            <Link href={`/events?workflowId=${workflow.id}`}>
              <Button variant="default">
                <Activity className="h-3.5 w-3.5 text-cyan-400" />
                Live Service Logs
              </Button>
            </Link>
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
          const isCurrent = i === stepIndex;
          const isPrevious = i < stepIndex;

          return (
            <button
              key={s.id}
              onClick={() => setStepIndex(i)}
              className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-mono transition-all ${
                isCurrent
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 shadow-md font-bold ring-1 ring-emerald-500/40"
                  : isPrevious
                  ? "border-slate-800/90 bg-slate-900/60 text-slate-400 opacity-75 hover:opacity-100 hover:border-slate-700"
                  : "border-slate-800/60 bg-slate-950/40 text-slate-500 opacity-60 hover:opacity-90 hover:border-slate-800"
              }`}
            >
              {sent ? (
                <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              ) : (
                <span className={`flex h-4 w-4 items-center justify-center rounded-md text-[10px] font-bold ${isCurrent ? "bg-emerald-500/30 text-emerald-300" : "bg-slate-800/80 text-slate-400"}`}>
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

      {/* Workflow Completed Summary View when all steps sent */}
      {sentCount === workflow.steps.length && workflow.steps.length > 0 ? (
        <Card className="p-8 border-emerald-500/40 bg-emerald-950/20 backdrop-blur-xl space-y-5 text-center">
          <div className="flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-lg">
              <Check className="h-7 w-7" />
            </div>
          </div>
          <div className="space-y-1 font-mono">
            <h3 className="text-lg font-bold text-slate-100">Workflow Run Completed!</h3>
            <p className="text-xs text-slate-400 font-sans">
              All {workflow.steps.length} queue steps in &quot;{workflow.name}&quot; have been executed and dispatched.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="primary" onClick={restart}>
              <RotateCcw className="h-4 w-4" />
              Start New Run
            </Button>
            <Button variant="danger" onClick={handleDeleteRun}>
              <Trash2 className="h-4 w-4" />
              Clear Run History
            </Button>
          </div>
        </Card>
      ) : (
        /* Main Execution Card */
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

          {/* Payload Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300">JSON Payload</span>
              <div className="flex items-center gap-2">
                {!bodyCheck.valid && bodyCheck.message && (
                  <span className="text-[11px] font-mono text-rose-400">{bodyCheck.message}</span>
                )}
                <Badge tone={bodyCheck.valid ? "green" : "red"}>
                  {bodyCheck.valid ? "valid JSON" : "invalid JSON"}
                </Badge>
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              <JsonEditor
                value={currentBody}
                onChange={(val) => setCustomBodyByStep((prev) => ({ ...prev, [step.id]: val }))}
                height="320px"
              />
            </div>
          </div>

          {/* Error Message Alert */}
          {sendError && (
            <div className="animate-fade-in">
              <ErrorBox message={sendError} />
            </div>
          )}

          {/* Action Controls */}
          <div className="flex items-center justify-between border-t border-slate-800 pt-4">
            <Button onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0}>
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous Step
            </Button>

            <div className="flex items-center gap-3">
              <Button
                onClick={() => setStepIndex((i) => Math.min(workflow.steps.length - 1, i + 1))}
                disabled={stepIndex === workflow.steps.length - 1}
              >
                Next Step
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="primary"
                onClick={handleSend}
                disabled={sending || !bodyCheck.valid || !currentBody.trim()}
              >
                {sending ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
                Send to {step.queueName}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
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
