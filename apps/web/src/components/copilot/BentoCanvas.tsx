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
import { useNavigate } from "react-router-dom";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../../lib/evidenceLocators";
import { useBertStore } from "../../store/useBertStore";
import { CorpusFilterBanner } from "./CorpusFilterBanner";
import { EvidenceLocatorBadge } from "./EvidenceLocatorBadge";

export function BentoCanvas() {
  const navigate = useNavigate();
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
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
        ? workItems.filter((i) => i.document_id === selectedFileFilterId)
        : workItems,
    [selectedFileFilterId, workItems]
  );

  const criticalItems = useMemo(
    () =>
      scopedWorkItems.filter(
        (i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED"
      ),
    [scopedWorkItems]
  );

  const pendingQueueItems = useMemo(
    () => scopedWorkItems.filter((i) => i.verification_status !== "VERIFIED"),
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
    <div className="relative flex-1 h-full overflow-y-auto p-4 sm:p-6 lg:p-8 dot-grid-pattern bg-[#FAFAFA] text-zinc-900">
      <div className="max-w-5xl mx-auto space-y-6 pb-28">
        <CorpusFilterBanner />

        {/* Top Canvas Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200">
                BENTO CANVAS MODE
              </span>
              <span className="text-xs text-zinc-600">·</span>
              <span className="text-xs font-mono text-zinc-700">
                {visibleDocuments.length} Active {visibleDocuments.length === 1 ? "Document" : "Documents"}
              </span>
            </div>
            <h2 className="text-lg font-semibold text-zinc-950 mt-1 font-ui">
              Visual Intelligence Architecture
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedBentoTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                selectedBentoTab === "all"
                  ? "bg-[#18181B] text-white"
                  : "bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              All Intelligence ({scopedWorkItems.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedBentoTab("critical")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                selectedBentoTab === "critical"
                  ? "bg-[#B91C1C] text-white"
                  : "bg-white border border-zinc-200 text-rose-800 hover:bg-rose-50"
              }`}
            >
              Critical Risks ({criticalItems.length})
            </button>
            <button
              type="button"
              onClick={() => setSelectedBentoTab("verified")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                selectedBentoTab === "verified"
                  ? "bg-[#047857] text-white"
                  : "bg-white border border-zinc-200 text-emerald-800 hover:bg-emerald-50"
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
            <div className="md:col-span-5 rounded-3xl bg-white border border-zinc-200/90 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
                    <FileText size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-zinc-900">Corpus Architecture</h3>
                    <span className="text-[10px] text-zinc-600 font-mono">Quartermaster Classification</span>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-blue-700">
                  {visibleDocuments.length} Staged
                </span>
              </div>

              <div className="space-y-2.5">
                {visibleDocuments.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-600">
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
                        className={`p-3 rounded-xl border text-xs space-y-1 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                          isSelected
                            ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-300"
                            : "bg-zinc-50 border-zinc-200/80 hover:bg-zinc-100/60"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 font-medium">
                          <span className="truncate text-zinc-900 font-semibold" title={doc.filename}>
                            {doc.filename}
                          </span>
                          <span className="font-mono text-[10px] text-zinc-600 shrink-0">
                            {doc.source_format}
                          </span>
                        </div>
                        <div className="text-[11px] text-zinc-600">
                          Category: <span className="text-zinc-800 font-medium">{doc.category || "General"}</span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 pt-1">
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
              } rounded-3xl bg-[#FEF2F2] border border-[#FECACA] p-5 shadow-sm space-y-4`}
            >
              <div className="flex items-center justify-between pb-3 border-b border-rose-200/80">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center">
                    <ShieldAlert size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-rose-950">Critical Risks & Contradictions</h3>
                    <span className="text-[10px] text-rose-800 font-mono">Vanguard & Arbiter Triage</span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#B91C1C] text-white text-[10px] font-bold font-mono">
                  {criticalItems.length} Flagged
                </span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {criticalItems.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white/80 text-center text-xs text-zinc-700">
                    No critical risks detected for this filter.
                  </div>
                ) : (
                  criticalItems.map((item) => {
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
                        className="p-3 rounded-xl bg-white/95 border border-rose-200 text-xs space-y-2 cursor-pointer hover:border-rose-400 shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-rose-950">{item.prompt_or_question}</span>
                          <span className="font-mono text-[10px] font-bold text-rose-800 shrink-0">
                            {item.priority_tier} · {item.priority_score}
                          </span>
                        </div>
                        <EvidenceLocatorBadge
                          locator={resolvedLocator}
                          document={citDoc}
                          fallbackPage={cit?.page_number}
                          fallbackBbox={cit?.bounding_box ?? matchedNode?.bounding_box}
                          regionMatchScore={cit?.region_match_score}
                          context={`bento-critical:${item.id}`}
                        />
                        <p className="text-zinc-800 font-serif text-[11px] leading-snug">{item.fluent_output}</p>
                        <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 pt-1">
                          <span>{item.category}</span>
                          <span className="text-blue-700 font-medium">Inspect source →</span>
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
            <div className="md:col-span-6 rounded-3xl bg-amber-50/70 border border-amber-200 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-amber-200/80">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center">
                    <AlertTriangle size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-amber-950">Human & Legal Action Queue</h3>
                    <span className="text-[10px] text-amber-900 font-mono">
                      OCR Verification, Missing Proof & Counsel Flags
                    </span>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-[#B45309] text-white text-[10px] font-bold font-mono">
                  {pendingQueueItems.length} Open
                </span>
              </div>

              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {pendingQueueItems.length === 0 ? (
                  <div className="p-4 rounded-xl bg-white border border-amber-200 text-center text-xs text-zinc-700">
                    All items verified for the current corpus selection.
                  </div>
                ) : (
                  pendingQueueItems.map((item) => {
                    const isLegal = item.verification_status === "ESCALATED_LEGAL";
                    const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);
                    return (
                      <div
                        key={`queue-${item.id}`}
                        className="p-3.5 rounded-xl bg-white border border-amber-200 text-xs space-y-2 shadow-2xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-zinc-900">{item.prompt_or_question}</span>
                          <span
                            className={`font-mono text-[10px] px-2 py-0.5 rounded font-bold shrink-0 ${
                              isLegal
                                ? "bg-amber-100 text-amber-950 border border-amber-300"
                                : "bg-rose-50 text-rose-800 border border-rose-200"
                            }`}
                          >
                            {item.verification_status}
                          </span>
                        </div>
                        <p className="text-zinc-700 font-serif italic text-xs leading-relaxed">
                          {item.fluent_output}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {isLegal ? (
                            <>
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-900">
                                <Scale size={12} />
                                {item.escalation_assignee || "Legal Counsel"} ({item.priority_tier})
                              </span>
                              {canUndo && (
                                <button
                                  type="button"
                                  onClick={() => void undoWorkItem(item.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-950 font-semibold text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                                >
                                  <RotateCcw size={11} />
                                  <span>Undo</span>
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  void resolveWorkItem(item.id, {
                                    action: "approve",
                                    correction: item.fluent_output,
                                  })
                                }
                                className="px-2.5 py-1 rounded-md bg-[#047857] hover:bg-[#065F46] text-white font-medium text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              >
                                Approve Finding
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void resolveWorkItem(item.id, {
                                    action: "counsel",
                                    note: "Flagged from Bento Canvas queue",
                                    assignee: "Legal Counsel",
                                  })
                                }
                                className="px-2.5 py-1 rounded-md bg-[#27272A] hover:bg-[#18181B] text-white font-medium text-[11px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                              >
                                Flag for Legal
                              </button>
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
            <div className="md:col-span-6 rounded-3xl bg-white border border-zinc-200/90 p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center">
                    <CheckCircle2 size={16} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-zinc-900">Verified Evidence Clauses</h3>
                    <span className="text-[10px] text-zinc-600 font-mono">≥97% Mathematical Match</span>
                  </div>
                </div>
                <span className="font-mono text-xs font-bold text-emerald-800">
                  {verifiedItems.length} Verified
                </span>
              </div>

              <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                {verifiedItems.length === 0 ? (
                  <div className="p-4 text-center text-xs text-zinc-600">
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
                        className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/80 text-xs space-y-1.5 cursor-pointer hover:bg-emerald-50/50 hover:border-emerald-300 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <div className="flex items-center justify-between gap-2 font-medium">
                          <span className="text-zinc-900 font-semibold truncate">{item.prompt_or_question}</span>
                          <span className="font-mono text-[10px] text-emerald-800 font-bold shrink-0">
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
                        <p className="text-zinc-700 text-[11px] truncate">{item.fluent_output}</p>
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
          className="w-full sm:w-80 rounded-2xl bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-xl p-2 flex items-center gap-2"
        >
          <input
            type="text"
            value={dockInput}
            onChange={(e) => setDockInput(e.target.value)}
            aria-label="Ask anything or search canvas"
            placeholder="Ask anything or search canvas..."
            className="flex-1 bg-transparent px-2 text-xs text-zinc-900 placeholder:text-zinc-500 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          />
          <button
            type="submit"
            aria-label="Submit canvas query"
            disabled={!dockInput.trim() || asking}
            className="w-7 h-7 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <ArrowUp size={14} />
          </button>
        </form>

        <div className="flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-md shadow-xl border border-zinc-200/90 px-3 py-1.5 text-xs font-medium text-zinc-800 shrink-0">
          <button
            type="button"
            onClick={() =>
              navigate(
                `/workspace?workspace=${encodeURIComponent(workspaceId || "default")}${
                  selectedFileFilterId ? `&file=${encodeURIComponent(selectedFileFilterId)}` : ""
                }`
              )
            }
            className="px-2.5 py-1 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveInspectorTab("quotes")}
            className="px-2.5 py-1 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Eye size={13} />
            <span>Inspect Quotes</span>
          </button>
          <button
            type="button"
            onClick={() => navigate("/results")}
            className="px-2.5 py-1 rounded-full text-blue-700 hover:bg-blue-50 transition-colors cursor-pointer flex items-center gap-1 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <Download size={13} />
            <span>+ Export</span>
          </button>
        </div>
      </div>
    </div>
  );
}
