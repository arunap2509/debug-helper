"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
  Copy,
  Folder,
  FolderOpen,
  Globe,
  Info,
  Play,
  Plus,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Webhook,
  XCircle,
} from "lucide-react";
import { api } from "@/lib/api";
import { WiremockMapping, WiremockTryResult } from "@/lib/types";
import { useConnections } from "@/lib/useConnections";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, JsonBlock, PageHeader, Spinner } from "@/components/ui";
import ConnectionPicker from "@/components/ConnectionPicker";
import { JsonEditor, jsonValidity } from "@/components/CodeEditor";

const CONSTANTS = {
  SERVICE_TYPE: "wiremock" as const,
  ALL_METHODS: "ALL" as const,
  METHODS: ["GET", "POST", "PUT", "PATCH", "DELETE"] as const,
  DEFAULT_PRIORITY: 5,
  LABELS: {
    PAGE_TITLE: "Wiremock API Stubs",
    PAGE_SUBTITLE: "Inspect, group, detect conflicts, and test mock HTTP API endpoints.",
    RESET_BUTTON_LABEL: "Reset APIs",
    NO_MAPPINGS_FOUND: "No mock endpoints match your search filter.",
    TRY_PANEL_TITLE: "Request Tester",
    CONFLICT_BANNER_TITLE: "Conflicting API Stubs Detected!",
    CONFLICT_BANNER_SUBTITLE:
      "Multiple stubs match identical (Method, URL) routes. Wiremock evaluates stubs by priority & registration order — shadowed stubs will never be hit by test suites.",
    ACTIVE_TARGET_BADGE: "Active Target",
    SHADOWED_BADGE: "Shadowed / Ignored",
    NEWER_BADGE: "Newer",
    OLDER_BADGE: "Older",
  },
} as const;

interface ConflictAnalysis {
  isConflict: boolean;
  isActiveWinner: boolean;
  winnerStubId: string;
  reason: string;
  isNewer: boolean;
  conflictingCount: number;
}

function methodTone(method: string): "blue" | "green" | "amber" | "red" | "violet" | "neutral" {
  const m = method.toUpperCase();
  if (m === "GET") return "blue";
  if (m === "POST") return "green";
  if (m === "DELETE") return "red";
  if (m === "PATCH") return "violet";
  if (m === "PUT") return "amber";
  return "neutral";
}

function statusTone(status: number): "green" | "amber" | "red" {
  if (status < 300) return "green";
  if (status < 500) return "amber";
  return "red";
}

function getGroupPath(url: string): string {
  if (!url) return "/other";
  const clean = url.split("?")[0].replace(/\[.*?\]\+?/g, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length === 0) return "/ (root)";
  if (parts.length === 1) return `/${parts[0]}`;
  return `/${parts[0]}/${parts[1]}`;
}

/**
 * Analyzes stubs to find conflicting (Method, URL) pairs,
 * determines which stub Wiremock WILL hit (Priority winner),
 * and labels Newer vs Older registrations.
 */
function analyzeConflicts(allMappings: WiremockMapping[]): Record<string, ConflictAnalysis> {
  const analysisMap: Record<string, ConflictAnalysis> = {};

  const keyGroups: Record<string, WiremockMapping[]> = {};
  for (const m of allMappings) {
    const key = `${(m.method || "").toUpperCase()}::${m.url || ""}`;
    if (!keyGroups[key]) keyGroups[key] = [];
    keyGroups[key].push(m);
  }

  for (const group of Object.values(keyGroups)) {
    if (group.length > 1) {
      // Sort by Wiremock precedence:
      // 1. Priority (ascending numerical value; null defaults to 5)
      // 2. Original insertion order (ascending index)
      const sorted = [...group].sort((a, b) => {
        const pA = a.priority ?? CONSTANTS.DEFAULT_PRIORITY;
        const pB = b.priority ?? CONSTANTS.DEFAULT_PRIORITY;
        if (pA !== pB) return pA - pB;
        return (a.insertedOrder ?? 0) - (b.insertedOrder ?? 0);
      });

      const winner = sorted[0];
      const orders = group.map((g) => g.insertedOrder ?? 0);
      const maxOrder = Math.max(...orders);

      for (const item of group) {
        const isWinner = item.id === winner.id;
        const itemOrder = item.insertedOrder ?? 0;
        const isNewer = itemOrder === maxOrder;

        analysisMap[item.id] = {
          isConflict: true,
          isActiveWinner: isWinner,
          winnerStubId: winner.id,
          conflictingCount: group.length,
          isNewer,
          reason: isWinner
            ? `Active Wiremock Target (Priority ${winner.priority ?? CONSTANTS.DEFAULT_PRIORITY})`
            : `Shadowed by active stub (Priority ${winner.priority ?? CONSTANTS.DEFAULT_PRIORITY})`,
        };
      }
    } else if (group.length === 1) {
      const item = group[0];
      analysisMap[item.id] = {
        isConflict: false,
        isActiveWinner: true,
        winnerStubId: item.id,
        conflictingCount: 1,
        isNewer: false,
        reason: "Unique endpoint mapping",
      };
    }
  }

  return analysisMap;
}

