import {
  AlertTriangle,
  ChevronDown,
  Download,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { EvidenceLocatorBadge } from "../components/copilot/EvidenceLocatorBadge";
import { bertApi } from "../lib/api";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../lib/evidenceLocators";
import { useBertStore } from "../store/useBertStore";

const CATEGORY_COLORS: Record<string, { fill: string; text: string }> = {
  "Access Control": { fill: "#38BDF8", text: "#0369A1" },
  "Liability & Indemnification": { fill: "#F87171", text: "#B91C1C" },
  "Cryptography & Keys": { fill: "#A78BFA", text: "#6D28D9" },
  "Data Retention": { fill: "#FBBF24", text: "#B45309" },
  "Temporal Conflicts": { fill: "#FB923C", text: "#C2410C" },
  "Cloud Infrastructure": { fill: "#818CF8", text: "#4338CA" },
  "Vendor Risk Assessment": { fill: "#34D399", text: "#047857" },
  "Disaster Recovery": { fill: "#60A5FA", text: "#1D4ED8" },
  "General Governance": { fill: "#94A3B8", text: "#334155" },
};

export function ResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    executiveSummary,
    summaryStatus,
    summaryError,
    auditLogs,
    undoToast,
    dismissUndoToast,
    loadSummary,
    generateSummary,
    loadAuditLogs,
    resolveWorkItem,
    undoWorkItem,
    inspectCitation,
  } = useBertStore();

  const isAuditTab = searchParams.get("tab") === "audit";
  const initialEscalationsFilter = searchParams.get("filter") === "escalations";

  const [selectedDocFilter, setSelectedDocFilter] = useState<string>("ALL");
  const [metricType, setMetricType] = useState<"count" | "confidence">("count");
  const [groupedBy, setGroupedBy] = useState<"documents" | "categories">("documents");
  const [segmentedBy, setSegmentedBy] = useState<"caution" | "category">("category");
  const [onlyCritical, setOnlyCritical] = useState(initialEscalationsFilter);
  const [showExactQuotes, setShowExactQuotes] = useState(true);
  const [enforceLatestVersion, setEnforceLatestVersion] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState("");
  const [legalActionId, setLegalActionId] = useState<string | null>(null);
  const [legalReason, setLegalReason] = useState("Escalated to counsel from Results Report");
  const [legalAssignee, setLegalAssignee] = useState("Legal Counsel");
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  useEffect(() => {
    if (searchParams.get("filter") === "escalations") {
      setOnlyCritical(true);
    }
  }, [searchParams]);

  // Fetch / compute dynamic Envoy Executive Summary whenever filters change
  useEffect(() => {
    void loadSummary({
      document_id: selectedDocFilter === "ALL" ? null : selectedDocFilter,
      only_critical: onlyCritical,
      latest_only: enforceLatestVersion,
    });
  }, [selectedDocFilter, onlyCritical, enforceLatestVersion, loadSummary]);

  // Fetch audit ledger entries on audit view or page load
  useEffect(() => {
    void loadAuditLogs();
  }, [isAuditTab, loadAuditLogs]);

  // Filtered dataset
  const filteredItems = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedDocFilter !== "ALL" && item.document_id !== selectedDocFilter) {
        return false;
      }
      if (
        onlyCritical &&
        item.priority_tier !== "P0_CRITICAL" &&
        item.verification_status === "VERIFIED"
      ) {
        return false;
      }
      if (searchFilter.trim()) {
        const q = searchFilter.toLowerCase();
        const text =
          `${item.prompt_or_question} ${item.fluent_output} ${item.category} ${item.verification_status} ${item.escalation_reason ?? ""} ${item.escalation_assignee ?? ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [workItems, selectedDocFilter, onlyCritical, searchFilter]);

  // Chart data aggregation with mutually exclusive caution buckets & count/confidence metric
  const chartData = useMemo(() => {
    const buildCautionSegments = (items: typeof filteredItems) => {
      const counts = {
        "Verified Safe": 0,
        "P1 High Review": 0,
        "P0 Critical": 0,
        "Human Verification Needed": 0,
        "Legal Escalation": 0,
      };
      for (const item of items) {
        if (item.verification_status === "ESCALATED_LEGAL") {
          counts["Legal Escalation"] += 1;
        } else if (
          item.verification_status === "NEEDS_HUMAN_VERIFICATION" ||
          item.verification_status === "INSUFFICIENT_EVIDENCE"
        ) {
          counts["Human Verification Needed"] += 1;
        } else if (item.priority_tier === "P0_CRITICAL") {
          counts["P0 Critical"] += 1;
        } else if (item.priority_tier === "P1_HIGH") {
          counts["P1 High Review"] += 1;
        } else {
          counts["Verified Safe"] += 1;
        }
      }
      const colors: Record<string, string> = {
        "Verified Safe": "#10B981",
        "P1 High Review": "#F59E0B",
        "P0 Critical": "#EF4444",
        "Human Verification Needed": "#EA580C",
        "Legal Escalation": "#D97706",
      };
      return Object.entries(counts)
        .filter(([, count]) => count > 0)
        .map(([key, count]) => ({ key, color: colors[key], count }));
    };

    const avgConf = (items: typeof filteredItems) => {
      if (items.length === 0) return 0;
      const sum = items.reduce((acc, i) => acc + (i.gate_telemetry?.citation_match ?? 0), 0);
      return Math.round((sum / items.length) * 10) / 10;
    };

    if (groupedBy === "documents") {
      const docList =
        selectedDocFilter === "ALL" ? documents : documents.filter((d) => d.id === selectedDocFilter);
      return docList.map((doc) => {
        const docItems = filteredItems.filter((item) => item.document_id === doc.id);
        let segments: { key: string; color: string; count: number }[] = [];

        if (segmentedBy === "category") {
          const catMap: Record<string, number> = {};
          for (const item of docItems) {
            catMap[item.category] = (catMap[item.category] || 0) + 1;
          }
          segments = Object.entries(catMap).map(([cat, cnt]) => ({
            key: cat,
            color: CATEGORY_COLORS[cat]?.fill || "#94A3B8",
            count: cnt,
          }));
        } else {
          segments = buildCautionSegments(docItems);
        }

        const total =
          metricType === "confidence"
            ? avgConf(docItems)
            : segments.reduce((sum, s) => sum + s.count, 0);

        return {
          label: doc.filename.length > 20 ? `${doc.filename.slice(0, 18)}…` : doc.filename,
          fullLabel: doc.filename,
          total,
          rawCount: docItems.length,
          segments,
        };
      });
    }

    const categories = Array.from(new Set(filteredItems.map((i) => i.category)));
    return categories.map((cat) => {
      const catItems = filteredItems.filter((item) => item.category === cat);
      const segments = buildCautionSegments(catItems);
      const total =
        metricType === "confidence"
          ? avgConf(catItems)
          : segments.reduce((sum, s) => sum + s.count, 0);

      return {
        label: cat.length > 16 ? `${cat.slice(0, 14)}…` : cat,
        fullLabel: cat,
        total,
        rawCount: catItems.length,
        segments,
      };
    });
  }, [groupedBy, segmentedBy, metricType, filteredItems, documents, selectedDocFilter]);

  const maxChartValue =
    metricType === "confidence" ? 100 : Math.max(...chartData.map((d) => d.total), 4);

  // Metrics: ESCALATED_LEGAL excluded from verified numerator while remaining in denominator
  const totalFindings = filteredItems.length;
  const verifiedCount = filteredItems.filter((i) => i.verification_status === "VERIFIED").length;
  const escalatedLegalCount = filteredItems.filter(
    (i) => i.verification_status === "ESCALATED_LEGAL"
  ).length;
  const criticalCount = filteredItems.filter(
    (i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED"
  ).length;
  const complianceRate = totalFindings > 0 ? Math.round((verifiedCount / totalFindings) * 100) : 0;

  // Export functions
  const handleExportXlsx = () => {
    const dataToExport = filteredItems.map((item) => ({
      "Priority Tier": item.original_priority_tier || item.priority_tier,
      Category: item.category,
      "Question or Clause": item.prompt_or_question,
      "AI Response": item.fluent_output,
      "AI Status": item.verification_status,
      "Escalation Assignee": item.escalation_assignee ?? "",
      "Escalation Reason": item.escalation_reason ?? "",
      "Verbatim Quote (Ranger)":
        item.verified_citations[0]?.quote || "No direct quote (flagged for review)",
      "Match Score %": item.gate_telemetry.citation_match,
      "Source Document": item.verified_citations[0]?.document_filename || "Corpus",
      "Page / Row": item.verified_citations[0]?.page_number ?? "N/A",
    }));

    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BERT_Verified_Findings");
    XLSX.writeFile(
      workbook,
      `BERT_Compliance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
    );

    setCopiedNotification("Exported verified answers & legal columns as .XLSX");
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  const handleDownloadSummary = async () => {
    const queryParams = {
      document_id: selectedDocFilter === "ALL" ? null : selectedDocFilter,
      only_critical: onlyCritical,
      latest_only: enforceLatestVersion,
    };

    let activeSummary = executiveSummary;
    if (!activeSummary) {
      activeSummary = await generateSummary(queryParams);
    }

    let markdownContent = activeSummary?.markdown || activeSummary?.summary_text || "";
    try {
      const res = await fetch(bertApi.exportSummaryMdUrl(queryParams));
      if (res.ok) {
        const remoteMd = await res.text();
        if (remoteMd.trim()) {
          markdownContent = remoteMd;
        }
      }
    } catch {
      /* backend offline: use exact locally generated markdown */
    }

    const blob = new Blob([markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `BERT_Executive_Summary_${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);

    setCopiedNotification("Downloaded Envoy Summary Report (.md)");
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  const handleInlineResolve = async (id: string) => {
    if (!inlineEditText.trim()) return;
    await resolveWorkItem(id, {
      action: "manual_correction",
      correction: inlineEditText.trim(),
    });
    setInlineEditId(null);
    setInlineEditText("");
  };

  const handleConfirmLegalFlag = async (id: string) => {
    await resolveWorkItem(id, {
      action: "counsel",
      note: legalReason.trim() || "Flagged for Legal Review",
      assignee: legalAssignee.trim() || "Legal Counsel",
    });
    setLegalActionId(null);
  };

  const toggleTab = (tab: "overview" | "audit") => {
    const next = new URLSearchParams(searchParams);
    if (tab === "audit") {
      next.set("tab", "audit");
    } else {
      next.delete("tab");
    }
    setSearchParams(next);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-white text-zinc-900">
      {/* 1. Top Report Header Bar */}
      <header className="min-h-14 border-b border-zinc-200/90 bg-white px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-base font-bold text-zinc-950 font-ui tracking-tight">
            Executive Compliance & Risk Report
          </h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-xs font-mono">
            <ShieldCheck size={14} className="text-emerald-700" />
            <span>SHA-256 Zero-Data-Loss Verified</span>
          </div>

          <div className="flex p-0.5 rounded-lg bg-zinc-100 border border-zinc-200 text-xs">
            <button
              type="button"
              onClick={() => toggleTab("overview")}
              className={`px-2.5 py-1 rounded-md font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                !isAuditTab ? "bg-white text-zinc-950 shadow-2xs font-semibold" : "text-zinc-700"
              }`}
            >
              Findings & Summary
            </button>
            <button
              type="button"
              onClick={() => toggleTab("audit")}
              className={`px-2.5 py-1 rounded-md font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isAuditTab ? "bg-white text-zinc-950 shadow-2xs font-semibold" : "text-zinc-700"
              }`}
            >
              Audit Ledger ({auditLogs.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {copiedNotification && (
            <span role="status" aria-live="polite" className="text-xs font-medium text-emerald-800">
              {copiedNotification}
            </span>
          )}

          <button
            type="button"
            onClick={() => {
              setSelectedDocFilter("ALL");
              setOnlyCritical(false);
              setSearchFilter("");
              const next = new URLSearchParams(searchParams);
              next.delete("filter");
              setSearchParams(next);
            }}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Reset Filters
          </button>

          <button
            type="button"
            onClick={handleExportXlsx}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 hover:bg-zinc-50 text-xs font-medium text-zinc-800 shadow-2xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <FileSpreadsheet size={14} className="text-emerald-700" />
            <span>Export Answered .XLSX</span>
          </button>

          <button
            type="button"
            onClick={() => void handleDownloadSummary()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            <Download size={14} />
            <span>Download Summary Report</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* 2. Center Analytics & Findings Stage */}
        <div className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto bg-white space-y-6">
          {/* Undo Toast */}
          {undoToast && (
            <div
              role="status"
              aria-live="polite"
              data-testid="results-undo-toast"
              className="p-3 rounded-xl bg-[#18181B] text-white text-xs flex items-center justify-between gap-3 shadow-md"
            >
              <span className="flex items-center gap-2 min-w-0 truncate">
                <Scale size={14} className="text-amber-400 shrink-0" />
                <span className="truncate">
                  {undoToast.action}: {undoToast.label}
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void undoWorkItem(undoToast.workItemId)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <RotateCcw size={12} />
                  <span>Undo</span>
                </button>
                <button
                  type="button"
                  aria-label="Dismiss toast"
                  onClick={dismissUndoToast}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}

          {isAuditTab ? (
            /* Cryptographic Audit Ledger View (?tab=audit) */
            <div className="space-y-6" data-testid="audit-ledger-panel">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-sm text-emerald-950">
                    <ShieldCheck size={17} className="text-emerald-700" />
                    <span>SHA-256 Chain of Custody & Escalation Audit Ledger</span>
                  </div>
                  <p className="text-xs text-emerald-900">
                    Every document AST node tree, verification gate decision, legal flag, and undo operation is cryptographically hashed.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-white border border-emerald-200 text-emerald-900 shrink-0">
                  {auditLogs.length} Audit Events
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 font-semibold text-xs text-zinc-900">
                  Document Checksums ({documents.length})
                </div>
                <div className="divide-y divide-zinc-200">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <div className="font-semibold text-zinc-900">{doc.filename}</div>
                        <div className="font-mono text-[11px] text-zinc-600">{doc.ast_checksum}</div>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-800">
                        {doc.total_ast_nodes} AST nodes · {doc.processing_status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 font-semibold text-xs text-zinc-900">
                  Escalation & Review Audit Trail
                </div>
                {auditLogs.length === 0 ? (
                  <div className="p-8 text-center text-xs text-zinc-600">
                    No escalation or verification audit events recorded yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 font-semibold uppercase text-[10px]">
                          <th className="py-2.5 px-3">Action</th>
                          <th className="py-2.5 px-3">Work Item / Agent</th>
                          <th className="py-2.5 px-3">Reason / Note</th>
                          <th className="py-2.5 px-3">Assignee</th>
                          <th className="py-2.5 px-3">SHA-256 Output Hash</th>
                          <th className="py-2.5 px-3">Time</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200">
                        {auditLogs.map((entry) => (
                          <tr key={entry.id} className="hover:bg-zinc-50">
                            <td className="py-2.5 px-3 font-mono font-semibold text-zinc-900">
                              {entry.action}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-700 font-mono text-[11px]">
                              {entry.work_item_id ? `${entry.work_item_id.slice(0, 8)}…` : "Corpus"} · {entry.agent_name}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-800">
                              {String(
                                entry.metadata_json?.reason ??
                                  entry.metadata_json?.note ??
                                  entry.metadata_json?.reason_code ??
                                  "—"
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-zinc-700">
                              {String(entry.metadata_json?.assignee ?? entry.metadata_json?.actor ?? "Reviewer")}
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-zinc-600">
                              {entry.output_hash.slice(0, 16)}…
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-zinc-600">
                              {new Date(entry.created_at).toLocaleTimeString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Category Legend Bar */}
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-zinc-700 pb-2 border-b border-zinc-100">
                {Object.entries(CATEGORY_COLORS)
                  .slice(0, 6)
                  .map(([cat, color]) => (
                    <div key={cat} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: color.fill }}
                      />
                      <span className="text-zinc-800">{cat}</span>
                    </div>
                  ))}
              </div>

              {/* Envoy Executive Synthesis Callout Card (Live Backend / Dynamic Synthesis) */}
              <div
                data-testid="envoy-summary-card"
                className="p-6 rounded-2xl bg-zinc-50 border border-zinc-200/90 shadow-2xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-serif font-bold text-xs">
                      E
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 font-mono">
                      Envoy Executive Synthesis
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    {escalatedLegalCount > 0 && (
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-950">
                        {escalatedLegalCount} Escalated Legal
                      </span>
                    )}
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white border border-zinc-200 text-zinc-800">
                      {(executiveSummary?.defensibility_score ?? complianceRate)}% Defensibility Score
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void generateSummary({
                          document_id: selectedDocFilter === "ALL" ? null : selectedDocFilter,
                          only_critical: onlyCritical,
                          latest_only: enforceLatestVersion,
                        })
                      }
                      aria-label="Regenerate executive summary"
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 text-[11px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <RefreshCw size={11} className={summaryStatus === "loading" ? "spin" : ""} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                {summaryStatus === "loading" && !executiveSummary ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-zinc-700">
                    <RefreshCw size={14} className="spin text-blue-700" />
                    <span>Generating real-time Envoy synthesis for active filter…</span>
                  </div>
                ) : summaryStatus === "error" && !executiveSummary ? (
                  <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5">
                      <AlertTriangle size={14} />
                      <span>{summaryError || "Failed to load executive summary."}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        void loadSummary({
                          document_id: selectedDocFilter === "ALL" ? null : selectedDocFilter,
                          only_critical: onlyCritical,
                          latest_only: enforceLatestVersion,
                        })
                      }
                      className="px-2.5 py-1 rounded bg-white border border-rose-300 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Retry
                    </button>
                  </div>
                ) : totalFindings === 0 || (executiveSummary && executiveSummary.total_work_items === 0) ? (
                  <p
                    data-testid="summary-empty-state"
                    className="text-zinc-800 text-sm leading-relaxed font-serif"
                  >
                    0 findings for this document/filter. Adjust the Data Source or Verification Filters on the right to inspect other records.
                  </p>
                ) : (
                  <>
                    <p className="text-zinc-900 text-sm leading-relaxed font-serif whitespace-pre-wrap">
                      {executiveSummary?.summary_text}
                    </p>
                    {enforceLatestVersion &&
                      executiveSummary?.arbiter_resolutions &&
                      executiveSummary.arbiter_resolutions.superseded_documents.length > 0 && (
                        <div className="text-[11px] font-mono text-zinc-700 pt-1 border-t border-zinc-200/70">
                          Chronos Arbiter: {executiveSummary.arbiter_resolutions.superseded_documents.length} superseded document(s) filtered across {executiveSummary.arbiter_resolutions.latest_documents.length} latest document(s).
                        </div>
                      )}
                  </>
                )}
              </div>

              {/* Stacked Visual Breakdown Chart */}
              <div className="p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950 font-ui">
                      {metricType === "confidence" ? "Average Match Confidence" : "Findings Distribution"} by{" "}
                      {groupedBy === "documents" ? "Document" : "Category"}
                    </h3>
                    <span className="text-[11px] text-zinc-600 font-mono">
                      Segmented by {segmentedBy === "category" ? "Quartermaster Category" : "Caution Tier"}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-700 font-medium">
                    Total: {totalFindings} findings
                  </span>
                </div>

                {/* Accessible textual table alternative for WCAG 2.1 AA */}
                <table className="sr-only" aria-label="Chart data breakdown">
                  <thead>
                    <tr>
                      <th>Group</th>
                      <th>Count</th>
                      <th>Metric Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map((col) => (
                      <tr key={`sr-${col.fullLabel}`}>
                        <td>{col.fullLabel}</td>
                        <td>{col.rawCount}</td>
                        <td>{metricType === "confidence" ? `${col.total}%` : col.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="h-64 flex items-end gap-6 pt-6 pb-2 px-4 border-b border-zinc-200/80">
                  {chartData.map((col) => {
                    const colHeightPercent =
                      col.total > 0 ? Math.max(10, Math.round((col.total / maxChartValue) * 100)) : 4;
                    const segmentDenom = col.segments.reduce((sum, s) => sum + s.count, 0) || 1;

                    return (
                      <div
                        key={col.fullLabel}
                        className="flex-1 flex flex-col items-center h-full justify-end group relative"
                      >
                        <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-mono py-1 px-2 rounded pointer-events-none z-30 whitespace-nowrap shadow-md">
                          {col.fullLabel}:{" "}
                          {metricType === "confidence" ? `${col.total}% avg match` : `${col.total} findings`}
                        </div>

                        <div
                          className="w-full max-w-16 rounded-t-lg overflow-hidden flex flex-col-reverse transition-all duration-500 shadow-2xs group-hover:scale-[1.02] bg-zinc-100"
                          style={{ height: `${colHeightPercent}%` }}
                        >
                          {col.segments.map((seg, sIdx) => {
                            const segHeight = Math.max(8, Math.round((seg.count / segmentDenom) * 100));
                            return (
                              <div
                                key={`${seg.key}-${sIdx}`}
                                className="w-full transition-all relative border-t border-white/20 first:border-0"
                                style={{
                                  height: `${segHeight}%`,
                                  backgroundColor: seg.color,
                                }}
                                title={`${seg.key}: ${seg.count}`}
                              />
                            );
                          })}
                        </div>

                        <span
                          className="mt-3 text-[11px] font-medium text-zinc-700 truncate max-w-20 text-center"
                          title={col.fullLabel}
                        >
                          {col.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Contributing Findings & Answers Table */}
              <div className="p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950 font-ui">
                      Contributing Findings & Verbatim Evidence Table
                    </h3>
                    <span className="text-[11px] text-zinc-600 font-mono">
                      {filteredItems.length} records active in this view ({verifiedCount} verified, {criticalCount} attention, {escalatedLegalCount} legal)
                    </span>
                  </div>

                  <div className="relative">
                    <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-600" />
                    <input
                      type="text"
                      aria-label="Filter findings table"
                      placeholder="Filter findings..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-900 placeholder:text-zinc-600 focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-all w-56"
                    />
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="p-8 text-center rounded-xl border border-dashed border-zinc-300 text-xs text-zinc-700">
                    0 findings for this document/filter.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-zinc-200/80 rounded-xl">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 font-semibold uppercase text-[10px] tracking-wider">
                          <th className="py-3 px-3">Priority & Status</th>
                          <th className="py-3 px-3">Category</th>
                          <th className="py-3 px-3">Question / Clause</th>
                          <th className="py-3 px-3">Fluent Answer (Envoy)</th>
                          {showExactQuotes && <th className="py-3 px-3">Exact Verbatim Quote</th>}
                          <th className="py-3 px-3">Match %</th>
                          <th className="py-3 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200/70">
                        {filteredItems.map((item) => {
                          const displayPriority = item.original_priority_tier || item.priority_tier;
                          const isCritical = displayPriority === "P0_CRITICAL";
                          const isHigh = displayPriority === "P1_HIGH";
                          const isLegal = item.verification_status === "ESCALATED_LEGAL";
                          const citation = item.verified_citations[0];
                          const citDoc = resolveCitationDocument(documents, {
                            locator: citation?.locator,
                            documentFilename: citation?.document_filename,
                            fallbackDocumentId: item.document_id,
                          });
                          const matchedNode = citDoc
                            ? nodesByDocument[citDoc.id]?.find((n) => n.id === citation?.ast_node_id)
                            : undefined;
                          const resolvedLocator =
                            citation?.locator ?? deriveNodeLocator(matchedNode, citDoc);
                          const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);

                          return (
                            <tr
                              key={item.id}
                              className={`hover:bg-zinc-50/70 transition-colors ${
                                isLegal
                                  ? "bg-amber-50/50"
                                  : isCritical
                                    ? "bg-rose-50/35"
                                    : isHigh
                                      ? "bg-amber-50/20"
                                      : ""
                              }`}
                            >
                              {/* Priority & Verification Status */}
                              <td className="py-3 px-3 whitespace-nowrap space-y-1">
                                <span
                                  className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded block w-fit ${
                                    isCritical
                                      ? "bg-rose-100 text-rose-900 border border-rose-200"
                                      : isHigh
                                        ? "bg-amber-100 text-amber-900 border border-amber-200"
                                        : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                  }`}
                                >
                                  {displayPriority}
                                </span>
                                <span
                                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded block w-fit font-semibold ${
                                    isLegal
                                      ? "bg-amber-200/80 text-amber-950 border border-amber-300"
                                      : item.verification_status === "VERIFIED"
                                        ? "text-emerald-800"
                                        : "text-rose-800"
                                  }`}
                                >
                                  {item.verification_status}
                                </span>
                              </td>

                              {/* Category */}
                              <td className="py-3 px-3 whitespace-nowrap font-medium text-zinc-800">
                                {item.category}
                              </td>

                              {/* Question / Clause */}
                              <td className="py-3 px-3 font-semibold text-zinc-900 max-w-44">
                                <div className="truncate" title={item.prompt_or_question}>
                                  {item.prompt_or_question}
                                </div>
                              </td>

                              {/* Fluent Answer + Legal Reason */}
                              <td className="py-3 px-3 text-zinc-800 max-w-64 space-y-1">
                                {inlineEditId === item.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="text"
                                      aria-label={`Edit answer for ${item.prompt_or_question}`}
                                      value={inlineEditText}
                                      onChange={(e) => setInlineEditText(e.target.value)}
                                      className="px-2 py-1 rounded border border-blue-500 bg-white text-xs w-full text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => void handleInlineResolve(item.id)}
                                      className="px-2 py-1 bg-[#1D4ED8] text-white rounded text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    >
                                      Save
                                    </button>
                                  </div>
                                ) : legalActionId === item.id ? (
                                  <div className="space-y-1.5 p-2 rounded-lg bg-amber-50 border border-amber-200">
                                    <input
                                      type="text"
                                      aria-label="Legal assignee"
                                      value={legalAssignee}
                                      onChange={(e) => setLegalAssignee(e.target.value)}
                                      placeholder="Assignee"
                                      className="w-full px-2 py-1 rounded border border-amber-300 bg-white text-[11px] text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    />
                                    <input
                                      type="text"
                                      aria-label="Legal escalation reason"
                                      value={legalReason}
                                      onChange={(e) => setLegalReason(e.target.value)}
                                      placeholder="Reason note"
                                      className="w-full px-2 py-1 rounded border border-amber-300 bg-white text-[11px] text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    />
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => void handleConfirmLegalFlag(item.id)}
                                        className="px-2 py-1 bg-[#18181B] text-white rounded text-[10px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                      >
                                        Confirm Legal
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setLegalActionId(null)}
                                        className="px-2 py-1 bg-zinc-200 text-zinc-800 rounded text-[10px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="truncate font-serif italic" title={item.fluent_output}>
                                      {item.fluent_output}
                                    </div>
                                    {isLegal && (
                                      <div className="text-[10px] font-mono text-amber-950">
                                        {item.escalation_assignee || "Legal Counsel"}
                                        {item.escalation_reason ? `: ${item.escalation_reason}` : ""}
                                      </div>
                                    )}
                                  </>
                                )}
                              </td>

                              {/* Exact Verbatim Quote + EvidenceLocatorBadge */}
                              {showExactQuotes && (
                                <td className="py-3 px-3 text-zinc-700 max-w-56 space-y-1">
                                  {citation?.quote ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          inspectCitation({
                                            ...citation,
                                            locator: resolvedLocator,
                                            bounding_box:
                                              citation.bounding_box ?? matchedNode?.bounding_box ?? null,
                                            confidence_score: item.gate_telemetry.citation_match,
                                            document_filename:
                                              citation.document_filename || citDoc?.filename || "",
                                          });
                                        }}
                                        className="block max-w-full truncate font-mono text-[11px] text-blue-700 cursor-pointer hover:underline text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                                        title={citation.quote}
                                      >
                                        “{citation.quote}”
                                      </button>
                                      <EvidenceLocatorBadge
                                        locator={resolvedLocator}
                                        document={citDoc}
                                        fallbackPage={citation.page_number}
                                        fallbackBbox={citation.bounding_box ?? matchedNode?.bounding_box}
                                        regionMatchScore={citation.region_match_score}
                                        context={`results-row:${item.id}`}
                                      />
                                    </>
                                  ) : (
                                    <span className="font-mono text-[10px] text-rose-800 font-semibold">
                                      Missing Proof
                                    </span>
                                  )}
                                </td>
                              )}

                              {/* Match % */}
                              <td className="py-3 px-3 whitespace-nowrap font-mono font-bold">
                                {item.gate_telemetry.citation_match > 0 ? (
                                  <span className="text-emerald-800">
                                    {item.gate_telemetry.citation_match}%
                                  </span>
                                ) : (
                                  <span className="text-rose-800">0%</span>
                                )}
                              </td>

                              {/* Resolution Actions */}
                              <td className="py-3 px-3 whitespace-nowrap text-right">
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setInlineEditId(item.id);
                                      setInlineEditText(item.fluent_output);
                                    }}
                                    className="px-2 py-1 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                  >
                                    Edit
                                  </button>

                                  {!isLegal && (
                                    <button
                                      type="button"
                                      onClick={() => setLegalActionId(item.id)}
                                      className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    >
                                      Legal
                                    </button>
                                  )}

                                  {canUndo && (
                                    <button
                                      type="button"
                                      onClick={() => void undoWorkItem(item.id)}
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#18181B] hover:bg-[#27272A] text-white text-[11px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                    >
                                      <RotateCcw size={10} />
                                      <span>Undo</span>
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* 3. Right Configuration & Insight Sidebar */}
        <aside className="hidden lg:block w-80 h-full bg-[#F9FAFB] border-l border-zinc-200/80 p-5 overflow-y-auto space-y-6 text-xs text-zinc-900 shrink-0">
          <div className="flex items-center justify-between pb-3 border-b border-zinc-200">
            <div className="flex items-center gap-1.5 font-semibold text-sm text-zinc-950">
              <SlidersHorizontal size={15} className="text-zinc-600" />
              <span>Insight Configuration</span>
            </div>
            <ChevronDown size={14} className="text-zinc-600" />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="results-data-source"
              className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider block"
            >
              Data Source
            </label>
            <select
              id="results-data-source"
              value={selectedDocFilter}
              onChange={(e) => setSelectedDocFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-300 text-xs font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
            >
              <option value="ALL">All Uploaded Documents ({documents.length})</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="results-metric-select"
              className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider block"
            >
              Metric
            </label>
            <select
              id="results-metric-select"
              value={metricType}
              onChange={(e) => setMetricType(e.target.value as "count" | "confidence")}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-300 text-xs font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
            >
              <option value="count">Count Clauses & Questions</option>
              <option value="confidence">Average Confidence Score</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="results-grouped-by"
              className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider block"
            >
              Grouped By
            </label>
            <select
              id="results-grouped-by"
              value={groupedBy}
              onChange={(e) => setGroupedBy(e.target.value as "documents" | "categories")}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-300 text-xs font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
            >
              <option value="documents">Documents</option>
              <option value="categories">Categories (Quartermaster)</option>
            </select>
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="results-segmented-by"
              className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider block"
            >
              Segmented By
            </label>
            <select
              id="results-segmented-by"
              value={segmentedBy}
              onChange={(e) => setSegmentedBy(e.target.value as "caution" | "category")}
              className="w-full px-3 py-2 rounded-lg bg-white border border-zinc-300 text-xs font-medium text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 cursor-pointer"
            >
              <option value="category">Categories</option>
              <option value="caution">Caution Level (P0–P3)</option>
            </select>
          </div>

          {/* Interactive Toggle Switches (Accessible role="switch") */}
          <div className="space-y-3 pt-3 border-t border-zinc-200">
            <span className="text-[11px] font-semibold text-zinc-700 uppercase tracking-wider block">
              Verification Filters
            </span>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-800">
                Show only Critical / Action items
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={onlyCritical}
                aria-label="Show only Critical or Action items"
                onClick={() => setOnlyCritical(!onlyCritical)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
                  onlyCritical ? "bg-blue-600" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    onlyCritical ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-800">
                Show exact verbatim source quotes
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={showExactQuotes}
                aria-label="Show exact verbatim source quotes"
                onClick={() => setShowExactQuotes(!showExactQuotes)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
                  showExactQuotes ? "bg-blue-600" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    showExactQuotes ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-zinc-800">
                Enforce latest version (Chronos)
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={enforceLatestVersion}
                aria-label="Enforce latest document version via Chronos"
                onClick={() => setEnforceLatestVersion(!enforceLatestVersion)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${
                  enforceLatestVersion ? "bg-blue-600" : "bg-zinc-300"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    enforceLatestVersion ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
