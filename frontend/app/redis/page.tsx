"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Clock,
  Code2,
  Copy,
  Database,
  FileText,
  Key,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { RedisDb, RedisKeyEntry, RedisValueType } from "@/lib/types";
import { useConnections } from "@/lib/useConnections";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, JsonBlock, PageHeader, Spinner } from "@/components/ui";
import ConnectionPicker from "@/components/ConnectionPicker";

const CONSTANTS = {
  SERVICE_TYPE: "redis" as const,
  ALL_TYPES_FILTER: "ALL" as const,
  LABELS: {
    PAGE_TITLE: "Redis Data Explorer",
    PAGE_SUBTITLE: "Inspect, update, and manage Redis cache keys and databases.",
    SEARCH_PLACEHOLDER: "Search keys by name or pattern...",
    NO_KEYS_MATCH: "No keys match the specified search or type filter.",
    SELECT_KEY_PROMPT: "Select a key from the left panel to inspect its value, structure, and metadata.",
    DELETE_KEY_MODAL_TITLE: "Delete Redis Key",
    ADD_KEY_MODAL_TITLE: "Add / Set Cache Key",
    REFRESH_BUTTON_LABEL: "Rescan Redis",
    ADD_KEY_BUTTON_LABEL: "Add Key / Cache",
  },
} as const;

const TYPE_TONES: Record<RedisValueType, "blue" | "amber" | "violet" | "green" | "red" | "neutral"> = {
  string: "blue",
  hash: "amber",
  list: "violet",
  set: "green",
  zset: "red",
  none: "neutral",
};

