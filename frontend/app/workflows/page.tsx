"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Globe,
  Pencil,
  Play,
  Plus,
  Search,
  Star,
  Trash2,
  Workflow as WorkflowIcon,
  X,
  Zap,
} from "lucide-react";
import { api } from "@/lib/api";
import { SqsQueue, StepDownstream, Workflow, WorkflowStep } from "@/lib/types";
import { useConnections } from "@/lib/useConnections";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, JsonBlock, PageHeader, Spinner } from "@/components/ui";
import ConnectionPicker from "@/components/ConnectionPicker";
import { JsonEditor, jsonValidity, SqlEditor } from "@/components/CodeEditor";

const WIREMOCK_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"];

const CONSTANTS = {
  SERVICE_TYPE: "localstack" as const,
  MIN_NAME_LENGTH: 5,
  LABELS: {
    PAGE_TITLE: "Queue Workflows",
    PAGE_SUBTITLE: "Build multi-step queue pipelines with up to 5 message versions per step.",
    NEW_WORKFLOW_TITLE: "Create New Workflow",
    WORKFLOW_NAME_PLACEHOLDER: "e.g. Order Processing Pipeline",
    MIN_CHARS_HELP: "Workflow name must be more than 5 characters to create.",
    NO_WORKFLOWS: "No workflows created yet. Enter a name above to create your first pipeline.",
  },
} as const;

