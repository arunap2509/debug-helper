"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Eye,
  EyeOff,
  Inbox,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { S3Bucket, SqsQueue, SsmParam } from "@/lib/types";
import { useConnections } from "@/lib/useConnections";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, PageHeader, Spinner } from "@/components/ui";
import ConnectionPicker from "@/components/ConnectionPicker";

const CONSTANTS = {
  SERVICE_TYPE: "localstack" as const,
  SAVED_TOAST_DURATION_MS: 1500,
  COPIED_TOAST_DURATION_MS: 1500,
  LABELS: {
    PAGE_TITLE: "LocalStack AWS Emulator",
    PAGE_SUBTITLE: "Monitor SQS message queues, S3 storage buckets, and SSM Parameter Store values.",
    REFRESH_BUTTON_LABEL: "Refresh",
    REVEAL_SECRETS_LABEL: "Reveal Secrets",
    HIDE_SECRETS_LABEL: "Hide Secrets",
    TAB_QUEUES: "SQS Queues",
    TAB_BUCKETS: "S3 Buckets",
    TAB_SSM: "SSM Parameters",
    NO_QUEUES: "No SQS queues found matching your search filter.",
    NO_BUCKETS: "No S3 buckets found matching your search filter.",
    NO_SSM: "No SSM parameters found matching your search filter.",
    PURGE_MODAL_TITLE: "Confirm Queue Purge",
  },
} as const;

type Tab = "queues" | "buckets" | "ssm";