export default function RedisPage() {
  const { connections, selected, setSelected, loadingConnections } = useConnections(CONSTANTS.SERVICE_TYPE);
  const [dbs, setDbs] = useState<RedisDb[] | null>(null);
  const [selectedDb, setSelectedDb] = useState(0);

  // Search & Type filter state
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<RedisValueType | typeof CONSTANTS.ALL_TYPES_FILTER>(
    CONSTANTS.ALL_TYPES_FILTER
  );

  const [keys, setKeys] = useState<RedisKeyEntry[] | null>(null);
  const [selectedKey, setSelectedKey] = useState<RedisKeyEntry | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loadingDbs, setLoadingDbs] = useState(true);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedValue, setCopiedValue] = useState(false);
  const [viewMode, setViewMode] = useState<"json" | "raw">("json");

  // Modal states for Delete and Add Key
  const [keyToDelete, setKeyToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [isAddKeyOpen, setIsAddKeyOpen] = useState(false);
  const [newKeyDb, setNewKeyDb] = useState<number>(0);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyValue, setNewKeyValue] = useState("");
  const [newKeyTtl, setNewKeyTtl] = useState("");
  const [isSettingKey, setIsSettingKey] = useState(false);

  const loadDbs = (refresh = false) => {
    if (!selected) {
      setLoadingDbs(false);
      return;
    }
    setLoadingDbs(true);
    api.redis
      .dbs(selected, refresh)
      .then((d) => {
        setDbs(d);
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingDbs(false));
  };

  const formatPattern = (query: string) => {
    const q = query.trim();
    if (!q || q === "*") return "*";
    if (q.includes("*") || q.includes("?")) return q;
    return `*${q}*`;
  };

  const loadKeys = (refresh = false) => {
    if (!selected) return;
    setLoadingKeys(true);
    const pattern = formatPattern(searchQuery);
    api.redis
      .keys(selected, selectedDb, pattern, refresh)
      .then((k) => {
        setKeys(k);
        if (selectedKey) {
          const matching = k.find((item) => item.key === selectedKey.key);
          setSelectedKey(matching ?? null);
        }
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingKeys(false));
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    loadDbs(true);
    loadKeys(true);
    setTimeout(() => setIsRefreshing(false), 500);
  };

  useEffect(() => {
    loadDbs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    loadKeys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedDb]);

  const handleDeleteConfirmed = async () => {
    if (!selected || !keyToDelete) return;
    setIsDeleting(true);
    try {
      await api.redis.deleteKey(selected, selectedDb, keyToDelete);
      if (selectedKey?.key === keyToDelete) {
        setSelectedKey(null);
      }
      setKeyToDelete(null);
      loadKeys(true);
      loadDbs(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCreateKey = async () => {
    if (!selected || !newKeyName.trim()) return;
    setIsSettingKey(true);
    try {
      const ttlNum = newKeyTtl ? Number(newKeyTtl) : undefined;
      await api.redis.setKey(selected, newKeyDb, newKeyName.trim(), newKeyValue, ttlNum);

      // Switch to targeted DB if created elsewhere
      if (selectedDb !== newKeyDb) {
        setSelectedDb(newKeyDb);
      }

      setNewKeyName("");
      setNewKeyValue("");
      setNewKeyTtl("");
      setIsAddKeyOpen(false);
      loadKeys(true);
      loadDbs(true);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setIsSettingKey(false);
    }
  };

  const handleCopyText = (text: string, isValue = false) => {
    navigator.clipboard.writeText(text);
    if (isValue) {
      setCopiedValue(true);
      setTimeout(() => setCopiedValue(false), 1500);
    } else {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 1500);
    }
  };

  const theme = SERVICE_THEME.redis;

  // Filter keys by search query substring & selected value type
  const filteredKeys = (keys ?? []).filter((k) => {
    const matchesType = typeFilter === CONSTANTS.ALL_TYPES_FILTER || k.type === typeFilter;
    const rawQuery = searchQuery.trim().toLowerCase().replace(/\*/g, "");
    const matchesQuery = !rawQuery || k.key.toLowerCase().includes(rawQuery);
    return matchesType && matchesQuery;
  });

  const activeDbKeyCount = dbs?.find((d) => d.db === selectedDb)?.keyCount ?? keys?.length ?? 0;

  // Redis always has 16 logical dbs whether or not anything's in them —
  // only show ones that actually hold data (plus whichever db is currently
  // selected, so switching to it and later clearing it doesn't make the
  // button disappear out from under you). Falls back to db 0 if every db
  // is empty, so there's always at least one button to click.
  const nonEmptyDbs = (dbs ?? []).filter((d) => d.keyCount > 0 || d.db === selectedDb);
  const displayDbs = nonEmptyDbs.length > 0 ? nonEmptyDbs : (dbs ?? []).filter((d) => d.db === 0);

  if (loadingConnections || connections === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          icon={theme.icon}
          iconClassName={`${theme.iconBg} ${theme.iconText}`}
          title={CONSTANTS.LABELS.PAGE_TITLE}
          subtitle={CONSTANTS.LABELS.PAGE_SUBTITLE}
        />
        <div className="flex items-center justify-center p-12 text-xs text-slate-500 gap-2">
          <Spinner />
          <span>Loading connections...</span>
        </div>
      </div>
    );
  }

  if (connections.length === 0) {
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
            <AlertCircle className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100">No Redis Connection Configured</h3>
            <p className="text-xs text-slate-400 mt-1">
              There are no active Redis target connections. Add a connection in Admin to manage Redis data.
            </p>
          </div>
          <Link href="/admin">
            <Button variant="primary">
              <Plus className="h-3.5 w-3.5" />
              Configure Redis Connection in Admin
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
        action={
          <div className="flex flex-wrap items-center gap-2.5">
            <ConnectionPicker connections={connections ?? []} selected={selected} onChange={setSelected} />
            <Button
              variant="default"
              onClick={handleRefreshAll}
              disabled={loadingDbs || loadingKeys || isRefreshing}
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loadingDbs || loadingKeys || isRefreshing ? "animate-spin" : ""}`} />
              {CONSTANTS.LABELS.REFRESH_BUTTON_LABEL}
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setNewKeyDb(selectedDb);
                setIsAddKeyOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              {CONSTANTS.LABELS.ADD_KEY_BUTTON_LABEL}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {/* DB Switcher Row (5 Databases) */}
      <Card className="p-4 border-slate-800/80 bg-slate-900/50 backdrop-blur-md">
        <div className="mb-3 flex items-center justify-between px-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <Database className="h-4 w-4 text-rose-400" />
            Databases
          </span>
          <span className="text-xs text-slate-400">
            Active: <strong className="text-rose-300 font-mono">db {selectedDb}</strong> ({activeDbKeyCount} keys)
          </span>
        </div>

        {/* DB buttons — the list comes from GET /api/redis/dbs, which asks
            the server (CONFIG GET databases) how many logical dbs it's
            actually configured for, then we only show ones with data (every
            Redis has 16 dbs by default whether or not anything's in them). */}
        {!dbs && loadingDbs ? (
          <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
            <Spinner /> fetching database list from redis...
          </div>
        ) : (
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
            {displayDbs.map((dbData) => {
              const dbNum = dbData.db;
              const keyCount = dbData.keyCount;
              const isActive = selectedDb === dbNum;

              return (
                <button
                  key={dbNum}
                  onClick={() => setSelectedDb(dbNum)}
                  className={`relative flex flex-col items-start gap-1 rounded-xl border p-3 transition-all active:scale-[0.98] ${
                    isActive
                      ? "border-rose-500/80 bg-rose-500/15 text-rose-200 shadow-lg shadow-rose-950/40 ring-1 ring-rose-500/40"
                      : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <span className="font-mono text-sm font-semibold">db {dbNum}</span>
                  <span
                    className={`rounded-lg px-2 py-0.5 text-xs font-bold font-mono ${
                      keyCount > 0
                        ? isActive
                          ? "bg-rose-500 text-white"
                          : "bg-slate-800 text-rose-300"
                        : "bg-slate-900/80 text-slate-600"
                    }`}
                  >
                    {keyCount}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {/* Key Explorer Split Screen */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Key List & Search */}
        <Card className="flex flex-col min-w-0 p-4 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl lg:col-span-5">
          {/* Search Input Box */}
          <div className="space-y-3 mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && loadKeys(true)}
                placeholder={CONSTANTS.LABELS.SEARCH_PLACEHOLDER}
                className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-20 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-rose-500/80 focus:outline-none focus:ring-1 focus:ring-rose-500/80 transition-all font-mono"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery("");
                      api.redis.keys(selected!, selectedDb, "*", true).then(setKeys);
                    }}
                    className="p-1 text-slate-500 hover:text-slate-300"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => loadKeys(true)}
                  className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:bg-rose-500 hover:text-white transition-all"
                >
                  Search
                </button>
              </div>
            </div>

            {/* Type Selector Dropdown Filter */}
            <div className="flex items-center justify-between border-t border-slate-800/80 pt-2.5 text-xs text-slate-400">
              <span>Filter Type:</span>
              <div className="flex flex-wrap gap-1">
                {["ALL", "string", "hash", "list", "set", "zset"].map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFilter(t as typeof typeFilter)}
                    className={`rounded-lg px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider transition-colors ${
                      typeFilter === t
                        ? "bg-rose-500 text-white"
                        : "bg-slate-950 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Key List Body */}
          <div className="flex-1 min-h-[360px] max-h-[500px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
            {loadingKeys && !keys && (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <Spinner />
                <span>Scanning database keys...</span>
              </div>
            )}

            {!loadingKeys && filteredKeys.length === 0 && (
              <div className="flex h-48 flex-col items-center justify-center text-center p-4">
                <Key className="h-8 w-8 text-slate-700 mb-2" />
                <p className="text-xs text-slate-400 font-medium">No matching keys</p>
                <p className="text-[11px] text-slate-600 mt-1 max-w-[200px]">
                  {CONSTANTS.LABELS.NO_KEYS_MATCH}
                </p>
              </div>
            )}

            {filteredKeys.map((k) => {
              const isSelected = selectedKey?.key === k.key;
              const tone = TYPE_TONES[k.type] ?? "neutral";

              return (
                <button
                  key={k.key}
                  onClick={() => setSelectedKey(k)}
                  className={`group flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left text-xs transition-all ${
                    isSelected
                      ? "bg-rose-500/20 text-rose-100 border border-rose-500/40 shadow-sm"
                      : "hover:bg-slate-800/60 text-slate-300 border border-transparent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs text-slate-200 group-hover:text-rose-200 transition-colors">
                      {k.key}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone={tone}>{k.type}</Badge>
                    {k.ttl >= 0 ? (
                      <span className="flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-mono text-sky-400 border border-sky-500/20">
                        <Clock className="h-2.5 w-2.5" />
                        {k.ttl}s
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-slate-500">no ttl</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Column: Key Value Inspector */}
        <Card className="flex flex-col min-w-0 p-5 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl lg:col-span-7">
          {!selectedKey ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-4">
                <Code2 className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">Key Inspector Ready</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">{CONSTANTS.LABELS.SELECT_KEY_PROMPT}</p>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col h-full">
              {/* Key Detail Top Bar */}
              <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-mono text-base font-semibold text-slate-100">
                      {selectedKey.key}
                    </span>
                    <button
                      onClick={() => handleCopyText(selectedKey.key, false)}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                      title="Copy Key Name"
                    >
                      {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge tone={TYPE_TONES[selectedKey.type]}>{selectedKey.type}</Badge>
                    <Badge tone={selectedKey.ttl >= 0 ? "blue" : "neutral"}>
                      {selectedKey.ttl >= 0 ? `TTL: ${selectedKey.ttl}s` : "Persistent (No TTL)"}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="danger" onClick={() => setKeyToDelete(selectedKey.key)}>
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete Key
                  </Button>
                </div>
              </div>

              {/* View Toggle Bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 rounded-lg bg-slate-950 p-1 border border-slate-800">
                  <button
                    onClick={() => setViewMode("json")}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      viewMode === "json"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <Code2 className="h-3.5 w-3.5" />
                    Structured / JSON
                  </button>
                  <button
                    onClick={() => setViewMode("raw")}
                    className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      viewMode === "raw"
                        ? "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                        : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Raw Text
                  </button>
                </div>

                <button
                  onClick={() =>
                    handleCopyText(
                      typeof selectedKey.preview === "string"
                        ? selectedKey.preview
                        : JSON.stringify(selectedKey.preview, null, 2),
                      true
                    )
                  }
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800"
                >
                  {copiedValue ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  {copiedValue ? "Copied Value" : "Copy Value"}
                </button>
              </div>

              {/* Value View Container */}
              <div className="flex-1 min-h-[300px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-4">
                {viewMode === "json" ? (
                  <JsonBlock value={selectedKey.preview} />
                ) : (
                  <pre className="max-h-96 overflow-auto text-xs leading-relaxed font-mono text-slate-300 whitespace-pre-wrap">
                    {typeof selectedKey.preview === "string"
                      ? selectedKey.preview
                      : JSON.stringify(selectedKey.preview, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ADD / SET KEY MODAL */}
      {isAddKeyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-100">{CONSTANTS.LABELS.ADD_KEY_MODAL_TITLE}</h3>
                  <p className="text-xs text-slate-400">Create or overwrite a key-value entry in Redis</p>
                </div>
              </div>
              <button
                onClick={() => setIsAddKeyOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Target DB Selector */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Target Database</label>
                <select
                  value={newKeyDb}
                  onChange={(e) => setNewKeyDb(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 focus:border-rose-500 focus:outline-none"
                >
                  {(dbs ?? []).map((dbData) => (
                    <option key={dbData.db} value={dbData.db}>
                      db {dbData.db}
                    </option>
                  ))}
                </select>
              </div>

              {/* Key Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Key Name</label>
                <input
                  type="text"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. session:user_123 or app:config"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* Key Value */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">Key Value (Text / JSON)</label>
                <textarea
                  rows={4}
                  value={newKeyValue}
                  onChange={(e) => setNewKeyValue(e.target.value)}
                  placeholder='e.g. {"active": true, "token": "xyz123"}'
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-rose-500 focus:outline-none"
                />
              </div>

              {/* TTL (Optional) */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-300">
                  Expiration TTL in Seconds <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <input
                  type="number"
                  value={newKeyTtl}
                  onChange={(e) => setNewKeyTtl(e.target.value)}
                  placeholder="e.g. 3600 (leave empty for no TTL)"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:border-rose-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
              <Button onClick={() => setIsAddKeyOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleCreateKey} disabled={isSettingKey || !newKeyName.trim()}>
                {isSettingKey ? <Spinner /> : <Plus className="h-3.5 w-3.5" />}
                Save Key
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE KEY MODAL */}
      {keyToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/15 border border-rose-500/30">
                <Trash2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">{CONSTANTS.LABELS.DELETE_KEY_MODAL_TITLE}</h3>
                <p className="text-xs text-slate-400">Database {selectedDb}</p>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-300">
              Are you sure you want to delete key &quot;<strong className="text-rose-300 font-mono">{keyToDelete}</strong>&quot; from Redis database {selectedDb}?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <Button onClick={() => setKeyToDelete(null)}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteConfirmed} disabled={isDeleting}>
                {isDeleting ? <Spinner /> : "Confirm Delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
