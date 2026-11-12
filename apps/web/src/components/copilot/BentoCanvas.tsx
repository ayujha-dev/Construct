import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  MessageSquare,
  RotateCcw,
  Scale,
  ShieldAlert,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../../lib/evidenceLocators";
import { getAcceptActionState, sortTriageQueue } from "../../lib/triageQueue";
import {
  computeWorkItemMetrics,
  getMatchBadgeTone,
  itemMatchesDocumentFilter,
} from "../../lib/workItemMetrics";
import { useBertStore } from "../../store/useBertStore";
import { TriageToast } from "../triage/TriageToast";
import { CorpusFilterBanner } from "./CorpusFilterBanner";
import { EvidenceLocatorBadge } from "./EvidenceLocatorBadge";

export function BentoCanvas() {
  const navigate = useNavigate();
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    activeJob,
    isSimulating,
    hasCompletedRun,
    selectedDocumentId,
    selectedFileFilterId,
    setSelectedFileFilter,
    setActiveInspectorTab,
    inspectCitation,
    resolveWorkItem,
    undoWorkItem,
    askCopilot,
    asking,
    workspaceId,
  } = useBertStore();

  const [dockInput, setDockInput] = useState("");
  const [selectedBentoTab, setSelectedBentoTab] = useState<"all" | "critical" | "verified">("all");

  const visibleDocuments = useMemo(
    () => (selectedFileFilterId ? documents.filter((d) => d.id === selectedFileFilterId) : documents),
    [documents, selectedFileFilterId]
  );

  const scopedWorkItems = useMemo(
    () =>
      selectedFileFilterId
        ? workItems.filter((i) => itemMatchesDocumentFilter(i, selectedFileFilterId))
        : workItems,
    [selectedFileFilterId, workItems]
  );

  const scopedMetrics = useMemo(() => computeWorkItemMetrics(scopedWorkItems), [scopedWorkItems]);
  const isRunning =
    isSimulating || activeJob?.status === "RUNNING" || activeJob?.status === "RESUMING";
  const canExport = !isRunning && workItems.length > 0 && hasCompletedRun;

  const criticalItems = useMemo(
    () =>
      scopedWorkItems.filter(
        (i) =>
          i.priority_tier === "P0_CRITICAL" ||
          i.item_type === "TEMPORAL_CONFLICT" ||
          Boolean(i.temporal_conflict) ||
          (i.verification_status !== "VERIFIED" &&
            i.verification_status !== "NOT_APPLICABLE" &&
            i.verification_status !== "HUMAN_OVERRIDE")
      ),
    [scopedWorkItems]
  );

  const pendingQueueItems = useMemo(
    () =>
      sortTriageQueue(
        scopedWorkItems.filter(
          (i) =>
            i.verification_status !== "VERIFIED" &&
            i.verification_status !== "HUMAN_OVERRIDE" &&
            i.verification_status !== "NOT_APPLICABLE"
        )
      ),
    [scopedWorkItems]
  );

  const verifiedItems = useMemo(
    () => scopedWorkItems.filter((i) => i.verification_status === "VERIFIED"),
    [scopedWorkItems]
  );

  const handleDockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dockInput.trim()) return;
    void askCopilot(dockInput.trim(), selectedFileFilterId ?? undefined);
    setDockInput("");
  };

  const inspectWorkItemCitation = (item: (typeof workItems)[number]) => {
    const cit = item.verified_citations[0];
    if (!cit) return;
    const targetDoc = resolveCitationDocument(documents, {
      locator: cit.locator,
      documentFilename: cit.document_filename,
      fallbackDocumentId: item.document_id,
    });
    const node = targetDoc
      ? nodesByDocument[targetDoc.id]?.find((n) => n.id === cit.ast_node_id)
      : undefined;
    inspectCitation({
      ...cit,
      locator: cit.locator ?? deriveNodeLocator(node, targetDoc),
      bounding_box: cit.bounding_box ?? node?.bounding_box ?? null,
      confidence_score: item.gate_telemetry.citation_match,
      document_filename: cit.document_filename || targetDoc?.filename || "",
    });
  };

  const showCorpusCard = selectedBentoTab === "all" || selectedBentoTab === "verified";
  const showCriticalCard = selectedBentoTab === "all" || selectedBentoTab === "critical";
  const showQueueCard = selectedBentoTab === "all" || selectedBentoTab === "critical";
  const showVerifiedCard = selectedBentoTab === "all" || selectedBentoTab === "verified";

  return (
    <div className="relative flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 dot-grid-pattern bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="max-w-5xl mx-auto space-y-6 pb-28">
        <TriageToast />
        <CorpusFilterBanner />

        {/* Top Canvas Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[var(--bg-surface)] p-4 rounded-2xl border border-[var(--border-subtle)] shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border border-[var(--accent-brand-border)]">
                BENTO CANVAS MODE
              </span>
              <span className="text-xs text-[var(--text-muted)]">&middot;</span>
              <span className="text-xs font-mono text-[var(--text-secondary)] tabular-nums">
                {visibleDocuments.length} Active {visibleDocuments.length === 1 ? "Document" : "Documents"}
              </span>
            </div>
            <h2 className="text-xl font-semibold text-[var(--text-primary)] mt-1 font-serif tracking-tight">
              Visual Intelligence Architecture
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedBentoTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] tabular-nums ${
                selectedBentoTab === "all"
                  ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)]"
                  : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)]"
              }`}
            >
              All Intelligence ({scopedWorkItems.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedBentoTab("critical")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] tabular-nums ${
                selectedBentoTab === "critical"
                  ? "bg-[var(--status-danger-solid)] text-white"
                  : "bg-[var(--bg-surface)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] hover:bg-[var(--status-danger-soft)]"
              }`}
            >
              Critical Risks ({criticalItems.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedBentoTab("verified")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] tabular-nums ${
                selectedBentoTab === "verified"
                  ? "bg-[var(--status-verified-solid)] text-white"
                  : "bg-[var(--bg-surface)] border border-[var(--status-verified-border)] text-[var(--status-verified-ink)] hover:bg-[var(--status-verified-soft)]"
              }`}
            >
              Verified Safe ({verifiedItems.length})
            </button>
          </div>
        </div>

        {/* 4 Bento Containers */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Card 1: Corpus Architecture */}
          {showCorpusCard && (
            <div className="md:col-span-5 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] flex items-center justify-center">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Corpus Architecture
                    </h3>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      Quartermaster Classification
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-[var(--accent-brand-ink)] tabular-nums">
                  {visibleDocuments.length} Staged
                </span>
              </div>

              <div className="space-y-2.5">
                {visibleDocuments.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--text-muted)]">
                    No documents available in current view.
                  </div>
                ) : (
                  visibleDocuments.map((doc) => {
                    const isSelected = doc.id === (selectedFileFilterId || selectedDocumentId);
                    return (
                      <div
                        key={doc.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => setSelectedFileFilter(doc.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelectedFileFilter(doc.id);
                          }
                        }}
                        className={`p-3 rounded-xl border text-xs space-y-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                          isSelected
                            ? "bg-[var(--accent-brand-soft)] border-[var(--accent-brand-border)] ring-1 ring-[var(--accent-brand-ring)]"
                            : "bg-[var(--bg-sunken)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-medium">
                          <span className="truncate text-[var(--text-primary)] font-semibold" title={doc.filename}>
                            {doc.filename}
                          </span>
                          <span className="font-mono text-[10px] text-[var(--text-muted)] shrink-0">
                            {doc.source_format}
                          </span>
                        </div>
                        <div className="text-[11px] text-[var(--text-secondary)]">
                          Category:{" "}
                          <span className="text-[var(--text-primary)] font-medium">
                            {doc.category || "General"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-1 tabular-nums">
                          <span>{doc.total_ast_nodes} AST nodes</span>
                          <span>SHA-256 Verified</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Card 2: Critical Risks & Contradictions */}
          {showCriticalCard && (
            <div
              className={`${
                showCorpusCard ? "md:col-span-7" : "md:col-span-6"
              } rounded-3xl bg-[var(--status-danger-row)] border border-[var(--status-danger-border)] p-5 shadow-sm space-y-4`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-[var(--status-danger-border)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] flex items-center justify-center">
                    <ShieldAlert size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--status-danger-ink)]">
                      Critical Risks &amp; Contradictions
                    </h3>
                    <span className="text-[10px] text-[var(--status-danger-ink)] opacity-90 font-mono">
                      Vanguard &amp; Arbiter Triage
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[var(--status-danger-solid)] text-white text-[10px] font-bold font-mono tabular-nums">
                  {criticalItems.length} Flagged
                </span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {criticalItems.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[var(--bg-surface)] text-center text-xs text-[var(--text-secondary)]">
                    No critical risks detected for this filter.
                  </div>
                ) : (
                  criticalItems.map((item) => {
                    const isTemporalConflict =
                      item.item_type === "TEMPORAL_CONFLICT" || Boolean(item.temporal_conflict);

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        data-testid={isTemporalConflict ? "temporal-conflict-card" : "bento-critical-card"}
                        onClick={() => inspectWorkItemCitation(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            inspectWorkItemCitation(item);
                          }
                        }}
                        className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--status-danger-border)] text-xs space-y-2 cursor-pointer hover:border-[var(--status-danger-ink)] shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {item.prompt_or_question}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {isTemporalConflict && (
                              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]">
                                TEMPORAL CONFLICT
                              </span>
                            )}
                            {item.weak_evidence && (
                              <span
                                data-testid="weak-evidence-badge"
                                className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]"
                              >
                                Weak Evidence
                              </span>
                            )}
                            <span className="font-mono text-[10px] font-bold text-[var(--status-danger-ink)] tabular-nums">
                              {item.priority_tier} &middot; {item.priority_score}
                            </span>
                          </div>
                        </div>

                        {item.verified_citations.length > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {item.verified_citations.map((cit, citIdx) => {
                              const citDoc = resolveCitationDocument(documents, {
                                locator: cit.locator,
                                documentFilename: cit.document_filename,
                                fallbackDocumentId: item.document_id,
                              });
                              const matchedNode = citDoc
                                ? nodesByDocument[citDoc.id]?.find((n) => n.id === cit.ast_node_id)
                                : undefined;
                              const resolvedLocator =
                                cit.locator ?? deriveNodeLocator(matchedNode, citDoc);

                              return (
                                <button
                                  key={`${item.id}-cit-${citIdx}`}
                                  type="button"
                                  data-testid={
                                    isTemporalConflict
                                      ? `chronos-locator-${citIdx}`
                                      : `bento-locator-${citIdx}`
                                  }
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    inspectCitation({
                                      ...cit,
                                      locator: resolvedLocator,
                                      bounding_box:
                                        cit.bounding_box ?? matchedNode?.bounding_box ?? null,
                                      confidence_score: item.gate_telemetry.citation_match,
                                      document_filename:
                                        cit.document_filename || citDoc?.filename || "",
                                    });
                                  }}
                                  className="inline-flex items-center gap-1 rounded hover:opacity-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                                >
                                  <EvidenceLocatorBadge
                                    locator={resolvedLocator}
                                    document={citDoc}
                                    fallbackPage={cit.page_number}
                                    fallbackBbox={cit.bounding_box ?? matchedNode?.bounding_box}
                                    regionMatchScore={cit.region_match_score}
                                    context={`bento-critical:${item.id}:${citIdx}`}
                                  />
                                </button>
                              );
                            })}
                          </div>
                        )}

                        <p className="text-[var(--text-secondary)] font-serif text-xs leading-snug">
                          {item.fluent_output}
                        </p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-1">
                          <span>
                            {item.category}
                            {scopedMetrics.total > 0 ? "" : ""}
                          </span>
                          <span className="text-[var(--accent-brand-ink)] font-medium">
                            Inspect source &rarr;
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Card 3: Live Human & Legal Action Queue */}
          {showQueueCard && (
            <div className="md:col-span-6 rounded-3xl bg-[var(--status-warning-row)] border border-[var(--status-warning-border)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--status-warning-border)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--status-warning-ink)]">
                      Human &amp; Legal Action Queue
                    </h3>
                    <span className="text-[10px] text-[var(--status-warning-ink)] opacity-90 font-mono">
                      OCR Verification, Missing Proof &amp; Counsel Flags
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    to="/triage"
                    data-testid="bento-open-triage-link"
                    className="text-[11px] font-semibold text-[var(--accent-brand-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                  >
                    Triage Queue &rarr;
                  </Link>
                  <Link
                    to={`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}${
                      selectedFileFilterId ? `&file=${encodeURIComponent(selectedFileFilterId)}` : ""
                    }`}
                    className="text-[11px] font-semibold text-[var(--text-secondary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                  >
                    Copilot &rarr;
                  </Link>
                  <span className="px-2 py-0.5 rounded-full bg-[var(--status-warning-solid)] text-white text-[10px] font-bold font-mono tabular-nums">
                    {pendingQueueItems.length} Open
                  </span>
                </div>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {pendingQueueItems.length === 0 ? (
                  <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-center text-xs text-[var(--text-secondary)]">
                    All items verified for the current corpus selection.
                  </div>
                ) : (
                  pendingQueueItems.map((item) => {
                    const isLegal = item.verification_status === "ESCALATED_LEGAL";
                    const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);
                    const acceptState = getAcceptActionState(item);
                    return (
                      <div
                        key={`queue-${item.id}`}
                        className="p-3.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-xs space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-[var(--text-primary)]">
                            {item.prompt_or_question}
                          </span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] font-bold">
                              {item.priority_tier}
                            </span>
                            <span
                              className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold shrink-0 border ${
                                isLegal
                                  ? "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
                                  : "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]"
                              }`}
                            >
                              {item.verification_status}
                            </span>
                          </div>
                        </div>
                        <p className="text-[var(--text-secondary)] font-serif italic text-xs leading-relaxed">
                          {item.fluent_output}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {isLegal ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--status-warning-ink)]">
                                <Scale size={12} />
                                {item.escalation_assignee || "Legal Counsel"} ({item.priority_tier})
                              </span>
                              {canUndo && (
                                <button
                                  type="button"
                                  onClick={() => void undoWorkItem(item.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[var(--status-warning-soft)] hover:opacity-90 border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] font-semibold text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                                >
                                  <RotateCcw size={11} />
                                  <span>Undo</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              {acceptState.visible && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    void resolveWorkItem(
                                      item.id,
                                      "approve",
                                      acceptState.kind === "rescue"
                                        ? item.vision_rescue_text || item.fluent_output
                                        : item.machine_extracted_text || item.fluent_output
                                    )
                                  }
                                  className="px-2.5 py-1 rounded-md bg-[var(--status-verified-solid)] hover:opacity-90 text-white font-medium text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                                >
                                  {acceptState.label}
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  void resolveWorkItem(item.id, {
                                    action: "counsel",
                                    note: "Flagged from Bento Canvas queue",
                                    assignee: "Legal Counsel",
                                  })
                                }
                                className="px-2.5 py-1 rounded-md bg-[var(--bg-sunken)] hover:border-[var(--border-strong)] border border-[var(--border-strong)] text-[var(--text-primary)] font-medium text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                              >
                                Flag for Legal
                              </button>
                              <Link
                                to={`/triage?item=${encodeURIComponent(item.id)}`}
                                className="ml-auto text-[11px] font-semibold text-[var(--accent-brand-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                              >
                                Open in Triage Queue &rarr;
                              </Link>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Card 4: Verified Evidence Clauses */}
          {showVerifiedCard && (
            <div className="md:col-span-6 rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] flex items-center justify-center">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-[var(--text-primary)]">
                      Verified Evidence Clauses
                    </h3>
                    <span className="text-[10px] text-[var(--text-muted)] font-mono">
                      &ge;97% Mathematical Match
                    </span>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-[var(--status-verified-ink)] tabular-nums">
                  {verifiedItems.length} Verified
                </span>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {verifiedItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[var(--text-muted)]">
                    No verified clauses match current filter.
                  </div>
                ) : (
                  verifiedItems.slice(0, 6).map((item) => {
                    const cit = item.verified_citations[0];
                    const citDoc = resolveCitationDocument(documents, {
                      locator: cit?.locator,
                      documentFilename: cit?.document_filename,
                      fallbackDocumentId: item.document_id,
                    });
                    const matchedNode = citDoc
                      ? nodesByDocument[citDoc.id]?.find((n) => n.id === cit?.ast_node_id)
                      : undefined;
                    const resolvedLocator = cit?.locator ?? deriveNodeLocator(matchedNode, citDoc);

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => inspectWorkItemCitation(item)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            inspectWorkItemCitation(item);
                          }
                        }}
                        className="p-3 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-xs space-y-1.5 cursor-pointer hover:bg-[var(--status-verified-row)] hover:border-[var(--status-verified-border)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        <div className="flex items-center justify-between gap-2 font-medium">
                          <span className="text-[var(--text-primary)] font-semibold truncate">
                            {item.prompt_or_question}
                          </span>
                          <span
                            className={`font-mono text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 tabular-nums ${
                              getMatchBadgeTone(
                                item.gate_telemetry.citation_match,
                                item.verification_status,
                                item.weak_evidence
                              ).badgeClass
                            }`}
                          >
                            {item.gate_telemetry.citation_match}% Match
                          </span>
                        </div>
                        <EvidenceLocatorBadge
                          locator={resolvedLocator}
                          document={citDoc}
                          fallbackPage={cit?.page_number}
                          fallbackBbox={cit?.bounding_box ?? matchedNode?.bounding_box}
                          regionMatchScore={cit?.region_match_score}
                          context={`bento-verified:${item.id}`}
                        />
                        <p className="text-[var(--text-secondary)] text-[11px] truncate">
                          {item.fluent_output}
                        </p>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Centered Non-Colliding Floating Action Dock */}
      <div
        data-testid="action-dock"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-30 w-[min(92vw,720px)] flex flex-col sm:flex-row items-center justify-center gap-2"
      >
        <form
          onSubmit={handleDockSubmit}
          className="w-full sm:w-80 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-strong)] shadow-xl p-2 flex items-center gap-2"
        >
          <input
            type="text"
            value={dockInput}
            onChange={(e) => setDockInput(e.target.value)}
            aria-label="Ask anything or search canvas"
            placeholder="Ask anything or search canvas..."
            className="flex-1 bg-transparent px-2 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          />
          <button
            type="submit"
            aria-label="Submit canvas query"
            disabled={!dockInput.trim() || asking}
            className="w-7 h-7 rounded-lg bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-40 text-[var(--accent-brand-contrast)] flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <ArrowUp size={14} />
          </button>
        </form>

        <div className="flex items-center gap-1 rounded-full bg-[var(--bg-surface)] shadow-xl border border-[var(--border-strong)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] shrink-0">
          <button
            type="button"
            onClick={() =>
              navigate(
                `/workspace?workspace=${encodeURIComponent(workspaceId || "default")}${
                  selectedFileFilterId ? `&file=${encodeURIComponent(selectedFileFilterId)}` : ""
                }`
              )
            }
            className="px-2.5 py-1 rounded-full hover:bg-[var(--bg-sunken)] transition-colors cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveInspectorTab("quotes")}
            className="px-2.5 py-1 rounded-full hover:bg-[var(--bg-sunken)] transition-colors cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <Eye size={13} />
            <span>Inspect Quotes</span>
          </button>
          <button
            type="button"
            disabled={!canExport}
            title={
              canExport
                ? "Open Results & Export Report"
                : "Export unlocks after the review run completes"
            }
            onClick={() => navigate("/results?export=1")}
            className={`px-2.5 py-1 rounded-full transition-colors flex items-center gap-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
              canExport
                ? "text-[var(--accent-brand-ink)] hover:bg-[var(--accent-brand-soft)] cursor-pointer"
                : "text-[var(--text-muted)] opacity-60 cursor-not-allowed"
            }`}
          >
            <Download size={13} />
            <span>+ Export</span>
          </button>
        </div>
      </div>
    </div>
  );
}