export default function WiremockPage() {
  const { connections, selected, setSelected } = useConnections(CONSTANTS.SERVICE_TYPE);
  const [mappings, setMappings] = useState<WiremockMapping[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isResetting, setIsResetting] = useState(false);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);

  // Grouping, search & filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>(CONSTANTS.ALL_METHODS);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Request tester state
  const [method, setMethod] = useState("GET");
  const [path, setPath] = useState("/health");
  const [body, setBody] = useState("");
  const [trying, setTrying] = useState(false);
  const [result, setResult] = useState<WiremockTryResult | null>(null);
  const [tryError, setTryError] = useState<string | null>(null);

  const load = (refresh = false) => {
    if (!selected) {
      setLoading(false);
      return;
    }
    setLoading(true);
    api.wiremock
      .mappings(selected, refresh)
      .then((m) => {
        setMappings(m);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const handleReset = async () => {
    if (!selected) return;
    setIsResetting(true);
    try {
      await api.wiremock.reset(selected);
      load(true);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsResetting(false);
    }
  };

  const selectedConnObj = connections?.find((c) => c.id === selected);
  const baseUrl = selectedConnObj
    ? `http://${selectedConnObj.fields.host}:${selectedConnObj.fields.port}`
    : "http://localhost:8080";

  const handleCopyBaseUrl = () => {
    navigator.clipboard.writeText(baseUrl);
    setCopiedBaseUrl(true);
    setTimeout(() => setCopiedBaseUrl(false), 1500);
  };

  const bodyCheck = jsonValidity(body);
  const showsBody = method !== "GET" && method !== "DELETE";

  const runTry = async () => {
    if (!selected) return;
    setTrying(true);
    setTryError(null);
    setResult(null);

    let parsedBody: unknown = undefined;
    if (showsBody && body.trim()) {
      try {
        parsedBody = JSON.parse(body);
      } catch {
        setTryError("Body is not valid JSON");
        setTrying(false);
        return;
      }
    }

    try {
      const res = await api.wiremock.try({
        conn: selected,
        method,
        path,
        body: showsBody ? body || undefined : undefined,
      });
      setResult(res);
    } catch (e) {
      setTryError(String(e));
    } finally {
      setTrying(false);
    }
  };

  const toggleGroup = (groupKey: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

  // Run conflict analysis on all mappings
  const conflictAnalysisMap = analyzeConflicts(mappings ?? []);

  // Total conflicting mappings count
  const conflictingMappingsCount = Object.values(conflictAnalysisMap).filter((a) => a.isConflict).length;

  // Filter mappings by search & method filter
  const filteredMappings = (mappings ?? []).filter((m) => {
    const matchesMethod = methodFilter === CONSTANTS.ALL_METHODS || m.method.toUpperCase() === methodFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      m.url.toLowerCase().includes(q) ||
      m.method.toLowerCase().includes(q) ||
      (m.name && m.name.toLowerCase().includes(q)) ||
      String(m.status).includes(q);
    return matchesMethod && matchesSearch;
  });

  // Group filtered mappings by base URL path
  const groupedMappings: Record<string, WiremockMapping[]> = {};
  for (const m of filteredMappings) {
    const groupKey = getGroupPath(m.url);
    if (!groupedMappings[groupKey]) {
      groupedMappings[groupKey] = [];
    }
    groupedMappings[groupKey].push(m);
  }

  const groupKeys = Object.keys(groupedMappings).sort();
  const theme = SERVICE_THEME.wiremock;

  if (connections !== null && connections.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={theme.icon}
          iconClassName={`${theme.iconBg} ${theme.iconText}`}
          title={CONSTANTS.LABELS.PAGE_TITLE}
          subtitle={CONSTANTS.LABELS.PAGE_SUBTITLE}
        />
        <Card className="p-8 text-center space-y-4 max-w-xl mx-auto border-dashed border-slate-800">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">No Wiremock Connection Configured</h3>
            <p className="text-xs text-slate-400 mt-1">
              There are no active Wiremock target connections. Add a connection in Admin to monitor mock stubs.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="primary">
              <Plus className="h-3.5 w-3.5" />
              Configure Wiremock Connection in Admin
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

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
            <Button variant="default" onClick={handleReset} disabled={loading || isResetting}>
              <RotateCcw className={`h-3.5 w-3.5 text-slate-400 ${isResetting ? "animate-spin" : ""}`} />
              {CONSTANTS.LABELS.RESET_BUTTON_LABEL}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {/* Prominent Wiremock Base URL Banner */}
      <Card className="p-4 border-slate-800/90 bg-slate-900/60 backdrop-blur-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400 border border-violet-500/30">
            <Globe className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-300">Wiremock Base URL</span>
              <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                Live Endpoint
              </span>
            </div>
            <div className="mt-0.5 font-mono text-sm font-bold text-violet-300 select-all">{baseUrl}</div>
          </div>
        </div>

        <button
          onClick={handleCopyBaseUrl}
          className="inline-flex items-center gap-1.5 rounded-xl bg-slate-950 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white border border-slate-800 transition-colors"
        >
          {copiedBaseUrl ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-slate-400" />
          )}
          {copiedBaseUrl ? "Copied Base URL!" : "Copy Base URL"}
        </button>
      </Card>

      {/* Conflict Warning Banner if Conflicts Exist */}
      {conflictingMappingsCount > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 backdrop-blur-md space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 text-amber-300">
              <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
              <h3 className="text-sm font-semibold">{CONSTANTS.LABELS.CONFLICT_BANNER_TITLE}</h3>
            </div>
            <span className="rounded-lg bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-200 border border-amber-500/40">
              {conflictingMappingsCount} conflicting stubs
            </span>
          </div>

          <p className="text-xs leading-relaxed text-amber-200/90 pl-7">
            {CONSTANTS.LABELS.CONFLICT_BANNER_SUBTITLE}
          </p>
        </div>
      )}

      {/* Main Workbench: Left List (Grouped Mappings with Conflict Badges) & Right Inspector (Request Tester) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Search, Method Filter & API Group Accordions */}
        <Card className="flex flex-col min-w-0 p-4 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl lg:col-span-6 space-y-4">
          {/* Search & Method Filters */}
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search mock endpoints by path, name, or status..."
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-4 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500 transition-all font-mono"
              />
            </div>

            {/* HTTP Method Filter Pills */}
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs text-slate-400">
              <span>Method:</span>
              <div className="flex flex-wrap gap-1">
                {[CONSTANTS.ALL_METHODS, ...CONSTANTS.METHODS].map((m) => (
                  <button
                    key={m}
                    onClick={() => setMethodFilter(m)}
                    className={`rounded-lg px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      methodFilter === m
                        ? "bg-violet-500 text-white shadow-sm"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Grouped API List with Precedence & Conflict Badges */}
          <div className="flex-1 min-h-[400px] max-h-[600px] overflow-y-auto space-y-3 custom-scrollbar pr-1">
            {loading && !mappings && (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <Spinner />
                <span>Loading Wiremock stubs...</span>
              </div>
            )}

            {!loading && groupKeys.length === 0 && (
              <div className="flex h-48 flex-col items-center justify-center text-center p-4">
                <Webhook className="h-8 w-8 text-slate-700 mb-2" />
                <p className="text-xs text-slate-400 font-medium">{CONSTANTS.LABELS.NO_MAPPINGS_FOUND}</p>
              </div>
            )}

            {groupKeys.map((groupKey) => {
              const groupMappings = groupedMappings[groupKey];
              const isCollapsed = collapsedGroups[groupKey];
              const groupHasConflicts = groupMappings.some((m) => conflictAnalysisMap[m.id]?.isConflict);

              return (
                <div
                  key={groupKey}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    groupHasConflicts
                      ? "border-amber-500/50 bg-amber-950/10 shadow-md shadow-amber-950/20"
                      : "border-slate-800 bg-slate-950/60"
                  }`}
                >
                  {/* Group Accordion Header */}
                  <button
                    onClick={() => toggleGroup(groupKey)}
                    className="flex w-full items-center justify-between bg-slate-900/80 px-3.5 py-2.5 text-left text-xs font-semibold text-slate-200 hover:bg-slate-800/80 transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {isCollapsed ? (
                        <Folder className="h-4 w-4 text-violet-400 shrink-0" />
                      ) : (
                        <FolderOpen className="h-4 w-4 text-violet-400 shrink-0" />
                      )}
                      <span className="truncate font-mono text-xs text-violet-300">{groupKey}</span>
                      <span className="rounded-md bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400 font-mono">
                        {groupMappings.length}
                      </span>
                      {groupHasConflicts && (
                        <span className="flex items-center gap-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                          <AlertTriangle className="h-2.5 w-2.5" /> Conflict
                        </span>
                      )}
                    </div>
                    {isCollapsed ? (
                      <ChevronRight className="h-4 w-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-500" />
                    )}
                  </button>

                  {/* Group Items */}
                  {!isCollapsed && (
                    <div className="divide-y divide-slate-800/60">
                      {groupMappings.map((m) => {
                        const conflictInfo = conflictAnalysisMap[m.id];
                        const isConflict = conflictInfo?.isConflict;
                        const isActiveWinner = conflictInfo?.isActiveWinner;
                        const isNewer = conflictInfo?.isNewer;

                        return (
                          <button
                            key={m.id}
                            onClick={() => {
                              setMethod(m.method);
                              setPath(m.url.replace(/\[.*?\]\+?/g, "1"));
                              setResult(null);
                              setTryError(null);
                            }}
                            className={`group flex w-full flex-col gap-2 px-3.5 py-3 text-left text-xs transition-colors ${
                              isConflict
                                ? isActiveWinner
                                  ? "bg-emerald-950/20 hover:bg-emerald-900/30"
                                  : "bg-rose-950/20 hover:bg-rose-900/30 opacity-75 hover:opacity-100"
                                : "hover:bg-slate-800/60"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex min-w-0 items-center gap-2">
                                <Badge tone={methodTone(m.method)}>{m.method}</Badge>
                                <span className="truncate font-mono text-xs text-slate-200 group-hover:text-violet-200 transition-colors">
                                  {m.url}
                                </span>
                              </div>

                              <div className="flex shrink-0 items-center gap-1.5">
                                {m.delayMs && (
                                  <span className="flex items-center gap-1 text-[10px] font-mono text-amber-400">
                                    <Clock className="h-2.5 w-2.5" /> {m.delayMs}ms
                                  </span>
                                )}
                                <Badge tone={statusTone(m.status)}>{m.status}</Badge>
                              </div>
                            </div>

                            {/* Conflict & Execution Target Badges */}
                            {isConflict && (
                              <div className="flex flex-wrap items-center gap-1.5 pt-0.5 text-[10px]">
                                {isActiveWinner ? (
                                  <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-2 py-0.5 font-semibold text-emerald-300 border border-emerald-500/40">
                                    <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                    {CONSTANTS.LABELS.ACTIVE_TARGET_BADGE}
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 rounded bg-rose-500/20 px-2 py-0.5 font-semibold text-rose-300 border border-rose-500/40">
                                    <XCircle className="h-3 w-3 text-rose-400" />
                                    {CONSTANTS.LABELS.SHADOWED_BADGE}
                                  </span>
                                )}

                                {isNewer ? (
                                  <span className="rounded bg-sky-500/15 px-2 py-0.5 font-mono font-semibold text-sky-300 border border-sky-500/30">
                                    {CONSTANTS.LABELS.NEWER_BADGE}
                                  </span>
                                ) : (
                                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono font-semibold text-slate-400 border border-slate-700">
                                    {CONSTANTS.LABELS.OLDER_BADGE}
                                  </span>
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        {/* Right Column: Request Tester Panel */}
        <Card className="flex flex-col min-w-0 p-5 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl lg:col-span-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-slate-100">{CONSTANTS.LABELS.TRY_PANEL_TITLE}</h3>
            </div>
          </div>

          {/* Request Form */}
          <div className="space-y-3">
            <div className="flex gap-2.5">
              <div className="relative shrink-0">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value)}
                  className="appearance-none rounded-xl border border-slate-800 bg-slate-950 pl-3.5 pr-9 py-2 text-xs font-semibold text-slate-200 focus:border-violet-500 focus:outline-none cursor-pointer shadow-inner"
                >
                  {CONSTANTS.METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              </div>

              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/api/customers/1"
                className="min-w-0 flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 font-mono text-xs text-slate-200 focus:border-violet-500 focus:outline-none shadow-inner"
              />

              <Button
                variant="primary"
                onClick={runTry}
                disabled={trying || !path || (showsBody && !bodyCheck.valid)}
              >
                {trying ? <Spinner /> : <Send className="h-3.5 w-3.5" />}
                Send
              </Button>
            </div>

            {/* Request Body JSON Editor */}
            {showsBody && (
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  Request Payload (JSON)
                </label>
                <JsonEditor value={body} onChange={setBody} placeholder='{"key": "value"}' height="130px" />
                <div className="flex items-center gap-1.5 text-[11px]">
                  {bodyCheck.valid ? (
                    body.trim() ? (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400">valid JSON</span>
                      </>
                    ) : (
                      <span className="text-slate-500">empty payload sent</span>
                    )
                  ) : (
                    <>
                      <XCircle className="h-3.5 w-3.5 text-rose-400" />
                      <span className="text-rose-400">{bodyCheck.message}</span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {tryError && <ErrorBox message={tryError} />}

          {/* Response Output Box */}
          {result && (
            <div className="space-y-2 border-t border-slate-800 pt-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">Response</span>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(result.status)}>{result.status}</Badge>
                  <span className="font-mono text-xs text-slate-400">{result.elapsedMs}ms</span>
                </div>
              </div>

              <div className="max-h-72 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3">
                <JsonBlock value={result.body} />
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
