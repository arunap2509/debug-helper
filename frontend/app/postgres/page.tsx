"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Check,
  Code,
  Columns,
  Copy,
  Database,
  Eye,
  FileCode,
  Filter,
  Play,
  Plus,
  RefreshCw,
  Search,
  Table,
  X,
} from "lucide-react";
import { api } from "@/lib/api";
import { PgTable } from "@/lib/types";
import { useConnections } from "@/lib/useConnections";
import { SERVICE_THEME } from "@/lib/theme";
import { Badge, Button, Card, ErrorBox, JsonBlock, PageHeader, Spinner } from "@/components/ui";
import ConnectionPicker from "@/components/ConnectionPicker";
import { SqlEditor } from "@/components/CodeEditor";

const CONSTANTS = {
  SERVICE_TYPE: "postgres" as const,
  DEFAULT_SAMPLE_LIMIT: 5,
  LABELS: {
    PAGE_TITLE: "Postgres Schema Inspector & SQL Runner",
    PAGE_SUBTITLE: "Inspect table schemas, author read-only SQL queries, and inspect sample data (max 5 records).",
    SEARCH_PLACEHOLDER: "Search tables or column names (e.g. users, email, id)...",
    NO_TABLES_FOUND: "No database tables match your search query.",
    SELECT_TABLE_PROMPT: "Select a table from the left panel to populate SQL editor or inspect column schema.",
    REFRESH_BUTTON_LABEL: "Rescan Schema",
    RUN_QUERY_BUTTON: "Run Data Query (5 Recs Max)",
    JSON_INSPECTOR_TITLE: "JSONB Cell Inspector",
  },
} as const;

function dataTypeTone(dataType: string): "blue" | "green" | "amber" | "violet" | "red" | "neutral" {
  const dt = dataType.toLowerCase();
  if (dt.includes("int") || dt.includes("numeric") || dt.includes("decimal") || dt.includes("real") || dt.includes("double") || dt.includes("serial")) {
    return "blue";
  }
  if (dt.includes("char") || dt.includes("text") || dt.includes("varchar")) {
    return "green";
  }
  if (dt.includes("time") || dt.includes("date") || dt.includes("timestamp")) {
    return "amber";
  }
  if (dt.includes("bool")) {
    return "violet";
  }
  if (dt.includes("json")) {
    return "red";
  }
  return "neutral";
}

