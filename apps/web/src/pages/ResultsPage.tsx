import {
  AlertTriangle,
  BarChart3,
  ChevronDown,
  Download,
  FileSearch,
  FileSpreadsheet,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { EvidenceLocatorBadge } from "../components/copilot/EvidenceLocatorBadge";
import { TriageToast } from "../components/triage/TriageToast";
import { Select, type SelectOption } from "../components/ui/Select";
import { bertApi } from "../lib/api";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../lib/evidenceLocators";
import {
  CATEGORY_COLORS,
  computeResultsChartModel,
  type ResultsGroupedBy,
  type ResultsMetricType,
  type ResultsSegmentedBy,
} from "../lib/resultsChart";
import { getAcceptActionState, sortTriageQueue } from "../lib/triageQueue";
import {
  buildXlsxExportRows,
  computeWorkItemMetrics,
  filterWorkItemsForScope,
  formatExportWarningLines,
  getMatchBadgeTone,
  MANUAL_OVERRIDE_REASON_CODES,
  NOT_APPLICABLE_REASON_CODES,
  validateManualOverrideInput,
  validateNotApplicableInput,
} from "../lib/workItemMetrics";
import { useBertStore } from "../store/useBertStore";
import type { WorkItem } from "../types/bert";

export function ResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    activeJob,
    isSimulating,
    hasCompletedRun,
    backendAvailable,
    executiveSummary,
    summaryStatus,
    summaryError,
    loadSummary,
    generateSummary,
    auditLogs,
    loadAuditLogs,
    loadDemo,
    resolveWorkItem,
    undoWorkItem,
    inspectCitation,
  } = useBertStore();

  const isAuditTab = searchParams.get("tab") === "audit";
  const initialEscalationsFilter = searchParams.get("filter") === "escalations";

  const [selectedDocFilter, setSelectedDocFilter] = useState<string>("ALL");
  const [metricType, setMetricType] = useState<ResultsMetricType>("count");
  const [groupedBy, setGroupedBy] = useState<ResultsGroupedBy>("documents");
  const [segmentedBy, setSegmentedBy] = useState<ResultsSegmentedBy>("category");
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [onlyEscalations, setOnlyEscalations] = useState(initialEscalationsFilter);
  const [showExactQuotes, setShowExactQuotes] = useState(true);
  const [enforceLatestVersion, setEnforceLatestVersion] = useState(true);
  const [configOpen, setConfigOpen] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [inlineEditId, setInlineEditId] = useState<string | null>(null);
  const [inlineEditText, setInlineEditText] = useState("");
  const [inlineReasonCode, setInlineReasonCode] = useState<string>(MANUAL_OVERRIDE_REASON_CODES[0].value);
  const [inlineCitationText, setInlineCitationText] = useState("");
  const [inlineNoEvidence, setInlineNoEvidence] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [naActionId, setNaActionId] = useState<string | null>(null);
  const [naReasonCode, setNaReasonCode] = useState<string>("");
  const [naReasonNote, setNaReasonNote] = useState("");
  const [naError, setNaError] = useState<string | null>(null);
  const [legalActionId, setLegalActionId] = useState<string | null>(null);
  const [legalReason, setLegalReason] = useState("Escalated to counsel from Results Report");
  const [legalAssignee, setLegalAssignee] = useState("Legal Counsel");
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [exportWarningOpen, setExportWarningOpen] = useState(false);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTransientToast = (message: string) => {
    setCopiedNotification(message);
    if (toastTimerRef.current !== null) {
      clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = setTimeout(() => {
      setCopiedNotification(null);
      toastTimerRef.current = null;
    }, 3000);
  };

  useEffect(() => {
    return () => {
      if (toastTimerRef.current !== null) {
        clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const isRunning =
    isSimulating || activeJob?.status === "RUNNING" || activeJob?.status === "RESUMING";
  const canExport = !isRunning && workItems.length > 0 && hasCompletedRun;
  const exportDisabledReason = isRunning
    ? "Review run in progress — export unlocks on completion"
    : workItems.length === 0
      ? "No corpus items to export"
      : !hasCompletedRun
        ? "Complete a review run before exporting"
        : "Export answered questionnaire as .XLSX";

  useEffect(() => {
    setOnlyEscalations(searchParams.get("filter") === "escalations");
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

  // Filtered dataset using single-source-of-truth scope filter
  const filteredItems = useMemo(() => {
    let scoped = filterWorkItemsForScope({
      items: workItems,
      documents,
      documentId: selectedDocFilter === "ALL" ? null : selectedDocFilter,
      onlyCritical,
      latestOnly: enforceLatestVersion,
    });
    if (onlyEscalations) {
      scoped = sortTriageQueue(scoped.filter((item) => item.verification_status !== "VERIFIED"));
    }
    if (!searchFilter.trim()) return scoped;
    const q = searchFilter.toLowerCase();
    return scoped.filter((item) => {
      const text =
        `${item.prompt_or_question} ${item.fluent_output} ${item.category} ${item.verification_status} ${item.escalation_reason ?? ""} ${item.escalation_assignee ?? ""} ${item.human_override_reason_code ?? ""}`.toLowerCase();
      return text.includes(q);
    });
  }, [workItems, documents, selectedDocFilter, onlyCritical, onlyEscalations, enforceLatestVersion, searchFilter]);

  const metrics = useMemo(() => computeWorkItemMetrics(filteredItems), [filteredItems]);
  const corpusMetrics = useMemo(() => computeWorkItemMetrics(workItems), [workItems]);
  const exportTargetMetrics = useMemo(
    () =>
      selectedDocFilter === "ALL" && !onlyCritical && !onlyEscalations && !searchFilter.trim()
        ? corpusMetrics
        : metrics,
    [selectedDocFilter, onlyCritical, onlyEscalations, searchFilter, corpusMetrics, metrics]
  );
  const exportWarningLines = useMemo(
    () => formatExportWarningLines(exportTargetMetrics),
    [exportTargetMetrics]
  );

  // Category legend counts from active filtered items (tabular-nums zero-CLS)
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of filteredItems) {
      counts[item.category] = (counts[item.category] || 0) + 1;
    }
    return counts;
  }, [filteredItems]);

  // Chart model via pure helper (zero phantom bars, bounded <=100%, metricType wired, zero P1_HIGH double counting)
  const chartModel = useMemo(
    () =>
      computeResultsChartModel({
        filteredItems,
        documents,
        selectedDocFilter,
        groupedBy,
        segmentedBy,
        metricType,
      }),
    [filteredItems, documents, selectedDocFilter, groupedBy, segmentedBy, metricType]
  );

  // Select options for custom <Select /> controls
  const dataSourceOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "ALL", label: `All Uploaded Documents (${documents.length})` },
      ...documents.map((doc) => ({
        value: doc.id,
        label: doc.filename,
      })),
    ],
    [documents]
  );

  const metricOptions = useMemo<SelectOption<ResultsMetricType>[]>(
    () => [
      { value: "count", label: "Count Clauses & Questions" },
      { value: "confidence", label: "Average Confidence Score" },
    ],
    []
  );

  const groupedByOptions = useMemo<SelectOption<ResultsGroupedBy>[]>(
    () => [
      { value: "documents", label: "Documents" },
      { value: "categories", label: "Categories (Quartermaster)" },
    ],
    []
  );

  const segmentedByOptions = useMemo<SelectOption<ResultsSegmentedBy>[]>(
    () => [
      { value: "category", label: "Categories" },
      { value: "caution", label: "Caution Level (P0–P3)" },
    ],
    []
  );

  const overrideReasonOptions = useMemo<SelectOption<string>[]>(
    () =>
      MANUAL_OVERRIDE_REASON_CODES.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    []
  );

  const naReasonOptions = useMemo<SelectOption<string>[]>(
    () => [
      { value: "", label: "Select N/A reason code…" },
      ...NOT_APPLICABLE_REASON_CODES.map((opt) => ({
        value: opt.value,
        label: opt.label,
      })),
    ],
    []
  );

  const hasActiveFilters =
    selectedDocFilter !== "ALL" ||
    onlyCritical ||
    onlyEscalations ||
    searchFilter.trim().length > 0 ||
    !enforceLatestVersion;

  const handleResetFilters = () => {
    setSelectedDocFilter("ALL");
    setOnlyCritical(false);
    setOnlyEscalations(false);
    setEnforceLatestVersion(true);
    setSearchFilter("");
    setInlineEditId(null);
    setInlineError(null);
    setNaActionId(null);
    setNaError(null);
    setLegalActionId(null);
    const next = new URLSearchParams(searchParams);
    next.delete("filter");
    setSearchParams(next);
  };

  // Export functions (gated + pre-export warning confirmation + backend XLSX integration)
  const performExportXlsx = async () => {
    setExportWarningOpen(false);
    const filename = `BERT_Compliance_Report_${new Date().toISOString().slice(0, 10)}.xlsx`;

    const useBackendDownload =
      backendAvailable &&
      selectedDocFilter === "ALL" &&
      !onlyCritical &&
      !onlyEscalations &&
      !searchFilter.trim();

    if (useBackendDownload) {
      try {
        const blob = await bertApi.downloadQuestionnaireXlsx();
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        showTransientToast("Exported audited compliance workbook (.XLSX)");
        return;
      } catch {
        // Fallback cleanly to client-side SheetJS workbook with Phase 3 audit columns
      }
    }

    const dataToExport = buildXlsxExportRows(filteredItems, documents);
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BERT_Verified_Findings");
    XLSX.writeFile(workbook, filename);

    showTransientToast("Exported audited compliance workbook (.XLSX)");
  };

  const handleRequestExportXlsx = () => {
    if (!canExport) return;
    if (exportTargetMetrics.exportWarnings.hasAnyWarning) {
      setExportWarningOpen(true);
      return;
    }
    void performExportXlsx();
  };

  useEffect(() => {
    if (searchParams.get("export") === "1" && canExport) {
      if (exportTargetMetrics.exportWarnings.hasAnyWarning) {
        setExportWarningOpen(true);
      } else {
        void performExportXlsx();
      }
      const next = new URLSearchParams(searchParams);
      next.delete("export");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canExport, searchParams]);

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

    showTransientToast("Downloaded Envoy Summary Report (.md)");
  };

  const handleInlineResolve = async (id: string) => {
    const targetItem = workItems.find((w) => w.id === id);
    const hasExistingLocator = Boolean(
      targetItem?.verified_citations?.some((c) => Boolean(c.locator || c.bounding_box || c.quote))
    );
    const check = validateManualOverrideInput({
      correction: inlineEditText,
      reasonCode: inlineReasonCode,
      overrideCitationText: inlineCitationText,
      noEvidenceAttestation: inlineNoEvidence,
      hasExistingLocator,
    });
    if (!check.valid) {
      setInlineError(check.message || "Invalid override submission.");
      return;
    }
    setInlineError(null);
    try {
      await resolveWorkItem(id, {
        action: "manual_correction",
        correction: inlineEditText.trim(),
        reason_code: inlineReasonCode,
        override_citation_text: inlineCitationText.trim() || null,
        no_evidence_attestation: inlineNoEvidence,
      });
      setInlineEditId(null);
      setInlineEditText("");
      setInlineCitationText("");
      setInlineNoEvidence(false);
    } catch (err) {
      setInlineError(err instanceof Error ? err.message : "Failed to save override.");
    }
  };

  const handleConfirmNotApplicable = async (id: string) => {
    const check = validateNotApplicableInput({
      reasonCode: naReasonCode,
      note: naReasonNote,
    });
    if (!check.valid) {
      setNaError(check.message || "Reason is required to mark N/A.");
      return;
    }
    setNaError(null);
    try {
      await resolveWorkItem(id, {
        action: "skip",
        reason_code: naReasonCode,
        note: naReasonNote.trim(),
      });
      setNaActionId(null);
      setNaReasonNote("");
    } catch (err) {
      setNaError(err instanceof Error ? err.message : "Failed to mark N/A.");
    }
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

  const effectiveDefensibilityScore = useMemo(() => {
    if (metrics.total === 0) return null;
    if (searchFilter.trim() || onlyEscalations) {
      return metrics.defensibilityScore ?? 0;
    }
    return executiveSummary?.defensibility_score ?? metrics.defensibilityScore ?? 0;
  }, [metrics, searchFilter, onlyEscalations, executiveSummary]);

  const isEmptyScope =
    filteredItems.length === 0 ||
    metrics.total === 0 ||
    (!searchFilter.trim() &&
      !onlyEscalations &&
      executiveSummary !== null &&
      executiveSummary.total_work_items === 0);

  const renderInlineEditorsOrAnswer = (item: WorkItem) => {
    const isLegal = item.verification_status === "ESCALATED_LEGAL";
    const isOverride = item.verification_status === "HUMAN_OVERRIDE";
    const isNotApplicable = item.verification_status === "NOT_APPLICABLE";

    if (inlineEditId === item.id) {
      return (
        <div className="space-y-1.5 p-2 rounded-lg bg-purple-50 border border-purple-200">
          <Select
            size="sm"
            ariaLabel={`Override reason code for ${item.prompt_or_question}`}
            value={inlineReasonCode}
            options={overrideReasonOptions}
            onChange={(val) => {
              setInlineReasonCode(val);
              setInlineError(null);
            }}
          />
          <input
            type="text"
            aria-label={`Edit answer for ${item.prompt_or_question}`}
            value={inlineEditText}
            onChange={(e) => {
              setInlineEditText(e.target.value);
              setInlineError(null);
            }}
            placeholder="Substantive answer (>=12 chars, >=3 words)"
            className="px-2 py-1 rounded border border-purple-300 bg-white text-xs w-full text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          <input
            type="text"
            aria-label="Override citation or locator reference"
            value={inlineCitationText}
            onChange={(e) => {
              setInlineCitationText(e.target.value);
              setInlineError(null);
            }}
            placeholder="Citation / locator (optional if attesting)"
            className="px-2 py-1 rounded border border-purple-300 bg-white text-[11px] w-full text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          <label className="flex items-center gap-1.5 text-[11px] text-zinc-900 cursor-pointer">
            <input
              type="checkbox"
              aria-label="No evidence — reviewer attests"
              checked={inlineNoEvidence}
              onChange={(e) => {
                setInlineNoEvidence(e.target.checked);
                setInlineError(null);
              }}
              className="rounded border-zinc-400 text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            />
            <span>No evidence — reviewer attests</span>
          </label>
          {inlineError && (
            <div
              role="alert"
              data-testid="results-override-error"
              className="text-[10px] font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1"
            >
              {inlineError}
            </div>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => void handleInlineResolve(item.id)}
              className="px-2 py-1 bg-purple-700 hover:bg-purple-800 text-white rounded text-[11px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Save Override
            </button>
            <button
              type="button"
              onClick={() => {
                setInlineEditId(null);
                setInlineError(null);
              }}
              className="px-2 py-1 bg-zinc-200 text-zinc-900 rounded text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (naActionId === item.id) {
      return (
        <div className="space-y-1.5 p-2 rounded-lg bg-slate-50 border border-slate-300">
          <Select
            size="sm"
            ariaLabel={`Not applicable reason code for ${item.prompt_or_question}`}
            value={naReasonCode}
            options={naReasonOptions}
            onChange={(val) => {
              setNaReasonCode(val);
              setNaError(null);
            }}
          />
          <input
            type="text"
            aria-label="Not applicable rationale"
            value={naReasonNote}
            onChange={(e) => {
              setNaReasonNote(e.target.value);
              setNaError(null);
            }}
            placeholder="Required reason for marking N/A..."
            className="w-full px-2 py-1 rounded border border-slate-300 bg-white text-[11px] text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          {naError && (
            <div
              role="alert"
              data-testid="results-na-error"
              className="text-[10px] font-medium text-rose-800 bg-rose-50 border border-rose-200 rounded px-2 py-1"
            >
              {naError}
            </div>
          )}
          <div className="flex items-center gap-1 flex-wrap">
            <button
              type="button"
              onClick={() => void handleConfirmNotApplicable(item.id)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded text-[10px] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Confirm N/A
            </button>
            <button
              type="button"
              onClick={() => {
                setNaActionId(null);
                setNaError(null);
              }}
              className="px-2 py-1 bg-zinc-200 text-zinc-900 rounded text-[10px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Cancel
            </button>
          </div>
        </div>
      );
    }

    if (legalActionId === item.id) {
      return (
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
          <div className="flex items-center gap-1 flex-wrap">
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
      );
    }

    return (
      <>
        <div className="line-clamp-2 font-serif italic break-words" title={item.fluent_output}>
          {item.fluent_output}
        </div>
        {isLegal && (
          <div className="text-[10px] font-mono text-amber-950 break-words">
            {item.escalation_assignee || "Legal Counsel"}
            {item.escalation_reason ? `: ${item.escalation_reason}` : ""}
          </div>
        )}
        {(isOverride || isNotApplicable) && item.human_override_reason_code && (
          <div className="text-[10px] font-mono text-purple-950 break-words">
            Reason: {item.human_override_reason_code}
            {item.no_evidence_attestation ? " · No evidence attested" : ""}
          </div>
        )}
      </>
    );
  };

  const renderCitationsCell = (item: WorkItem) => {
    const matchScore = item.gate_telemetry?.citation_match ?? 0;
    if (item.verified_citations.length === 0) {
      return (
        <span className="font-mono text-[10px] text-rose-800 font-semibold">
          {item.no_evidence_attestation ? "No evidence attested" : "Missing Proof"}
        </span>
      );
    }
    return item.verified_citations.map((citation, citIdx) => {
      const citDoc = resolveCitationDocument(documents, {
        locator: citation.locator,
        documentFilename: citation.document_filename,
        fallbackDocumentId: item.document_id,
      });
      const matchedNode = citDoc
        ? nodesByDocument[citDoc.id]?.find((n) => n.id === citation.ast_node_id)
        : undefined;
      const resolvedLocator =
        citation.locator ?? deriveNodeLocator(matchedNode, citDoc);
      return (
        <div key={`${item.id}-cit-${citIdx}`} className="space-y-0.5">
          <button
            type="button"
            data-testid={
              item.item_type === "TEMPORAL_CONFLICT"
                ? `chronos-table-locator-${citIdx}`
                : undefined
            }
            onClick={() => {
              inspectCitation({
                ...citation,
                locator: resolvedLocator,
                bounding_box:
                  citation.bounding_box ?? matchedNode?.bounding_box ?? null,
                confidence_score: matchScore,
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
            context={`results-row:${item.id}:${citIdx}`}
          />
        </div>
      );
    });
  };

  const renderActionButtons = (item: WorkItem, alignRight = true) => {
    const isLegal = item.verification_status === "ESCALATED_LEGAL";
    const isNotApplicable = item.verification_status === "NOT_APPLICABLE";
    const acceptState = getAcceptActionState(item);
    const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);

    return (
      <div className={`flex flex-wrap items-center gap-1 ${alignRight ? "justify-end" : "justify-start"}`}>
        {acceptState.visible && item.verification_status !== "VERIFIED" && (
          <button
            type="button"
            onClick={() =>
              void resolveWorkItem(
                item.id,
                "approve",
                acceptState.kind === "rescue"
                  ? item.vision_rescue_text ||
                      item.structured_facts[0]?.verbatim_quote ||
                      item.fluent_output
                  : item.machine_extracted_text ||
                      item.structured_facts[0]?.verbatim_quote ||
                      item.fluent_output
              )
            }
            className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-950 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {acceptState.label}
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            setInlineEditId(item.id);
            setInlineEditText(item.fluent_output);
            setInlineCitationText(
              item.gate_telemetry?.override_citation_text || ""
            );
            setInlineNoEvidence(Boolean(item.no_evidence_attestation));
            setInlineError(null);
            setNaActionId(null);
            setLegalActionId(null);
          }}
          className="px-2 py-1 rounded bg-purple-100 hover:bg-purple-200 text-purple-950 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
        >
          Override
        </button>

        {!isNotApplicable && (
          <button
            type="button"
            onClick={() => {
              setNaActionId(item.id);
              setNaReasonCode("");
              setNaReasonNote("");
              setNaError(null);
              setInlineEditId(null);
              setLegalActionId(null);
            }}
            className="px-2 py-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-900 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Mark N/A
          </button>
        )}

        {!isLegal && (
          <button
            type="button"
            onClick={() => {
              setLegalActionId(item.id);
              setInlineEditId(null);
              setNaActionId(null);
            }}
            className="px-2 py-1 rounded bg-amber-100 hover:bg-amber-200 text-amber-950 text-[11px] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Flag for Legal
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

        {item.verification_status !== "VERIFIED" && (
          <Link
            to={`/triage?item=${encodeURIComponent(item.id)}`}
            className="px-2 py-1 rounded bg-blue-50 hover:bg-blue-100 text-blue-800 text-[11px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Triage →
          </Link>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 min-w-0 overflow-hidden bg-white text-zinc-900 relative">
      {/* Fixed/Reserved Non-Shifting Status Toast Slot (CLS = 0) */}
      <div
        role="status"
        aria-live="polite"
        data-testid="results-status-toast"
        className="fixed top-16 right-4 sm:right-6 z-50 pointer-events-none"
      >
        {copiedNotification && (
          <div className="px-3.5 py-2 rounded-xl bg-emerald-900 text-white text-xs font-medium shadow-lg border border-emerald-700 flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-300 shrink-0" />
            <span>{copiedNotification}</span>
          </div>
        )}
      </div>

      {/* Shared Undo Toast in fixed overlay slot so resolving never shifts report layout */}
      <TriageToast className="fixed bottom-5 right-5 z-50 max-w-md shadow-xl" />

      {/* 1. Top Report Header Bar */}
      <header className="min-h-14 border-b border-zinc-200/90 bg-white px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 shrink-0 z-20">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
          <h1 className="text-sm sm:text-base font-bold text-zinc-950 font-ui tracking-tight">
            Executive Compliance & Risk Report
          </h1>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-200 text-[11px] sm:text-xs font-mono shrink-0">
            <ShieldCheck size={14} className="text-emerald-700 shrink-0" />
            <span>SHA-256 Zero-Data-Loss Verified</span>
          </div>

          <div className="flex p-0.5 rounded-lg bg-zinc-100 border border-zinc-200 text-xs shrink-0">
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
              Audit Ledger (
              <span className="inline-block tabular-nums min-w-[1.8ch] text-center">
                {auditLogs.length}
              </span>
              )
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            data-testid="results-reset-filters-btn"
            onClick={handleResetFilters}
            className="px-3 py-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-50 text-xs font-medium text-zinc-700 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Reset Filters
          </button>

          <button
            type="button"
            data-testid="results-export-xlsx-btn"
            disabled={!canExport}
            title={exportDisabledReason}
            onClick={handleRequestExportXlsx}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
              canExport
                ? "border-zinc-300 hover:bg-zinc-50 text-zinc-800 cursor-pointer"
                : "border-zinc-200 bg-zinc-100 text-zinc-500 cursor-not-allowed opacity-75"
            }`}
          >
            <FileSpreadsheet size={14} className={canExport ? "text-emerald-700" : "text-zinc-500"} />
            <span>Export Answered .XLSX</span>
          </button>

          <button
            type="button"
            data-testid="results-download-summary-btn"
            onClick={() => void handleDownloadSummary()}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
          >
            <Download size={14} />
            <span>Download Summary Report</span>
          </button>
        </div>
      </header>

      {/* Main Container: stacks Insight Configuration cleanly below < 1280px (xl) */}
      <div className="flex-1 flex flex-col xl:flex-row min-h-0 overflow-y-auto xl:overflow-hidden">
        {/* 2. Center Analytics & Findings Stage */}
        <div className="flex-1 min-w-0 p-4 sm:p-6 xl:overflow-y-auto bg-white space-y-5">
          {onlyEscalations && (
            <div
              data-testid="results-escalations-banner"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 text-xs flex flex-wrap items-center justify-between gap-2"
            >
              <span className="font-semibold">
                Showing Escalations & Unresolved Items (sorted P0 Critical → P3 Low)
              </span>
              <Link
                to="/triage"
                data-testid="results-open-triage-link"
                className="font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                Open in Triage Queue →
              </Link>
            </div>
          )}

          {isAuditTab ? (
            /* Cryptographic Audit Ledger View (?tab=audit) */
            <div className="space-y-6" data-testid="audit-ledger-panel">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 font-semibold text-sm text-emerald-950">
                    <ShieldCheck size={17} className="text-emerald-700 shrink-0" />
                    <span>SHA-256 Chain of Custody & Escalation Audit Ledger</span>
                  </div>
                  <p className="text-xs text-emerald-900">
                    Every document AST node tree, verification gate decision, legal flag, and undo operation is cryptographically hashed.
                  </p>
                </div>
                <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-white border border-emerald-200 text-emerald-900 shrink-0 tabular-nums min-w-[115px] text-center">
                  {auditLogs.length} Audit Events
                </span>
              </div>

              <div className="rounded-2xl border border-zinc-200 overflow-hidden">
                <div className="px-4 py-3 bg-zinc-50 border-b border-zinc-200 font-semibold text-xs text-zinc-900 tabular-nums">
                  Document Checksums ({documents.length})
                </div>
                <div className="divide-y divide-zinc-200">
                  {documents.map((doc) => (
                    <div key={doc.id} className="p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-900 break-words">{doc.filename}</div>
                        <div className="font-mono text-[11px] text-zinc-600 break-all">{doc.ast_checksum}</div>
                      </div>
                      <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 tabular-nums shrink-0">
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
                            <td className="py-2.5 px-3 font-mono text-[10px] text-zinc-600 tabular-nums">
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
              {/* Category Legend Bar (reserved min-h + tabular-nums counts for CLS = 0) */}
              <div className="min-h-7 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs font-medium text-zinc-700 pb-2 border-b border-zinc-100 tabular-nums">
                {Object.entries(CATEGORY_COLORS)
                  .slice(0, 6)
                  .map(([cat, color]) => (
                    <div key={cat} className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: color.fill }}
                      />
                      <span className="text-zinc-800">{cat}</span>
                      <span className="font-mono text-[10px] text-zinc-600 min-w-[2.4ch] text-right tabular-nums">
                        ({categoryCounts[cat] ?? 0})
                      </span>
                    </div>
                  ))}
              </div>

              {/* Envoy Executive Synthesis Callout Card (Live Backend / Dynamic Synthesis) */}
              <div
                data-testid="envoy-summary-card"
                className="p-4 sm:p-6 rounded-2xl bg-zinc-50 border border-zinc-200/90 shadow-2xs space-y-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="w-6 h-6 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-serif font-bold text-xs">
                      E
                    </span>
                    <span className="text-xs font-bold uppercase tracking-wider text-zinc-700 font-mono">
                      Envoy Executive Synthesis
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 tabular-nums">
                    <span
                      data-testid="metrics-machine-verified"
                      className="min-h-6 min-w-[126px] inline-flex items-center justify-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-100 border border-emerald-300 text-emerald-950 tabular-nums"
                    >
                      {metrics.machineVerified} Machine Verified
                    </span>
                    <span
                      data-testid="metrics-human-override"
                      className="min-h-6 min-w-[126px] inline-flex items-center justify-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-100 border border-purple-300 text-purple-950 tabular-nums"
                    >
                      {metrics.humanOverride} Human Overridden
                    </span>
                    <span
                      data-testid="metrics-escalated-legal"
                      className="min-h-6 min-w-[122px] inline-flex items-center justify-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-950 tabular-nums"
                    >
                      {metrics.escalatedLegal} Escalated Legal
                    </span>
                    <span
                      data-testid="metrics-not-applicable"
                      className="min-h-6 min-w-[96px] inline-flex items-center justify-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-100 border border-slate-300 text-slate-900 tabular-nums"
                    >
                      {metrics.notApplicable} Marked N/A
                    </span>
                    <span
                      data-testid="metrics-unresolved"
                      className="min-h-6 min-w-[98px] inline-flex items-center justify-center text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-rose-100 border border-rose-300 text-rose-950 tabular-nums"
                    >
                      {metrics.unresolved} Unresolved
                    </span>
                    <span
                      data-testid="metrics-defensibility-score"
                      className="min-h-6 min-w-[178px] inline-flex items-center justify-center text-xs font-mono font-semibold px-2 py-0.5 rounded bg-white border border-zinc-200 text-zinc-900 tabular-nums"
                    >
                      {effectiveDefensibilityScore === null
                        ? "N/A Defensibility Score"
                        : `${effectiveDefensibilityScore}% Defensibility Score`}
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
                      className="min-h-6 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white hover:bg-zinc-100 border border-zinc-300 text-zinc-800 text-[11px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <RefreshCw size={11} className={summaryStatus === "loading" ? "spin" : ""} />
                      <span>Refresh</span>
                    </button>
                  </div>
                </div>

                {summaryStatus === "loading" && !executiveSummary && workItems.length > 0 ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-zinc-700 min-h-[52px]">
                    <RefreshCw size={14} className="spin text-blue-700" />
                    <span>Generating real-time Envoy synthesis for active filter…</span>
                  </div>
                ) : summaryStatus === "error" && !executiveSummary && filteredItems.length > 0 ? (
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
                ) : isEmptyScope ? (
                  <div
                    data-testid="summary-empty-state"
                    className="p-3.5 rounded-xl bg-white border border-dashed border-zinc-300 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="text-zinc-900 text-sm font-semibold">
                        0 findings match the current document/filters
                      </p>
                      <p className="text-zinc-600 text-xs">
                        {workItems.length === 0
                          ? "No corpus findings have been analyzed yet. Load the Investor Demo Case or upload documents in the Workspace."
                          : "Adjust Data Source, search terms, or Verification Filters to inspect matching findings."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          data-testid="summary-reset-filters-btn"
                          onClick={handleResetFilters}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          Reset Filters
                        </button>
                      )}
                      {workItems.length === 0 && (
                        <button
                          type="button"
                          data-testid="summary-load-demo-btn"
                          onClick={() => void loadDemo()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <Sparkles size={13} />
                          <span>Load Demo Case</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-zinc-900 text-sm leading-relaxed font-serif whitespace-pre-wrap">
                      {executiveSummary?.summary_text ||
                        `Showing ${metrics.total} active finding(s): ${metrics.machineVerified} machine verified (${effectiveDefensibilityScore ?? 0}% defensibility).`}
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
              <div
                data-testid="results-chart-card"
                className="p-4 sm:p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm space-y-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-zinc-950 font-ui">
                      {metricType === "confidence" ? "Average Match Confidence" : "Findings Distribution"} by{" "}
                      {groupedBy === "documents" ? "Document" : "Category"}
                    </h3>
                    <span className="text-[11px] text-zinc-600 font-mono">
                      Segmented by {segmentedBy === "category" ? "Quartermaster Category" : "Caution Tier"}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-700 font-medium tabular-nums min-w-[116px] text-right">
                    Total: {metrics.total} findings
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
                    {chartModel.columns.map((col) => (
                      <tr key={`sr-${col.fullLabel}`}>
                        <td>{col.fullLabel}</td>
                        <td>{col.rawCount}</td>
                        <td>{metricType === "confidence" ? `${col.total}%` : col.total}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {chartModel.isEmpty ? (
                  <div
                    data-testid="chart-zero-state"
                    className="h-64 flex flex-col items-center justify-center text-center px-4 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 space-y-3"
                  >
                    <span className="w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-500 shadow-2xs">
                      <BarChart3 size={18} />
                    </span>
                    <div className="space-y-1 max-w-md">
                      <div className="text-xs font-semibold text-zinc-900">
                        0 findings match the current document/filters
                      </div>
                      <p className="text-[11px] text-zinc-600">
                        {workItems.length === 0
                          ? "Load the Investor Demo Case or upload corpus documents to plot findings and confidence metrics."
                          : "No chart bars can be plotted for this empty slice. Reset filters to restore the full breakdown."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={handleResetFilters}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          Reset Filters
                        </button>
                      )}
                      {workItems.length === 0 && (
                        <button
                          type="button"
                          onClick={() => void loadDemo()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <Sparkles size={12} />
                          <span>Load Demo Case</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    data-testid="results-chart-bars"
                    className="h-64 flex items-end gap-2 sm:gap-4 md:gap-6 pt-8 pb-2 px-2 sm:px-4 border-b border-zinc-200/80 overflow-x-auto"
                  >
                    {chartModel.columns.map((col) => (
                      <div
                        key={col.fullLabel}
                        data-testid="chart-bar-column"
                        data-metric-value={col.total}
                        className="flex-1 min-w-[48px] flex flex-col items-center h-full justify-end group relative"
                      >
                        <div className="absolute -top-9 opacity-0 group-hover:opacity-100 transition-opacity bg-zinc-900 text-white text-[10px] font-mono py-1 px-2 rounded pointer-events-none z-30 whitespace-nowrap shadow-md tabular-nums">
                          {col.fullLabel}:{" "}
                          {metricType === "confidence"
                            ? `${col.total}% avg match (${col.rawCount})`
                            : `${col.total} findings`}
                        </div>

                        <span className="mb-1 text-[10px] font-mono font-semibold text-zinc-700 tabular-nums">
                          {metricType === "confidence" ? `${col.total}%` : col.total}
                        </span>

                        {col.colHeightPercent > 0 ? (
                          <div
                            data-testid="chart-bar-fill"
                            data-height-percent={col.colHeightPercent}
                            className="w-full max-w-16 rounded-t-lg overflow-hidden flex flex-col-reverse transition-all duration-300 shadow-2xs group-hover:scale-[1.02] bg-zinc-100"
                            style={{ height: `${col.colHeightPercent}%` }}
                          >
                            {col.segments.map((seg, sIdx) => (
                              <div
                                key={`${seg.key}-${sIdx}`}
                                data-testid="chart-bar-segment"
                                data-seg-key={seg.key}
                                data-seg-height={seg.heightPercent}
                                className="w-full transition-all relative border-t border-white/20 first:border-0"
                                style={{
                                  height: `${seg.heightPercent}%`,
                                  backgroundColor: seg.color,
                                }}
                                title={
                                  metricType === "confidence"
                                    ? `${seg.key}: ${seg.avgConfidence}% avg match (${seg.count} items)`
                                    : `${seg.key}: ${seg.count}`
                                }
                              />
                            ))}
                          </div>
                        ) : (
                          <div
                            data-testid="chart-bar-zero-baseline"
                            className="w-full max-w-16 h-0.5 bg-zinc-300 rounded-full"
                            title={`${col.fullLabel}: 0%`}
                          />
                        )}

                        <span
                          className="mt-2.5 text-[11px] font-medium text-zinc-700 truncate max-w-20 text-center"
                          title={col.fullLabel}
                        >
                          {col.label}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Contributing Findings & Answers Table */}
              <div
                data-testid="results-findings-card"
                className="p-4 sm:p-6 rounded-2xl bg-white border border-zinc-200/90 shadow-sm space-y-4"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-zinc-950 font-ui">
                      Contributing Findings & Verbatim Evidence Table
                    </h3>
                    <span className="text-[11px] text-zinc-600 font-mono tabular-nums">
                      {metrics.total} records active ({metrics.machineVerified} machine verified, {metrics.humanOverride} override, {metrics.escalatedLegal} legal, {metrics.notApplicable} n/a, {metrics.unresolved} unresolved)
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Link
                      to="/triage"
                      className="text-xs font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1"
                    >
                      Open in Triage Queue →
                    </Link>
                    <div className="relative w-full sm:w-56">
                      <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-600" />
                      <input
                        type="text"
                        aria-label="Filter findings table"
                        placeholder="Filter findings..."
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        className="pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-900 placeholder:text-zinc-600 focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-all w-full"
                      />
                    </div>
                  </div>
                </div>

                {filteredItems.length === 0 ? (
                  <div
                    data-testid="findings-table-empty-state"
                    className="p-8 text-center rounded-xl border border-dashed border-zinc-300 bg-zinc-50/70 space-y-3"
                  >
                    <div className="mx-auto w-10 h-10 rounded-xl bg-white border border-zinc-200 flex items-center justify-center text-zinc-500 shadow-2xs">
                      <FileSearch size={18} />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-semibold text-zinc-900">
                        0 findings match the current document/filters
                      </div>
                      <p className="text-[11px] text-zinc-600 max-w-md mx-auto">
                        {workItems.length === 0
                          ? "No findings are available in this workspace yet. Load the demo corpus or upload files to run verification."
                          : "Try clearing the search query, switching Data Source back to All Uploaded Documents, or resetting verification filters."}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                      {hasActiveFilters && (
                        <button
                          type="button"
                          data-testid="table-reset-filters-btn"
                          onClick={handleResetFilters}
                          className="px-3 py-1.5 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-100 text-xs font-semibold text-zinc-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          Reset Filters
                        </button>
                      )}
                      {workItems.length === 0 && (
                        <button
                          type="button"
                          data-testid="table-load-demo-btn"
                          onClick={() => void loadDemo()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <Sparkles size={12} />
                          <span>Load Demo Case</span>
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Mobile Accessible Card View (< 768px) */}
                    <div className="md:hidden space-y-3" data-testid="results-mobile-cards">
                      {filteredItems.map((item) => {
                        const currentPriority = item.priority_tier;
                        const originalPriority = item.original_priority_tier || item.priority_tier;
                        const isCritical = currentPriority === "P0_CRITICAL";
                        const isHigh = currentPriority === "P1_HIGH";
                        const isLegal = item.verification_status === "ESCALATED_LEGAL";
                        const isOverride = item.verification_status === "HUMAN_OVERRIDE";
                        const isNotApplicable = item.verification_status === "NOT_APPLICABLE";
                        const matchScore = item.gate_telemetry?.citation_match ?? 0;
                        const matchTone = getMatchBadgeTone(
                          matchScore,
                          item.verification_status,
                          item.weak_evidence
                        );

                        return (
                          <article
                            key={`mobile-${item.id}`}
                            data-testid={`results-mobile-card-${item.id}`}
                            className={`rounded-xl border border-zinc-200 p-3.5 space-y-2.5 text-xs ${
                              isLegal
                                ? "bg-amber-50/50"
                                : isOverride
                                  ? "bg-purple-50/40"
                                  : isNotApplicable
                                    ? "bg-slate-50/60"
                                    : isCritical
                                      ? "bg-rose-50/40"
                                      : "bg-white"
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-1.5">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                                    isCritical
                                      ? "bg-rose-100 text-rose-900 border border-rose-200"
                                      : isHigh
                                        ? "bg-amber-100 text-amber-900 border border-amber-200"
                                        : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                  }`}
                                >
                                  {currentPriority}
                                </span>
                                <span
                                  className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                                    isLegal
                                      ? "bg-amber-200/80 text-amber-950 border border-amber-300"
                                      : isOverride
                                        ? "bg-purple-100 text-purple-950 border border-purple-300"
                                        : isNotApplicable
                                          ? "bg-slate-200 text-slate-900 border border-slate-300"
                                          : item.verification_status === "VERIFIED"
                                            ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
                                            : "bg-rose-100 text-rose-950 border border-rose-300"
                                  }`}
                                >
                                  {isOverride ? "Human Override" : item.verification_status}
                                </span>
                                {item.weak_evidence && (
                                  <span className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300">
                                    Weak Evidence
                                  </span>
                                )}
                              </div>
                              <span
                                className={`inline-block px-2 py-0.5 rounded text-[11px] font-mono font-bold tabular-nums ${matchTone.badgeClass}`}
                              >
                                {isOverride
                                  ? `${Math.round(matchScore)}% · Unverified by gate`
                                  : `${Math.round(matchScore)}%`}
                              </span>
                            </div>

                            <div className="text-[11px] font-mono text-zinc-600">
                              {item.category} · Original: {originalPriority}
                            </div>

                            <div className="font-semibold text-zinc-900 break-words">
                              {item.prompt_or_question}
                            </div>

                            <div className="text-zinc-800 space-y-1">
                              {renderInlineEditorsOrAnswer(item)}
                            </div>

                            {showExactQuotes && (
                              <div className="pt-1 border-t border-zinc-200/70 space-y-1.5">
                                {renderCitationsCell(item)}
                              </div>
                            )}

                            <div
                              data-testid={`results-action-cell-${item.id}`}
                              data-results-action-visible="true"
                              className="pt-2 border-t border-zinc-200/70"
                            >
                              {renderActionButtons(item, false)}
                            </div>
                          </article>
                        );
                      })}
                    </div>

                    {/* Desktop & Tablet Responsive Table View (>= 768px) with fixed column layout + sticky Action column */}
                    <div
                      data-testid="results-table-scroll"
                      className="hidden md:block overflow-x-auto border border-zinc-200/80 rounded-xl"
                    >
                      <table className="w-full min-w-[920px] table-fixed text-left text-xs border-collapse">
                        <colgroup>
                          <col className="w-[126px]" />
                          <col className="w-[106px]" />
                          <col className="w-[154px]" />
                          <col className="w-[214px]" />
                          {showExactQuotes && <col className="w-[172px]" />}
                          <col className="w-[82px]" />
                          <col className="w-[170px]" />
                        </colgroup>
                        <thead>
                          <tr className="bg-zinc-50 border-b border-zinc-200 text-zinc-700 font-semibold uppercase text-[10px] tracking-wider">
                            <th className="py-3 px-2.5">Priority & Status</th>
                            <th className="py-3 px-2.5">Category</th>
                            <th className="py-3 px-2.5">Question / Clause</th>
                            <th className="py-3 px-2.5">Fluent Answer (Envoy)</th>
                            {showExactQuotes && <th className="py-3 px-2.5">Exact Verbatim Quote</th>}
                            <th className="py-3 px-2.5">Match %</th>
                            <th
                              data-testid="results-actions-header"
                              className="py-3 px-2.5 text-right sticky right-0 z-10 bg-zinc-50 border-l border-zinc-200/80 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)]"
                            >
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-200/70">
                          {filteredItems.map((item) => {
                            const currentPriority = item.priority_tier;
                            const originalPriority = item.original_priority_tier || item.priority_tier;
                            const isCritical = currentPriority === "P0_CRITICAL";
                            const isHigh = currentPriority === "P1_HIGH";
                            const isLegal = item.verification_status === "ESCALATED_LEGAL";
                            const isOverride = item.verification_status === "HUMAN_OVERRIDE";
                            const isNotApplicable = item.verification_status === "NOT_APPLICABLE";
                            const matchScore = item.gate_telemetry?.citation_match ?? 0;
                            const matchTone = getMatchBadgeTone(
                              matchScore,
                              item.verification_status,
                              item.weak_evidence
                            );

                            const rowBg = isLegal
                              ? "bg-amber-50/50"
                              : isOverride
                                ? "bg-purple-50/35"
                                : isNotApplicable
                                  ? "bg-slate-50/50"
                                  : isCritical
                                    ? "bg-rose-50/35"
                                    : isHigh
                                      ? "bg-amber-50/20"
                                      : "bg-white";

                            const stickyCellBg = isLegal
                              ? "bg-[#FFFBEB]"
                              : isOverride
                                ? "bg-[#FAF5FF]"
                                : isNotApplicable
                                  ? "bg-[#F8FAFC]"
                                  : isCritical
                                    ? "bg-[#FFF5F6]"
                                    : isHigh
                                      ? "bg-[#FFFDF5]"
                                      : "bg-white";

                            return (
                              <tr
                                key={item.id}
                                data-testid={`results-row-${item.id}`}
                                className={`hover:bg-zinc-50/70 transition-colors ${rowBg}`}
                              >
                                {/* Priority & Verification Status */}
                                <td className="py-3 px-2.5 align-top space-y-1">
                                  <span
                                    data-testid={`row-priority-${item.id}`}
                                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded block w-fit ${
                                      isCritical
                                        ? "bg-rose-100 text-rose-900 border border-rose-200"
                                        : isHigh
                                          ? "bg-amber-100 text-amber-900 border border-amber-200"
                                          : "bg-emerald-100 text-emerald-900 border border-emerald-200"
                                    }`}
                                  >
                                    {currentPriority}
                                  </span>
                                  <span
                                    data-testid={`row-original-priority-${item.id}`}
                                    className="font-mono text-[9px] text-zinc-600 block w-fit"
                                  >
                                    Original: {originalPriority}
                                  </span>
                                  <span
                                    data-testid={`row-status-${item.id}`}
                                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded block w-fit font-semibold break-all ${
                                      isLegal
                                        ? "bg-amber-200/80 text-amber-950 border border-amber-300"
                                        : isOverride
                                          ? "bg-purple-100 text-purple-950 border border-purple-300"
                                          : isNotApplicable
                                            ? "bg-slate-200 text-slate-900 border border-slate-300"
                                            : item.verification_status === "VERIFIED"
                                              ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
                                              : "bg-rose-100 text-rose-950 border border-rose-300"
                                    }`}
                                  >
                                    {isOverride ? "Human Override" : item.verification_status}
                                  </span>
                                  {item.weak_evidence && (
                                    <span
                                      data-testid="weak-evidence-badge"
                                      title={item.weak_evidence_reason || "Quote below specificity threshold"}
                                      className="font-mono text-[9px] font-semibold px-1.5 py-0.5 rounded block w-fit bg-amber-100 text-amber-950 border border-amber-300"
                                    >
                                      Weak Evidence
                                    </span>
                                  )}
                                </td>

                                {/* Category */}
                                <td className="py-3 px-2.5 align-top font-medium text-zinc-800 break-words leading-snug">
                                  {item.category}
                                </td>

                                {/* Question / Clause */}
                                <td
                                  data-testid={`row-question-${item.id}`}
                                  className="py-3 px-2.5 align-top font-semibold text-zinc-900"
                                >
                                  <div className="line-clamp-2 break-words" title={item.prompt_or_question}>
                                    {item.prompt_or_question}
                                  </div>
                                </td>

                                {/* Fluent Answer + Inline Editors (fixed col width prevents horizontal CLS) */}
                                <td
                                  data-testid={`row-answer-${item.id}`}
                                  className="py-3 px-2.5 align-top text-zinc-800 space-y-1"
                                >
                                  {renderInlineEditorsOrAnswer(item)}
                                </td>

                                {/* Exact Verbatim Quote(s) + EvidenceLocatorBadge */}
                                {showExactQuotes && (
                                  <td className="py-3 px-2.5 align-top text-zinc-700 space-y-1.5">
                                    {renderCitationsCell(item)}
                                  </td>
                                )}

                                {/* Match % */}
                                <td className="py-3 px-2.5 align-top font-mono font-bold tabular-nums">
                                  <span
                                    data-testid={`row-match-${item.id}`}
                                    className={`inline-block min-w-[54px] text-center px-2 py-0.5 rounded text-[11px] tabular-nums ${matchTone.badgeClass}`}
                                  >
                                    {isOverride
                                      ? `${Math.round(matchScore)}% · Unverified by gate`
                                      : `${Math.round(matchScore)}%`}
                                  </span>
                                </td>

                                {/* Resolution Actions (sticky right-0 so Action column is never clipped at 768..1280px) */}
                                <td
                                  data-testid={`results-action-cell-${item.id}`}
                                  data-results-action-visible="true"
                                  className={`py-3 px-2.5 align-top text-right sticky right-0 z-10 border-l border-zinc-200/80 shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.06)] ${stickyCellBg}`}
                                >
                                  {renderActionButtons(item, true)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* 3. Right Configuration & Insight Sidebar (stacks cleanly below < 1280px, collapsible via aria-expanded) */}
        <aside
          data-testid="insight-configuration-sidebar"
          className="w-full xl:w-80 xl:h-full bg-[#F9FAFB] border-t xl:border-t-0 xl:border-l border-zinc-200/80 p-4 sm:p-5 xl:overflow-y-auto text-xs text-zinc-900 shrink-0"
        >
          <button
            type="button"
            data-testid="insight-config-toggle"
            aria-expanded={configOpen}
            aria-controls="insight-configuration-body"
            onClick={() => setConfigOpen((prev) => !prev)}
            className="w-full flex items-center justify-between pb-3 border-b border-zinc-200 text-left cursor-pointer rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span className="flex items-center gap-1.5 font-semibold text-sm text-zinc-950">
              <SlidersHorizontal size={15} className="text-zinc-600" />
              <span>Insight Configuration</span>
            </span>
            <ChevronDown
              size={15}
              className={`text-zinc-600 transition-transform duration-150 ${
                configOpen ? "rotate-0" : "-rotate-90"
              }`}
            />
          </button>

          {configOpen && (
            <div id="insight-configuration-body" className="pt-5 space-y-5">
              <Select
                id="results-data-source"
                label="Data Source"
                value={selectedDocFilter}
                options={dataSourceOptions}
                onChange={setSelectedDocFilter}
              />

              <Select
                id="results-metric-select"
                label="Metric"
                value={metricType}
                options={metricOptions}
                onChange={setMetricType}
              />

              <Select
                id="results-grouped-by"
                label="Grouped By"
                value={groupedBy}
                options={groupedByOptions}
                onChange={setGroupedBy}
              />

              <Select
                id="results-segmented-by"
                label="Segmented By"
                value={segmentedBy}
                options={segmentedByOptions}
                onChange={setSegmentedBy}
              />

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
            </div>
          )}
        </aside>
      </div>

      {/* Pre-Export Audit Warning Confirmation Modal */}
      {exportWarningOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-warning-title"
          data-testid="export-warning-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4"
        >
          <div className="w-full max-w-lg rounded-2xl bg-white border border-zinc-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 border border-amber-300 flex items-center justify-center shrink-0">
                  <AlertTriangle size={18} />
                </span>
                <div>
                  <h2
                    id="export-warning-title"
                    className="text-sm font-bold text-zinc-950 font-ui"
                  >
                    Export Includes Non-Machine-Verified Items
                  </h2>
                  <p className="text-xs text-zinc-700 mt-0.5">
                    Review the unverified / overridden / N/A counts stamped into the exported .XLSX audit columns before continuing.
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close export warning modal"
                onClick={() => setExportWarningOpen(false)}
                className="p-1 rounded-lg hover:bg-zinc-100 text-zinc-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 space-y-1.5">
              {exportWarningLines.map((line, idx) => (
                <div key={idx} className="text-xs font-mono font-medium text-amber-950 tabular-nums">
                  • {line}
                </div>
              ))}
            </div>

            <div className="text-[11px] text-zinc-700">
              Exported rows include <span className="font-mono font-semibold">AI_Status</span>,{" "}
              <span className="font-mono font-semibold">Original_Priority</span>,{" "}
              <span className="font-mono font-semibold">Review_Warning</span>,{" "}
              <span className="font-mono font-semibold">Reason_Code</span>, and{" "}
              <span className="font-mono font-semibold">Weak_Evidence</span> columns.
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200">
              <button
                type="button"
                data-testid="export-warning-cancel"
                onClick={() => setExportWarningOpen(false)}
                className="px-3.5 py-2 rounded-lg border border-zinc-300 bg-white hover:bg-zinc-50 text-xs font-semibold text-zinc-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                Cancel Export
              </button>
              <button
                type="button"
                data-testid="export-warning-confirm"
                onClick={() => void performExportXlsx()}
                className="px-4 py-2 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] text-white text-xs font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              >
                Confirm Export .XLSX
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