export default function WorkflowsPage() {
  const { connections: localstackConnections, selected: newConn, setSelected: setNewConn } =
    useConnections(CONSTANTS.SERVICE_TYPE);
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    api.workflows
      .list()
      .then((w) => {
        setWorkflows(w);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const isValidName = newName.trim().length > CONSTANTS.MIN_NAME_LENGTH;

  const handleCreate = async () => {
    if (!newConn || !isValidName) return;
    setCreating(true);
    try {
      const created = await api.workflows.create(newName.trim(), newConn);
      setWorkflows((w) => [...(w ?? []), created]);
      setNewName("");
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreating(false);
    }
  };

  const handleUpdate = (updated: Workflow) => {
    setWorkflows((w) => w!.map((wf) => (wf.id === updated.id ? updated : wf)));
  };

  const handleDelete = async (wf: Workflow) => {
    if (!confirm(`Delete workflow "${wf.name}"?`)) return;
    await api.workflows.remove(wf.id);
    setWorkflows((w) => w!.filter((x) => x.id !== wf.id));
  };

  const theme = SERVICE_THEME.localstack;

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        icon={WorkflowIcon}
        iconClassName="bg-emerald-500/15 text-emerald-400"
        title={CONSTANTS.LABELS.PAGE_TITLE}
        subtitle={CONSTANTS.LABELS.PAGE_SUBTITLE}
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {/* Create Workflow Card */}
      <Card className="p-5 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-300 font-semibold">
          <span>{CONSTANTS.LABELS.NEW_WORKFLOW_TITLE}</span>
          <span
            className={`font-mono text-[11px] ${
              isValidName ? "text-emerald-400 font-medium" : "text-slate-500"
            }`}
          >
            {newName.trim().length} / {CONSTANTS.MIN_NAME_LENGTH + 1}+ chars required
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="min-w-[260px] flex-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={CONSTANTS.LABELS.WORKFLOW_NAME_PLACEHOLDER}
              className={`w-full rounded-xl border bg-slate-950 px-3.5 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none transition-all ${
                isValidName
                  ? "border-emerald-500/60 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500"
                  : "border-slate-800 focus:border-slate-700"
              }`}
            />
          </div>

          <ConnectionPicker connections={localstackConnections ?? []} selected={newConn} onChange={setNewConn} />

          <Button
            variant="primary"
            onClick={handleCreate}
            disabled={creating || !newConn || !isValidName}
          >
            {creating ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
            Create Workflow
          </Button>
        </div>

        {!isValidName && newName.length > 0 && (
          <p className="text-[11px] text-amber-400/90 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {CONSTANTS.LABELS.MIN_CHARS_HELP}
          </p>
        )}
      </Card>

      {loading && !workflows && (
        <div className="flex items-center gap-2 p-3 text-xs text-slate-500">
          <Spinner />
          <span>Loading workflows...</span>
        </div>
      )}

      {/* Workflows List */}
      <div className="space-y-4">
        {workflows?.map((wf) => (
          <WorkflowCard key={wf.id} workflow={wf} onUpdate={handleUpdate} onDelete={() => handleDelete(wf)} />
        ))}

        {!loading && workflows?.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/60 p-12 text-center text-xs text-slate-500">
            {CONSTANTS.LABELS.NO_WORKFLOWS}
          </div>
        )}
      </div>
    </div>
  );
}

function WorkflowCard({
  workflow,
  onUpdate,
  onDelete,
}: {
  workflow: Workflow;
  onUpdate: (wf: Workflow) => void;
  onDelete: () => void;
}) {
  const [isWorkflowExpanded, setIsWorkflowExpanded] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editingNameText, setEditingNameText] = useState(workflow.name);

  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [queues, setQueues] = useState<SqsQueue[] | null>(null);
  const [newQueue, setNewQueue] = useState("");
  // addingStepIndex: null = closed, -1 = append to end, >= 0 = insert at specific index
  const [addingStepIndex, setAddingStepIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const ensureQueuesLoaded = () => {
    if (queues) return;
    api.localstack.queues(workflow.localstackConn).then((q) => {
      setQueues(q);
      if (q.length > 0) setNewQueue(q[0].name);
    });
  };

  const handleSaveName = async () => {
    if (editingNameText.trim().length <= CONSTANTS.MIN_NAME_LENGTH) return;
    try {
      const updated = await api.workflows.update(workflow.id, { name: editingNameText.trim() });
      onUpdate(updated);
      setIsEditingName(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddStep = async (index?: number) => {
    if (!newQueue) return;
    setBusy(true);
    try {
      const targetIdx = index === -1 ? undefined : index;
      onUpdate(await api.workflows.addStep(workflow.id, newQueue, targetIdx));
      setAddingStepIndex(null);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveStep = async (stepId: string) => {
    setBusy(true);
    try {
      onUpdate(await api.workflows.removeStep(workflow.id, stepId));
      if (expandedStep === stepId) setExpandedStep(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-slate-800/90 bg-slate-900/50 backdrop-blur-xl transition-all overflow-hidden">
      {/* Clickable Workflow Card Accordion Header */}
      <div
        onClick={() => !isEditingName && setIsWorkflowExpanded(!isWorkflowExpanded)}
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 cursor-pointer hover:bg-slate-900/80 transition-colors"
      >
        {isEditingName ? (
          <div className="flex items-center gap-2 flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <input
              type="text"
              value={editingNameText}
              onChange={(e) => setEditingNameText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveName()}
              className="rounded-lg border border-emerald-500/60 bg-slate-950 px-2.5 py-1 text-xs font-mono text-slate-200 focus:outline-none flex-1 min-w-[200px]"
              autoFocus
            />
            <button
              onClick={handleSaveName}
              disabled={editingNameText.trim().length <= CONSTANTS.MIN_NAME_LENGTH}
              className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-40 transition-colors"
              title="Save Workflow Name"
            >
              <Check className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => {
                setIsEditingName(false);
                setEditingNameText(workflow.name);
              }}
              className="rounded p-1 text-slate-400 hover:bg-slate-800 transition-colors"
              title="Cancel Edit"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex min-w-0 items-center gap-2.5 text-left group">
              <h3 className="font-mono text-base font-bold text-slate-100 group-hover:text-emerald-300 transition-colors truncate">
                {workflow.name}
              </h3>
              <Badge tone="green">{workflow.steps.length} Steps</Badge>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform ${
                  isWorkflowExpanded ? "rotate-180 text-emerald-400" : ""
                }`}
              />
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingName(true);
                setEditingNameText(workflow.name);
              }}
              className="text-slate-500 hover:text-slate-200 transition-colors p-1"
              title="Edit Workflow Name"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
          {workflow.steps.length > 0 && (
            <Link
              href={`/workflows/${workflow.id}/run`}
              onClick={() => {
                api.workflows.resetRunSession(workflow.id).catch(() => null);
              }}
            >
              <Button variant="success">
                <Play className="h-3.5 w-3.5" />
                Run Workflow
              </Button>
            </Link>
          )}

          <Button variant="danger" onClick={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>

      {/* Expanded Pipeline Details */}
      {isWorkflowExpanded && (
        <div className="p-4 pt-3 border-t border-slate-800/80 space-y-4">
          {/* Steps Pipeline Visualizer */}
          <div className="space-y-2">
            <div className="text-xs text-slate-400 font-semibold">Pipeline Steps Sequence</div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Insert at start button (before Step 1) */}
              {addingStepIndex === 0 ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-500/40 bg-slate-950 p-2">
                  <SearchableQueueSelect
                    queues={queues}
                    value={newQueue}
                    onChange={setNewQueue}
                    onFocus={ensureQueuesLoaded}
                  />
                  <Button variant="primary" onClick={() => handleAddStep(0)} disabled={busy || !newQueue}>
                    Insert at Start
                  </Button>
                  <Button onClick={() => setAddingStepIndex(null)}>Cancel</Button>
                </div>
              ) : (
                workflow.steps.length > 0 && (
                  <button
                    onClick={() => {
                      setAddingStepIndex(0);
                      ensureQueuesLoaded();
                    }}
                    className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-700 bg-slate-950 text-slate-400 hover:border-emerald-500 hover:text-emerald-300 transition-all text-xs font-bold shrink-0"
                    title="Insert queue step at beginning (before Step 1)"
                  >
                    +
                  </button>
                )
              )}

              {workflow.steps.map((step, i) => (
                <div key={step.id} className="flex items-center gap-2">
                  <StepChip
                    step={step}
                    index={i}
                    queues={queues}
                    expanded={expandedStep === step.id}
                    busy={busy}
                    onToggle={() => setExpandedStep(expandedStep === step.id ? null : step.id)}
                    onRemove={() => handleRemoveStep(step.id)}
                  />

                  {/* Intermediate insert button between steps */}
                  {addingStepIndex === i + 1 ? (
                    <div className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-500/40 bg-slate-950 p-2">
                      <SearchableQueueSelect
                        queues={queues}
                        value={newQueue}
                        onChange={setNewQueue}
                        onFocus={ensureQueuesLoaded}
                      />
                      <Button variant="primary" onClick={() => handleAddStep(i + 1)} disabled={busy || !newQueue}>
                        Insert
                      </Button>
                      <Button onClick={() => setAddingStepIndex(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setAddingStepIndex(i + 1);
                        ensureQueuesLoaded();
                      }}
                      className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-slate-700 bg-slate-950 text-slate-400 hover:border-emerald-500 hover:text-emerald-300 transition-all text-xs font-bold shrink-0"
                      title={`Insert queue step between Step ${i + 1} and ${i + 2}`}
                    >
                      +
                    </button>
                  )}
                </div>
              ))}

              {/* Append to end container */}
              {addingStepIndex === -1 || (workflow.steps.length === 0 && addingStepIndex !== null) ? (
                <div className="flex items-center gap-2 rounded-xl border border-dashed border-emerald-500/40 bg-slate-950 p-2">
                  <SearchableQueueSelect
                    queues={queues}
                    value={newQueue}
                    onChange={setNewQueue}
                    onFocus={ensureQueuesLoaded}
                  />
                  <Button variant="primary" onClick={() => handleAddStep(-1)} disabled={busy || !newQueue}>
                    Add Step
                  </Button>
                  {workflow.steps.length > 0 && (
                    <Button onClick={() => setAddingStepIndex(null)}>Cancel</Button>
                  )}
                </div>
              ) : (
                addingStepIndex === null && (
                  <button
                    onClick={() => {
                      setAddingStepIndex(-1);
                      ensureQueuesLoaded();
                    }}
                    className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-800 px-3.5 py-2.5 text-xs font-medium text-slate-400 hover:border-emerald-500/60 hover:text-emerald-300 transition-all bg-slate-950/60"
                  >
                    <Plus className="h-3.5 w-3.5 text-emerald-400" />
                    Add Queue Step
                  </button>
                )
              )}
            </div>
          </div>

          {/* Expanded Step Version Editor */}
          {expandedStep && (
            <div className="space-y-4 border-t border-slate-800 pt-4">
              <StepVersionsPanel
                workflowId={workflow.id}
                step={workflow.steps.find((s) => s.id === expandedStep)!}
                onUpdate={onUpdate}
              />
              <StepDownstreamPanel
                workflowId={workflow.id}
                step={workflow.steps.find((s) => s.id === expandedStep)!}
                onUpdate={onUpdate}
              />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function SearchableQueueSelect({
  queues,
  value,
  onChange,
  onFocus,
  disabled,
}: {
  queues: SqsQueue[] | null;
  value: string;
  onChange: (queueName: string) => void;
  onFocus?: () => void;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedQueue = queues?.find((q) => q.name === value);
  const displayTitle = selectedQueue
    ? selectedQueue.label && selectedQueue.label !== selectedQueue.name
      ? `${selectedQueue.label} (${selectedQueue.name})`
      : selectedQueue.name
    : value || "Select a queue...";

  const filteredQueues = (queues ?? []).filter((q) => {
    const qry = search.trim().toLowerCase();
    if (!qry) return true;
    return (
      q.name.toLowerCase().includes(qry) ||
      (q.label && q.label.toLowerCase().includes(qry))
    );
  });

  return (
    <div className="relative min-w-[240px]">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          if (!isOpen && onFocus) onFocus();
          setIsOpen((prev) => !prev);
        }}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-100 hover:border-slate-700 focus:border-emerald-500 focus:outline-none transition-all font-mono"
      >
        <span className="truncate">{displayTitle}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-72 rounded-xl border border-slate-800 bg-slate-900 p-2 shadow-2xl backdrop-blur-xl animate-fade-in space-y-1.5">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search queue label or name..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 pl-8 pr-7 py-1.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none font-mono"
              autoFocus
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          <div className="max-h-48 overflow-y-auto space-y-0.5 custom-scrollbar">
            {!queues && (
              <div className="flex items-center gap-2 p-2 text-xs text-slate-500">
                <Spinner />
                <span>Loading queues...</span>
              </div>
            )}

            {queues && filteredQueues.length === 0 && (
              <div className="p-2 text-xs text-slate-500 text-center">No matching queues found</div>
            )}

            {filteredQueues.map((q) => {
              const isSelected = q.name === value;
              const hasAlias = q.label && q.label !== q.name;
              return (
                <button
                  key={q.name}
                  type="button"
                  onClick={() => {
                    onChange(q.name);
                    setIsOpen(false);
                    setSearch("");
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-emerald-500/20 text-emerald-300 font-semibold"
                      : "text-slate-300 hover:bg-slate-800/80 hover:text-slate-100"
                  }`}
                >
                  <div className="truncate">
                    <div className="font-semibold text-slate-100">{q.label ?? q.name}</div>
                    {hasAlias && <div className="text-[10px] font-mono text-slate-500">{q.name}</div>}
                  </div>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0 ml-2" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StepChip({
  step,
  index,
  queues,
  expanded,
  busy,
  onToggle,
  onRemove,
}: {
  step: WorkflowStep;
  index: number;
  queues?: SqsQueue[] | null;
  expanded: boolean;
  busy: boolean;
  onToggle: () => void;
  onRemove: () => void;
}) {
  const qObj = queues?.find((q) => q.name === step.queueName);
  const displayTitle = qObj?.label && qObj.label !== step.queueName ? `${qObj.label} (${step.queueName})` : step.queueName;

  return (
    <div
      className={`flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition-all ${
        expanded
          ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-200 shadow-sm"
          : "border-slate-800 bg-slate-950/80 text-slate-300 hover:border-slate-700"
      }`}
    >
      <button onClick={onToggle} className="flex items-center gap-2 text-left">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 font-bold font-mono text-[10px] text-emerald-400">
          {index + 1}
        </span>
        <span className="font-mono text-xs font-semibold text-slate-100">{displayTitle}</span>
        <Badge tone={step.versions.length > 0 ? "green" : "neutral"}>{step.versions.length}/5 msgs</Badge>
      </button>

      <div className="flex items-center border-l border-slate-800 pl-1.5">
        <button onClick={onRemove} disabled={busy} className="rounded p-1 text-slate-500 hover:text-rose-400" title="Remove Step">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function StepVersionsPanel({
  workflowId,
  step,
  onUpdate,
}: {
  workflowId: string;
  step: WorkflowStep;
  onUpdate: (wf: Workflow) => void;
}) {
  const [body, setBody] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  // Edit label & explicit add state
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState("");
  const [isAddingPayload, setIsAddingPayload] = useState(false);

  // Editable body state for expanded versions
  const [editingBodyByVersion, setEditingBodyByVersion] = useState<Record<string, string>>({});
  const [savingVersionId, setSavingVersionId] = useState<string | null>(null);

  const bodyCheck = jsonValidity(body);
  const atCap = step.versions.length >= 5;

  const handleToggleExpand = (v: { id: string; body: string }) => {
    if (expandedVersion === v.id) {
      setExpandedVersion(null);
    } else {
      setExpandedVersion(v.id);
      if (!(v.id in editingBodyByVersion)) {
        setEditingBodyByVersion((prev) => ({ ...prev, [v.id]: v.body }));
      }
    }
  };

  const handleSaveVersionBody = async (versionId: string, currentLabel: string) => {
    const bodyToSave = editingBodyByVersion[versionId];
    if (!bodyToSave) return;
    const check = jsonValidity(bodyToSave);
    if (!check.valid) return;

    setSavingVersionId(versionId);
    setError(null);
    try {
      const updated = await api.workflows.updateVersion(workflowId, step.id, versionId, currentLabel, bodyToSave);
      onUpdate(updated);
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingVersionId(null);
    }
  };

  const handleAdd = async () => {
    if (!body.trim() || !bodyCheck.valid) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.workflows.addVersion(workflowId, step.id, body, label || undefined);
      onUpdate(updated);
      setBody("");
      setLabel("");
      setIsAddingPayload(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleStartEditLabel = (v: { id: string; label: string }) => {
    setEditingVersionId(v.id);
    setEditingLabelText(v.label);
  };

  const handleSaveLabel = async (versionId: string) => {
    if (!editingLabelText.trim()) return;
    try {
      const updated = await api.workflows.updateVersion(workflowId, step.id, versionId, editingLabelText.trim());
      onUpdate(updated);
      setEditingVersionId(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleSetActive = async (versionId: string) => {
    onUpdate(await api.workflows.setActiveVersion(workflowId, step.id, versionId));
  };

  const handleDeleteVersion = async (versionId: string) => {
    onUpdate(await api.workflows.removeVersion(workflowId, step.id, versionId));
    if (expandedVersion === versionId) setExpandedVersion(null);
  };

  // Show payload editor if 0 versions exist OR if user explicitly clicked '+ Add Version Payload'
  const shouldShowEditor = step.versions.length === 0 || isAddingPayload;

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 text-xs">
        <div className="font-semibold text-slate-200">
          Reusable Message Payloads for Queue: <span className="font-mono text-emerald-400">{step.queueName}</span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono">
          Shared & persisted per queue across all workflows
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {step.versions.map((v) => {
          const open = expandedVersion === v.id;
          const isEditing = editingVersionId === v.id;
          const currentEditingBody = editingBodyByVersion[v.id] ?? v.body;
          const isBodyValid = jsonValidity(currentEditingBody).valid;

          return (
            <div key={v.id} className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleSetActive(v.id)}
                  title={step.activeVersionId === v.id ? "active default version" : "set as active default version"}
                  className="shrink-0"
                >
                  <Star
                    className={`h-4 w-4 ${
                      step.activeVersionId === v.id
                        ? "fill-amber-400 text-amber-400"
                        : "text-slate-600 hover:text-slate-400"
                    }`}
                  />
                </button>

                {isEditing ? (
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <input
                      type="text"
                      value={editingLabelText}
                      onChange={(e) => setEditingLabelText(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSaveLabel(v.id)}
                      className="rounded-lg border border-emerald-500/60 bg-slate-950 px-2 py-1 text-xs font-mono text-slate-200 focus:outline-none"
                      autoFocus
                    />
                    <button
                      onClick={() => handleSaveLabel(v.id)}
                      className="rounded p-1 text-emerald-400 hover:bg-emerald-500/10"
                      title="Save Label"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditingVersionId(null)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-800"
                      title="Cancel Edit"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <button
                      onClick={() => handleToggleExpand(v)}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <span className="text-xs font-mono font-semibold text-slate-200">{v.label}</span>
                      {step.activeVersionId === v.id && <Badge tone="amber">default</Badge>}
                    </button>

                    <button
                      onClick={() => handleStartEditLabel(v)}
                      className="text-slate-500 hover:text-slate-200 transition-colors p-1"
                      title="Edit Label"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    <button
                      onClick={() => handleToggleExpand(v)}
                      className="text-slate-500 hover:text-slate-300 p-1"
                    >
                      <ChevronDown
                        className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${open ? "rotate-180 text-emerald-400" : ""}`}
                      />
                    </button>
                  </div>
                )}

                <button
                  onClick={() => handleDeleteVersion(v.id)}
                  className="shrink-0 text-slate-500 hover:text-rose-400 transition-colors p-1"
                  title="Delete Version"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {open && (
                <div className="mt-2.5 border-t border-slate-800 pt-2.5 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Edit JSON Payload Body</span>
                    <span className={`text-[11px] font-mono ${isBodyValid ? "text-emerald-400" : "text-rose-400"}`}>
                      {isBodyValid ? "✓ Valid JSON" : "Invalid JSON"}
                    </span>
                  </div>

                  <JsonEditor
                    value={currentEditingBody}
                    onChange={(val) => setEditingBodyByVersion((prev) => ({ ...prev, [v.id]: val }))}
                    height="120px"
                  />

                  <div className="flex justify-end pt-1">
                    <Button
                      variant="primary"
                      onClick={() => handleSaveVersionBody(v.id, v.label)}
                      disabled={savingVersionId === v.id || !isBodyValid}
                    >
                      {savingVersionId === v.id ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
                      Save Updated Payload
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {step.versions.length === 0 && <div className="text-xs text-slate-500">No message versions configured yet.</div>}
      </div>

      {!atCap && (
        <>
          {!shouldShowEditor ? (
            <button
              onClick={() => setIsAddingPayload(true)}
              className="flex items-center gap-1.5 rounded-xl border border-dashed border-slate-800 bg-slate-900/60 px-3.5 py-2 text-xs font-semibold text-emerald-400 hover:border-emerald-500/50 hover:bg-slate-900 transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Version Payload ({step.versions.length}/5)
            </button>
          ) : (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={`v${step.versions.length + 1} Label`}
                    className="w-36 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none font-mono"
                  />
                  <span className="text-[11px] text-slate-500">Label (optional)</span>
                </div>

                {step.versions.length > 0 && (
                  <button
                    onClick={() => setIsAddingPayload(false)}
                    className="text-xs text-slate-500 hover:text-slate-300"
                  >
                    Cancel
                  </button>
                )}
              </div>

              <JsonEditor value={body} onChange={setBody} height="110px" placeholder='{"order_id": 1001}' />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-rose-400">{!bodyCheck.valid ? bodyCheck.message : ""}</span>
                <Button variant="primary" onClick={handleAdd} disabled={saving || !body.trim() || !bodyCheck.valid}>
                  {saving ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                  Save Version Payload
                </Button>
              </div>

              {error && (
                <div className="mt-2">
                  <ErrorBox message={error} />
                </div>
              )}
            </div>
          )}
        </>
      )}

      {atCap && (
        <div className="text-[11px] text-slate-500">5/5 versions configured. Delete a version to add another.</div>
      )}
    </div>
  );
}

function DownstreamConnectionSelect({
  value,
  onChange,
  type,
}: {
  value: string;
  onChange: (id: string) => void;
  type: "wiremock" | "postgres" | "redis";
}) {
  const { connections } = useConnections(type);
  return (
    <div className="relative inline-flex items-center">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none rounded-xl border border-slate-800 bg-slate-950 pl-3 pr-8 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none transition-all cursor-pointer"
      >
        <option value="">disabled</option>
        {(connections ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
    </div>
  );
}

function StepDownstreamPanel({
  workflowId,
  step,
  onUpdate,
}: {
  workflowId: string;
  step: WorkflowStep;
  onUpdate: (wf: Workflow) => void;
}) {
  const d = step.downstream ?? {};
  const [wiremockConn, setWiremockConn] = useState(d.wiremockConn ?? "");
  const [wiremockMethod, setWiremockMethod] = useState(d.wiremockMethod ?? "GET");
  const [wiremockPath, setWiremockPath] = useState(d.wiremockPath ?? "");
  const [postgresConn, setPostgresConn] = useState(d.postgresConn ?? "");
  const [postgresSql, setPostgresSql] = useState(d.postgresSql ?? "");
  const [redisConn, setRedisConn] = useState(d.redisConn ?? "");
  const [redisKey, setRedisKey] = useState(d.redisKey ?? "");
  const [redisValue, setRedisValue] = useState(d.redisValue ?? "");

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: StepDownstream = {
        wiremockConn: wiremockConn || null,
        wiremockMethod,
        wiremockPath: wiremockPath || null,
        postgresConn: postgresConn || null,
        postgresSql: postgresSql || null,
        redisConn: redisConn || null,
        redisAction: "SET",
        redisKey: redisKey || null,
        redisValue: redisValue || null,
      };
      const updated = await api.workflows.updateStepDownstream(workflowId, step.id, payload);
      onUpdate(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
      <div className="flex items-center justify-between text-xs">
        <div className="font-semibold text-slate-200">
          Downstream triggers for <span className="font-mono text-emerald-400">{step.queueName}</span>
        </div>
        <div className="text-[11px] text-slate-500">
          Fired for real, right after this step&apos;s SQS send succeeds — each is logged as its own telemetry event.
        </div>
      </div>

      {/* Wiremock */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
          <Globe className="h-3.5 w-3.5" />
          Wiremock call
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownstreamConnectionSelect value={wiremockConn} onChange={setWiremockConn} type="wiremock" />
          <div className="relative inline-flex items-center">
            <select
              value={wiremockMethod ?? "GET"}
              onChange={(e) => setWiremockMethod(e.target.value)}
              disabled={!wiremockConn}
              className="appearance-none rounded-xl border border-slate-800 bg-slate-950 pl-3 pr-8 py-1.5 text-xs text-slate-200 font-mono focus:border-emerald-500 focus:outline-none disabled:opacity-40 cursor-pointer"
            >
              {WIREMOCK_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          </div>
          <input
            value={wiremockPath}
            onChange={(e) => setWiremockPath(e.target.value)}
            disabled={!wiremockConn}
            placeholder="/api/customers/1"
            className="min-w-[200px] flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-40"
          />
        </div>
      </div>

      {/* Postgres */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-sky-300">
          <Database className="h-3.5 w-3.5" />
          Postgres query
        </div>
        <DownstreamConnectionSelect value={postgresConn} onChange={setPostgresConn} type="postgres" />
        {postgresConn && (
          <SqlEditor value={postgresSql} onChange={setPostgresSql} height="80px" placeholder="SELECT ..." />
        )}
      </div>

      {/* Redis */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 space-y-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-rose-300">
          <Zap className="h-3.5 w-3.5" />
          Redis SET
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DownstreamConnectionSelect value={redisConn} onChange={setRedisConn} type="redis" />
          <input
            value={redisKey}
            onChange={(e) => setRedisKey(e.target.value)}
            disabled={!redisConn}
            placeholder="key, e.g. workflow:last-order"
            className="min-w-[180px] rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-40"
          />
          <input
            value={redisValue}
            onChange={(e) => setRedisValue(e.target.value)}
            disabled={!redisConn}
            placeholder="value (defaults to the sent message body)"
            className="min-w-[220px] flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-40"
          />
        </div>
      </div>

      {error && <ErrorBox message={error} />}

      <div className="flex items-center justify-end gap-2">
        {saved && <span className="text-[11px] text-emerald-400">saved</span>}
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {saving ? <Spinner /> : <Check className="h-3.5 w-3.5" />}
          Save downstream triggers
        </Button>
      </div>
    </div>
  );
}