export default function LocalStackPage() {
  const { connections, selected, setSelected, loadingConnections } = useConnections(CONSTANTS.SERVICE_TYPE);
  const [tab, setTab] = useState<Tab>("queues");
  const [queues, setQueues] = useState<SqsQueue[] | null>(null);
  const [buckets, setBuckets] = useState<S3Bucket[] | null>(null);
  const [ssm, setSsm] = useState<SsmParam[] | null>(null);
  const [revealSecrets, setRevealSecrets] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  // Create Resource Modal States
  const [isCreateQueueOpen, setIsCreateQueueOpen] = useState(false);
  const [newQueueName, setNewQueueName] = useState("");
  const [creatingQueue, setCreatingQueue] = useState(false);

  const [isCreateBucketOpen, setIsCreateBucketOpen] = useState(false);
  const [newBucketName, setNewBucketName] = useState("");
  const [creatingBucket, setCreatingBucket] = useState(false);

  const [isCreateSsmOpen, setIsCreateSsmOpen] = useState(false);
  const [newSsmName, setNewSsmName] = useState("");
  const [newSsmValue, setNewSsmValue] = useState("");
  const [newSsmType, setNewSsmType] = useState<"String" | "SecureString" | "StringList">("String");
  const [creatingSsm, setCreatingSsm] = useState(false);

  const load = (refresh = false) => {
    if (!selected) {
      if (!loadingConnections) {
        setLoading(false);
      }
      return;
    }
    setLoading(true);
    setError(null);
    const req =
      tab === "queues"
        ? api.localstack.queues(selected, refresh).then(setQueues)
        : tab === "buckets"
        ? api.localstack.buckets(selected, refresh).then(setBuckets)
        : api.localstack.ssm(selected, refresh).then(setSsm);
    req.catch((e) => setError(String(e))).finally(() => setLoading(false));
  };

  useEffect(() => {
    if (selected) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, selected]);

  const handleCreateQueue = async () => {
    if (!selected || !newQueueName.trim()) return;
    setCreatingQueue(true);
    try {
      await api.localstack.createQueue(selected, newQueueName.trim());
      setIsCreateQueueOpen(false);
      setNewQueueName("");
      load(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingQueue(false);
    }
  };

  const handleCreateBucket = async () => {
    if (!selected || !newBucketName.trim()) return;
    setCreatingBucket(true);
    try {
      await api.localstack.createBucket(selected, newBucketName.trim());
      setIsCreateBucketOpen(false);
      setNewBucketName("");
      load(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingBucket(false);
    }
  };

  const handleCreateSsm = async () => {
    if (!selected || !newSsmName.trim()) return;
    setCreatingSsm(true);
    try {
      await api.localstack.createSsm(selected, newSsmName.trim(), newSsmValue, newSsmType);
      setIsCreateSsmOpen(false);
      setNewSsmName("");
      setNewSsmValue("");
      setNewSsmType("String");
      load(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setCreatingSsm(false);
    }
  };

  const theme = SERVICE_THEME.localstack;

  if (loadingConnections || connections === null || connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={theme.icon}
          iconClassName={`${theme.iconBg} ${theme.iconText}`}
          title={CONSTANTS.LABELS.PAGE_TITLE}
          subtitle={CONSTANTS.LABELS.PAGE_SUBTITLE}
        />
        <Card className="p-8 text-center space-y-4 max-w-xl mx-auto border-dashed border-slate-800">
          {loadingConnections || connections === null ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-slate-500">
              <Spinner />
              <span>Loading connections...</span>
            </div>
          ) : (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">No LocalStack Connection Configured</h3>
                <p className="text-xs text-slate-400 mt-1">
                  There are no active LocalStack target connections. Add a connection in Admin to monitor SQS queues and S3 buckets.
                </p>
              </div>
              <Link href="/admin">
                <Button variant="primary">
                  <Plus className="h-3.5 w-3.5" />
                  Configure LocalStack Connection in Admin
                </Button>
              </Link>
            </>
          )}
        </Card>
      </div>
    );
  }

  // Search Filtered Data Arrays
  const filteredQueues = (queues ?? []).filter((q) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      q.name.toLowerCase().includes(query) ||
      (q.label && q.label.toLowerCase().includes(query)) ||
      q.url.toLowerCase().includes(query)
    );
  });

  const filteredBuckets = (buckets ?? []).filter((b) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return b.name.toLowerCase().includes(query) || b.objects.some((o) => o.key.toLowerCase().includes(query));
  });

  const filteredSsm = (ssm ?? []).filter((p) => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return true;
    return (
      p.name.toLowerCase().includes(query) ||
      p.value.toLowerCase().includes(query) ||
      p.type.toLowerCase().includes(query)
    );
  });

  return (
    <div className="space-y-6 pb-12">
      {/* Header Bar */}
      <PageHeader
        icon={theme.icon}
        iconClassName={`${theme.iconBg} ${theme.iconText}`}
        title={CONSTANTS.LABELS.PAGE_TITLE}
        subtitle={CONSTANTS.LABELS.PAGE_SUBTITLE}
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <ConnectionPicker connections={connections ?? []} selected={selected} onChange={setSelected} />
            <Button variant="default" onClick={() => load(true)} disabled={loading}>
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setTab("queues")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              tab === "queues"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
            }`}
          >
            <Inbox className="h-4 w-4 text-amber-400" />
            {CONSTANTS.LABELS.TAB_QUEUES}
            {queues && (
              <span className="rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {queues.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab("buckets")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              tab === "buckets"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
            }`}
          >
            <Layers className="h-4 w-4 text-amber-400" />
            {CONSTANTS.LABELS.TAB_BUCKETS}
            {buckets && (
              <span className="rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {buckets.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setTab("ssm")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
              tab === "ssm"
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-md"
                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900/60 border border-transparent"
            }`}
          >
            <Database className="h-4 w-4 text-amber-400" />
            {CONSTANTS.LABELS.TAB_SSM}
            {ssm && (
              <span className="rounded-md bg-slate-950/60 px-1.5 py-0.5 text-[10px] font-bold text-amber-300">
                {ssm.length}
              </span>
            )}
          </button>
        </div>

        {/* Tab-Specific Creation Button */}
        {selected && (
          <div>
            {tab === "queues" && (
              <Button variant="primary" onClick={() => setIsCreateQueueOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create SQS Queue
              </Button>
            )}
            {tab === "buckets" && (
              <Button variant="primary" onClick={() => setIsCreateBucketOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create S3 Bucket
              </Button>
            )}
            {tab === "ssm" && (
              <Button variant="primary" onClick={() => setIsCreateSsmOpen(true)}>
                <Plus className="h-3.5 w-3.5" />
                Create SSM Parameter
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Unified Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={
            tab === "queues"
              ? "Search SQS queues by name, label, or URL..."
              : tab === "buckets"
              ? "Search S3 buckets by bucket name or file keys..."
              : "Search SSM parameters by name, value, or type..."
          }
          className="w-full rounded-xl border border-slate-800 bg-slate-900/80 pl-9 pr-9 py-2.5 text-xs text-slate-200 placeholder:text-slate-500 focus:border-amber-500/50 focus:outline-none focus:ring-1 focus:ring-amber-500/50 transition-all font-mono"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* SQS Queues Tab */}
      {tab === "queues" && selected && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {(loading || queues === null) && (
            <div className="col-span-full flex h-48 items-center justify-center gap-2 text-xs text-slate-500">
              <Spinner />
              <span>Fetching SQS queue configurations...</span>
            </div>
          )}

          {!loading && queues !== null && filteredQueues.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center">
              <Inbox className="mx-auto h-10 w-10 text-slate-600 mb-2" />
              <p className="text-xs text-slate-500 font-medium">{CONSTANTS.LABELS.NO_QUEUES}</p>
            </div>
          )}

          {!loading && queues !== null && filteredQueues.map((q) => (
            <QueueCard
              key={q.name}
              queue={q}
              conn={selected}
              onLabelSaved={(label) =>
                setQueues((qs) => qs!.map((x) => (x.name === q.name ? { ...x, label } : x)))
              }
              onPurged={() =>
                setQueues((qs) => qs!.map((x) => (x.name === q.name ? { ...x, visible: 0, inFlight: 0 } : x)))
              }
            />
          ))}
        </div>
      )}

      {/* S3 Buckets Tab */}
      {tab === "buckets" && (
        <div className="space-y-4">
          {filteredBuckets.map((b) => (
            <Card key={b.name} className="p-5 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
                    <Cloud className="h-4 w-4" />
                  </div>
                  <div>
                    <h3 className="font-mono text-sm font-semibold text-slate-100">{b.name}</h3>
                    <p className="text-[11px] text-slate-500">{b.objects.length} stored objects</p>
                  </div>
                </div>
                <span className="text-xs font-mono text-slate-400">{new Date(b.createdAt).toLocaleString()}</span>
              </div>

              {b.objects.length === 0 ? (
                <div className="text-xs text-slate-500 py-2">No objects stored in this bucket.</div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400 bg-slate-900/60">
                      <tr>
                        <th className="py-2 px-3 font-medium">Object Key</th>
                        <th className="py-2 px-3 font-medium">Size</th>
                        <th className="py-2 px-3 font-medium">Last Modified</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {b.objects.map((o) => (
                        <tr key={o.key} className="hover:bg-slate-900/40">
                          <td className="py-2 px-3 font-mono text-slate-200">{o.key}</td>
                          <td className="py-2 px-3 text-slate-400 font-mono">{o.sizeBytes} B</td>
                          <td className="py-2 px-3 text-slate-400 font-mono">{new Date(o.lastModified).toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          ))}

          {filteredBuckets.length === 0 && buckets !== null && (
            <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/20 p-12 text-center">
              <p className="text-xs text-slate-500">{CONSTANTS.LABELS.NO_BUCKETS}</p>
            </div>
          )}
        </div>
      )}

      {/* SSM Parameters Tab */}
      {tab === "ssm" && (
        <Card className="overflow-hidden p-0 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-slate-800 p-4">
            <span className="text-xs font-semibold text-slate-300">SSM Parameter Store</span>
            <button
              onClick={() => setRevealSecrets((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 border border-slate-800 transition-all"
            >
              {revealSecrets ? <EyeOff className="h-3.5 w-3.5 text-amber-400" /> : <Eye className="h-3.5 w-3.5" />}
              {revealSecrets ? "Hide Secure Strings" : "Reveal Secure Strings"}
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="px-4 py-3 font-medium">Parameter Name</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredSsm.map((p) => (
                  <tr key={p.name} className="hover:bg-slate-900/60 transition-colors">
                    <td className="px-4 py-2.5 font-mono text-slate-200 font-medium">{p.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={p.type === "SecureString" ? "amber" : "neutral"}>{p.type}</Badge>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-slate-300 break-all">
                      {p.type === "SecureString" && !revealSecrets ? "••••••••••••" : p.value}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSsm.length === 0 && ssm !== null && (
            <div className="p-6 text-center text-xs text-slate-500">{CONSTANTS.LABELS.NO_SSM}</div>
          )}
        </Card>
      )}

      {/* CREATE SQS QUEUE MODAL */}
      {isCreateQueueOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Create SQS Queue</h3>
              <button onClick={() => setIsCreateQueueOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Queue Name</label>
              <input
                type="text"
                value={newQueueName}
                onChange={(e) => setNewQueueName(e.target.value)}
                placeholder="e.g. order-completed"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsCreateQueueOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateQueue} disabled={creatingQueue || !newQueueName.trim()}>
                {creatingQueue ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                Create Queue
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE S3 BUCKET MODAL */}
      {isCreateBucketOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Create S3 Bucket</h3>
              <button onClick={() => setIsCreateBucketOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Bucket Name</label>
              <input
                type="text"
                value={newBucketName}
                onChange={(e) => setNewBucketName(e.target.value)}
                placeholder="e.g. app-user-uploads"
                className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsCreateBucketOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateBucket} disabled={creatingBucket || !newBucketName.trim()}>
                {creatingBucket ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                Create Bucket
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE SSM PARAMETER MODAL */}
      {isCreateSsmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Create SSM Parameter</h3>
              <button onClick={() => setIsCreateSsmOpen(false)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Parameter Name</label>
                <input
                  type="text"
                  value={newSsmName}
                  onChange={(e) => setNewSsmName(e.target.value)}
                  placeholder="e.g. /app/config/api-key"
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Parameter Value</label>
                <textarea
                  value={newSsmValue}
                  onChange={(e) => setNewSsmValue(e.target.value)}
                  placeholder="e.g. secret_val_123"
                  rows={3}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs font-mono text-slate-200 focus:border-amber-500 focus:outline-none custom-scrollbar"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">Type</label>
                <select
                  value={newSsmType}
                  onChange={(e) => setNewSsmType(e.target.value as "String" | "SecureString" | "StringList")}
                  className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200 focus:border-amber-500 focus:outline-none"
                >
                  <option value="String">String</option>
                  <option value="SecureString">SecureString</option>
                  <option value="StringList">StringList</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button onClick={() => setIsCreateSsmOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateSsm} disabled={creatingSsm || !newSsmName.trim()}>
                {creatingSsm ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                Create Parameter
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueCard({
  queue,
  conn,
  onLabelSaved,
  onPurged,
}: {
  queue: SqsQueue;
  conn: string;
  onLabelSaved: (label: string) => void;
  onPurged: () => void;
}) {
  const [label, setLabel] = useState(queue.label);
  const [syncedLabel, setSyncedLabel] = useState(queue.label);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [copiedUrl, setCopiedUrl] = useState(false);
  const [confirmPurge, setConfirmPurge] = useState(false);
  const [purging, setPurging] = useState(false);

  if (queue.label !== syncedLabel) {
    setSyncedLabel(queue.label);
    setLabel(queue.label);
  }

  const saveLabel = async () => {
    const next = label.trim() || queue.name;
    setLabel(next);
    if (next === queue.label) return;
    setSaving(true);
    try {
      const res = await api.localstack.setQueueLabel(conn, queue.name, next);
      onLabelSaved(res.label);
      setSaved(true);
      setTimeout(() => setSaved(false), CONSTANTS.SAVED_TOAST_DURATION_MS);
    } finally {
      setSaving(false);
    }
  };

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(queue.url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 1500);
  };

  const handlePurgeConfirmed = async () => {
    setPurging(true);
    try {
      await api.localstack.purgeQueue(conn, queue.name);
      onPurged();
      setConfirmPurge(false);
    } finally {
      setPurging(false);
    }
  };

  const hasCustomAlias = queue.label && queue.label !== queue.name;

  return (
    <Card className="group flex flex-col justify-between p-5 border-slate-800/90 bg-slate-900/60 backdrop-blur-xl hover:border-slate-700 transition-all duration-200 shadow-xl shadow-black/40 space-y-4">
      <div className="space-y-4">
        {/* Header with Single Editable Name Input */}
        <div className="border-b border-slate-800/80 pb-3">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
              <Pencil className="h-3 w-3 text-amber-400" />
              Queue Alias / Name
            </span>
            {saving && (
              <span className="flex items-center gap-1 text-[11px] text-amber-400">
                <Spinner /> Saving...
              </span>
            )}
            {saved && (
              <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved
              </span>
            )}
          </div>

          <div className="relative flex items-center">
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onBlur={saveLabel}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              placeholder="Queue Name / Display Label"
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm font-semibold text-slate-100 hover:border-slate-700 focus:border-amber-500 focus:bg-slate-950 focus:outline-none transition-all pr-8"
            />
            <Pencil className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>

          {hasCustomAlias && (
            <div className="mt-1.5 text-[11px] font-mono text-slate-500">
              System Queue: <span className="text-slate-400">{queue.name}</span>
            </div>
          )}
        </div>

        {/* Clear Queue URL Box with Copy Button */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-mono text-slate-400 uppercase tracking-wider text-[10px]">Queue URL</span>
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex items-center gap-1 text-[10px] text-amber-400 hover:text-amber-300 transition-colors font-medium"
            >
              {copiedUrl ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedUrl ? "Copied URL!" : "Copy URL"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950 p-2.5 font-mono text-xs text-amber-300/90 break-all select-all font-medium leading-relaxed">
            {queue.url}
          </div>
        </div>

        {/* Queue Metrics Badges */}
        <div className="flex flex-wrap gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
              queue.visible > 0
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                : "bg-slate-950 text-slate-400 border border-slate-800"
            }`}
          >
            <span className="font-mono">{queue.visible}</span> visible
          </span>

          <span
            className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold ${
              queue.inFlight > 0
                ? "bg-sky-500/20 text-sky-300 border border-sky-500/30"
                : "bg-slate-950 text-slate-400 border border-slate-800"
            }`}
          >
            <span className="font-mono">{queue.inFlight}</span> in flight
          </span>

          {queue.hasRedrivePolicy && (
            <span className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-300 border border-emerald-500/30">
              <Check className="h-3 w-3" /> DLQ Wired
            </span>
          )}
        </div>
      </div>

      {/* Card Actions Footer */}
      <div className="border-t border-slate-800/80 pt-3 flex items-center justify-end">
        <Button variant="danger" onClick={() => setConfirmPurge(true)} disabled={purging}>
          {purging ? <Spinner /> : <Trash2 className="h-3.5 w-3.5" />}
          Purge Queue
        </Button>
      </div>

      {/* CONFIRM PURGE MODAL */}
      {confirmPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/50 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">{CONSTANTS.LABELS.PURGE_MODAL_TITLE}</h3>
                <p className="text-xs text-slate-400">All visible and in-flight messages will be deleted</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              Are you sure you want to purge all messages in queue &quot;
              <strong className="text-slate-100 font-mono">{queue.name}</strong>&quot;? This action cannot be undone.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button onClick={() => setConfirmPurge(false)}>Cancel</Button>
              <Button variant="danger" onClick={handlePurgeConfirmed} disabled={purging}>
                {purging ? <Spinner /> : "Confirm Purge"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