function validateSqlQuery(sql: string): { valid: true } | { valid: false; error: string } {
  const raw = sql.trim();
  if (!raw) return { valid: false, error: "SQL query cannot be empty." };
  const upper = raw.toUpperCase();
  if (!upper.startsWith("SELECT")) {
    return { valid: false, error: "Only SELECT queries are allowed for read-only safety." };
  }
  const forbidden = ["DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "GRANT", "REVOKE"];
  for (const word of forbidden) {
    const regex = new RegExp(`\\b${word}\\b`, "i");
    if (regex.test(raw)) {
      return { valid: false, error: `Query contains forbidden mutation keyword '${word}'.` };
    }
  }
  return { valid: true };
}

export default function PostgresPage() {
  const { connections, selected, setSelected, loadingConnections } = useConnections(CONSTANTS.SERVICE_TYPE);
  const [tables, setTables] = useState<PgTable[] | null>(null);
  const [selectedTable, setSelectedTable] = useState<PgTable | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);

  // SQL Query Editor & Execution State
  const [sqlQuery, setSqlQuery] = useState("");
  const [queryError, setQueryError] = useState<string | null>(null);
  const [sampleRows, setSampleRows] = useState<Record<string, unknown>[] | null>(null);
  const [executing, setExecuting] = useState(false);
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);

  // Active JSONB cell inspector state
  const [activeJsonCell, setActiveJsonCell] = useState<{ colName: string; val: unknown } | null>(null);

  const load = (refresh = false) => {
    if (!selected) {
      if (!loadingConnections) {
        setLoading(false);
      }
      setIsRefreshing(false);
      return;
    }
    if (refresh) setIsRefreshing(true);
    else setLoading(true);

    api.postgres
      .tables(selected, refresh)
      .then((t) => {
        setTables(t);
        if (selectedTable) {
          const matching = t.find((tbl) => tbl.name === selectedTable.name);
          setSelectedTable(matching ?? (t.length > 0 ? t[0] : null));
        } else if (t.length > 0) {
          setSelectedTable(t[0]);
        }
        setError(null);
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        setLoading(false);
        setIsRefreshing(false);
      });
  };

  useEffect(() => {
    if (selected) {
      load();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // When selected table changes, populate SQL editor with default query WITHOUT running API automatically
  useEffect(() => {
    if (selectedTable) {
      const firstCol = selectedTable.columns[0]?.column_name ?? "id";
      setSqlQuery(`SELECT * FROM "${selectedTable.name}" ORDER BY "${firstCol}" ASC LIMIT 5;`);
    } else {
      setSqlQuery("");
    }
    setSampleRows(null);
    setQueryError(null);
    setIsTableModalOpen(false);
    setActiveJsonCell(null);
  }, [selectedTable]);

  // Execute user-authored or preset SQL query ONLY when button is clicked
  const handleExecuteQuery = async () => {
    if (!selected) return;
    const check = validateSqlQuery(sqlQuery);
    if (!check.valid) {
      setQueryError(check.error);
      return;
    }

    setExecuting(true);
    setQueryError(null);
    try {
      const data = await api.postgres.execute(selected, sqlQuery);
      setSampleRows(data);
      setIsTableModalOpen(true);
    } catch (e) {
      setQueryError(String(e));
    } finally {
      setExecuting(false);
    }
  };

  // Preset SQL query generators (populates editor without auto-running)
  const applyPresetQuery = (presetType: "top" | "latest" | "where") => {
    if (!selectedTable) return;
    const firstCol = selectedTable.columns[0]?.column_name ?? "id";
    if (presetType === "top") {
      setSqlQuery(`SELECT * FROM "${selectedTable.name}" ORDER BY "${firstCol}" ASC LIMIT 5;`);
    } else if (presetType === "latest") {
      setSqlQuery(`SELECT * FROM "${selectedTable.name}" ORDER BY "${firstCol}" DESC LIMIT 5;`);
    } else if (presetType === "where") {
      setSqlQuery(`SELECT * FROM "${selectedTable.name}" WHERE "${firstCol}" IS NOT NULL LIMIT 5;`);
    }
    setQueryError(null);
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(key);
    setTimeout(() => setCopiedText(null), 1500);
  };

  const theme = SERVICE_THEME.postgres;

  // Filter tables by search query matching table name OR column names
  const filteredTables = (tables ?? []).filter((t) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const matchesTableName = t.name.toLowerCase().includes(q);
    const matchesColumnName = t.columns.some(
      (c) => c.column_name.toLowerCase().includes(q) || c.data_type.toLowerCase().includes(q)
    );
    return matchesTableName || matchesColumnName;
  });

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
                <h3 className="text-base font-semibold text-slate-100">No Postgres Connection Configured</h3>
                <p className="text-xs text-slate-400 mt-1">
                  There are no active Postgres target connections. Add a connection in Admin to inspect database tables.
                </p>
              </div>
              <Link href="/admin">
                <Button variant="primary">
                  <Plus className="h-3.5 w-3.5" />
                  Configure Postgres Connection in Admin
                </Button>
              </Link>
            </>
          )}
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
            <Button variant="default" onClick={() => load(true)} disabled={loading || isRefreshing}>
              <RefreshCw className={`h-3.5 w-3.5 text-slate-400 ${loading || isRefreshing ? "animate-spin" : ""}`} />
              {CONSTANTS.LABELS.REFRESH_BUTTON_LABEL}
            </Button>
          </div>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBox message={error} />
        </div>
      )}

      {/* Main Split-Pane Explorer */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left Column: Tables List & Search */}
        <Card className="flex flex-col min-w-0 p-4 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl lg:col-span-5 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={CONSTANTS.LABELS.SEARCH_PLACEHOLDER}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/80 pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-all font-mono"
            />
          </div>

          <div className="flex-1 min-h-[360px] max-h-[580px] overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {(loading || tables === null) && (
              <div className="flex h-48 flex-col items-center justify-center gap-2 text-xs text-slate-500">
                <Spinner />
                <span>Reading Postgres schema tables...</span>
              </div>
            )}

            {!loading && tables !== null && filteredTables.length === 0 && (
              <div className="flex h-48 flex-col items-center justify-center text-center p-4">
                <Table className="h-8 w-8 text-slate-700 mb-2" />
                <p className="text-xs text-slate-400 font-medium">{CONSTANTS.LABELS.NO_TABLES_FOUND}</p>
              </div>
            )}

            {!loading && tables !== null && filteredTables.map((t) => {
              const isSelected = selectedTable?.name === t.name;

              return (
                <button
                  key={t.name}
                  onClick={() => setSelectedTable(t)}
                  className={`group flex w-full items-center justify-between gap-3 rounded-xl px-3.5 py-3 text-left text-xs transition-all ${
                    isSelected
                      ? "bg-sky-500/20 text-sky-100 border border-sky-500/40 shadow-sm"
                      : "hover:bg-slate-800/60 text-slate-300 border border-transparent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-mono text-xs font-semibold text-slate-100 group-hover:text-sky-200 transition-colors">
                      {t.name}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge tone="blue">{t.columns.length} columns</Badge>
                  </div>
                </button>
              );
            })}
          </div>
        </Card>

        {/* Right Column: SQL Query Editor & Schema Inspector */}
        <Card className="flex flex-col min-w-0 p-5 border-slate-800/90 bg-slate-900/50 backdrop-blur-xl lg:col-span-7">
          {!selectedTable ? (
            <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center p-8">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-400 border border-sky-500/20 mb-4">
                <Database className="h-8 w-8" />
              </div>
              <h3 className="text-sm font-semibold text-slate-200">SQL Runner & Inspector Ready</h3>
              <p className="mt-1 text-xs text-slate-500 max-w-xs">{CONSTANTS.LABELS.SELECT_TABLE_PROMPT}</p>
            </div>
          ) : (
            <div className="space-y-5 flex flex-col h-full">
              {/* Selected Table Header */}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-mono text-lg font-bold text-slate-100">{selectedTable.name}</h3>
                    <button
                      onClick={() => handleCopy(selectedTable.name, "tableName")}
                      className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                      title="Copy Table Name"
                    >
                      {copiedText === "tableName" ? (
                        <Check className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </button>
                  </div>

                  <div className="mt-1.5 flex items-center gap-2">
                    <Badge tone="blue">{selectedTable.columns.length} Columns</Badge>
                  </div>
                </div>

                <Button variant="primary" onClick={handleExecuteQuery} disabled={executing}>
                  {executing ? <Spinner /> : <Play className="h-3.5 w-3.5" />}
                  {CONSTANTS.LABELS.RUN_QUERY_BUTTON}
                </Button>
              </div>

              {/* Interactive SQL Editor Section */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Code className="h-3.5 w-3.5 text-sky-400" />
                    SQL Query Editor
                  </span>

                  {/* Preset Query Buttons */}
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => applyPresetQuery("top")}
                      className="rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-sky-300 hover:bg-slate-800 border border-slate-800 transition-all"
                    >
                      Preset: Top 5
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetQuery("latest")}
                      className="rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-sky-300 hover:bg-slate-800 border border-slate-800 transition-all"
                    >
                      Preset: Latest 5
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPresetQuery("where")}
                      className="rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-sky-300 hover:bg-slate-800 border border-slate-800 transition-all"
                    >
                      Preset: Where Clause
                    </button>
                  </div>
                </div>

                <SqlEditor
                  value={sqlQuery}
                  onChange={setSqlQuery}
                  height="110px"
                  placeholder="SELECT * FROM table_name LIMIT 5;"
                />
                <p className="text-[11px] text-slate-500">
                  Write any read-only SELECT query. Results are safely capped at 5 records max.
                </p>
              </div>

              {queryError && <ErrorBox message={queryError} />}

              {/* Columns Schema Table */}
              <div className="space-y-2 flex-1 min-h-[200px]">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                    <Columns className="h-3.5 w-3.5 text-sky-400" />
                    Column Definitions ({selectedTable.columns.length})
                  </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                  <table className="min-w-full text-left text-xs">
                    <thead className="border-b border-slate-800 text-slate-400 bg-slate-900/80">
                      <tr>
                        <th className="py-2.5 px-3.5 font-medium">Column Name</th>
                        <th className="py-2.5 px-3.5 font-medium">Data Type</th>
                        <th className="py-2.5 px-3.5 font-medium text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/80">
                      {selectedTable.columns.map((c) => {
                        const copyKey = `col:${c.column_name}`;
                        const tone = dataTypeTone(c.data_type);

                        return (
                          <tr key={c.column_name} className="hover:bg-slate-900/50 transition-colors">
                            <td className="py-2.5 px-3.5 font-mono text-slate-200 font-medium">
                              {c.column_name}
                            </td>
                            <td className="py-2.5 px-3.5">
                              <Badge tone={tone}>{c.data_type}</Badge>
                            </td>
                            <td className="py-2.5 px-3.5 text-right">
                              <button
                                onClick={() => handleCopy(c.column_name, copyKey)}
                                className="text-slate-500 hover:text-slate-200 transition-colors p-1"
                                title="Copy column name"
                              >
                                {copiedText === copyKey ? (
                                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5" />
                                )}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* FULL-SCREEN WIDE DATA TABLE MODAL (Table Format Only for 40+ Columns & JSONB Cells) */}
      {isTableModalOpen && sampleRows && selectedTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4 sm:p-6 animate-fade-in overflow-y-auto">
          <div className="w-full max-w-[96vw] rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30">
                  <Table className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-mono text-base font-bold text-slate-100">{selectedTable.name}</h3>
                    <Badge tone="blue">{sampleRows.length} Rows Executed</Badge>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Table Data Grid • Click any <code className="text-rose-300 font-mono">{"{}"} JSONB</code> cell to inspect nested JSON
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsTableModalOpen(false)}
                className="rounded-xl p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Scrollable Table Container for 40+ Columns */}
            <div className="flex-1 overflow-auto rounded-2xl border border-slate-800 bg-slate-950 font-mono text-xs custom-scrollbar">
              {sampleRows.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-500">No records returned for this query.</div>
              ) : (
                <table className="min-w-full text-left border-collapse">
                  <thead className="border-b border-slate-800 bg-slate-900 text-slate-300 sticky top-0 z-10">
                    <tr>
                      <th className="py-3 px-4 font-bold border-r border-slate-800 bg-slate-900 sticky left-0 z-20 text-center w-12 text-sky-400 shadow-md">
                        #
                      </th>
                      {Object.keys(sampleRows[0]).map((col) => (
                        <th key={col} className="py-3 px-4 font-semibold border-r border-slate-800/60 whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {sampleRows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                        {/* Sticky Left Column (# Index) */}
                        <td className="py-3 px-4 text-center font-bold text-sky-400 border-r border-slate-800 bg-slate-950 sticky left-0 z-10 shadow-md">
                          {idx + 1}
                        </td>

                        {/* Attribute Cells */}
                        {Object.entries(row).map(([colName, val], i) => {
                          const isJsonObject = typeof val === "object" && val !== null;

                          return (
                            <td key={i} className="py-2.5 px-4 text-slate-300 border-r border-slate-800/60 max-w-xs">
                              {isJsonObject ? (
                                <button
                                  type="button"
                                  onClick={() => setActiveJsonCell({ colName, val })}
                                  className="group flex items-center gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-1 text-left text-xs font-mono text-rose-300 hover:bg-rose-500/20 border border-rose-500/30 transition-all w-full truncate"
                                  title="Click to view full JSONB payload"
                                >
                                  <FileCode className="h-3.5 w-3.5 shrink-0 text-rose-400" />
                                  <span className="truncate">
                                    {JSON.stringify(val)}
                                  </span>
                                  <Eye className="h-3 w-3 shrink-0 ml-auto opacity-0 group-hover:opacity-100 text-rose-400" />
                                </button>
                              ) : (
                                <span className="break-all whitespace-nowrap block truncate">
                                  {val === null || val === undefined ? (
                                    <span className="italic text-slate-600 font-sans">NULL</span>
                                  ) : (
                                    String(val)
                                  )}
                                </span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* DEDICATED JSONB CELL INSPECTOR MODAL */}
      {activeJsonCell && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-2xl rounded-2xl border border-rose-900/60 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-500/15 text-rose-400">
                  <FileCode className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">{CONSTANTS.LABELS.JSON_INSPECTOR_TITLE}</h3>
                  <p className="text-xs font-mono text-rose-300">Column: {activeJsonCell.colName}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveJsonCell(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>JSONB Payload Breakdown</span>
                <button
                  onClick={() => handleCopy(JSON.stringify(activeJsonCell.val, null, 2), "jsonCellVal")}
                  className="flex items-center gap-1 text-[11px] text-rose-300 hover:text-rose-200"
                >
                  {copiedText === "jsonCellVal" ? (
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                  {copiedText === "jsonCellVal" ? "Copied JSON" : "Copy JSON"}
                </button>
              </div>

              <div className="max-h-96 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-4">
                <JsonBlock value={activeJsonCell.val} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
