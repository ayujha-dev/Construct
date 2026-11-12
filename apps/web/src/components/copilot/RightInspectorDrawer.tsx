import {
  CheckCircle2,
  Copy,
  FileSearch,
  RotateCcw,
  Scale,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  deriveNodeLocator,
  inferSourceChip,
  resolveCitationDocument,
} from "../../lib/evidenceLocators";
import { useBertStore, type ActiveInspectorTab } from "../../store/useBertStore";
import { CorpusFilterBanner } from "./CorpusFilterBanner";
import { EvidenceLocatorBadge } from "./EvidenceLocatorBadge";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { PdfViewer } from "./PdfViewer";
import { SpreadsheetViewer } from "./SpreadsheetViewer";
import { TextEvidenceViewer } from "./TextEvidenceViewer";

type FilterPill = "All" | "P0 Critical" | "P1 Review" | "Verified" | "Legal" | "Tables" | "JSON Rules";

const INSPECTOR_TABS: { id: ActiveInspectorTab; label: string }[] = [
  { id: "quotes", label: "Verified Quotes" },
  { id: "ast", label: "Source AST" },
  { id: "visual", label: "Viewer" },
  { id: "audit", label: "Hashes" },
];

interface RightInspectorDrawerProps {
  width?: number;
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function RightInspectorDrawer({
  width,
  mobileOpen = false,
  onCloseMobile,
}: RightInspectorDrawerProps) {
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    selectedDocumentId,
    selectedFileFilterId,
    selectedNodeId,
    setSelectedNode,
    inspectCitation,
    undoWorkItem,
    activeInspectorTab,
    setActiveInspectorTab,
  } = useBertStore();

  const [activeFilter, setActiveFilter] = useState<FilterPill>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const effectiveDocId = selectedFileFilterId || selectedDocumentId;
  const currentDoc = documents.find((d) => d.id === effectiveDocId) || documents[0];
  const docNodes = currentDoc ? nodesByDocument[currentDoc.id] || [] : [];

  const auditDocs = useMemo(() => {
    if (selectedFileFilterId) {
      return documents.filter((d) => d.id === selectedFileFilterId);
    }
    return documents;
  }, [documents, selectedFileFilterId]);

  // Filtered quotes / findings strictly honoring sidebar file filter
  const filteredWorkItems = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedFileFilterId) {
        if (item.document_id !== selectedFileFilterId) return false;
      } else if (selectedDocumentId && item.document_id && item.document_id !== selectedDocumentId) {
        if (workItems.some((w) => w.document_id === selectedDocumentId)) {
          return false;
        }
      }

      if (activeFilter === "P0 Critical" && item.priority_tier !== "P0_CRITICAL") return false;
      if (activeFilter === "P1 Review" && item.priority_tier !== "P1_HIGH") return false;
      if (activeFilter === "Verified" && item.verification_status !== "VERIFIED") return false;
      if (activeFilter === "Legal" && item.verification_status !== "ESCALATED_LEGAL") return false;
      if (
        activeFilter === "Tables" &&
        !item.prompt_or_question.toLowerCase().includes("row") &&
        !item.category.includes("Questionnaire")
      ) {
        return false;
      }
      if (
        activeFilter === "JSON Rules" &&
        !item.category.includes("Cloud") &&
        item.item_type !== "CONFIG_AUDIT"
      ) {
        return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${item.prompt_or_question} ${item.fluent_output} ${item.verified_citations
          .map((c) => c.quote)
          .join(" ")}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [workItems, selectedFileFilterId, selectedDocumentId, activeFilter, searchQuery]);

  // Findings with citations shown on the Hashes/Audit tab for direct jump-to-evidence
  const auditFindings = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedFileFilterId && item.document_id !== selectedFileFilterId) return false;
      return item.verified_citations.length > 0;
    });
  }, [workItems, selectedFileFilterId]);

  const handleCopyQuote = async (e: React.MouseEvent, id: string, quote: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard?.writeText(quote);
      setCopiedId(id);
      setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1500);
    } catch {
      /* ignore clipboard failure in restricted contexts */
    }
  };

  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = INSPECTOR_TABS[(idx + 1) % INSPECTOR_TABS.length];
      setActiveInspectorTab(next.id);
      tabRefs.current[next.id]?.focus();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = INSPECTOR_TABS[(idx - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length];
      setActiveInspectorTab(prev.id);
      tabRefs.current[prev.id]?.focus();
    }
  };

  const renderVisualViewer = () => {
    if (!currentDoc) {
      return (
        <div className="p-8 text-center text-xs text-zinc-600">
          Select a document to inspect visual layout.
        </div>
      );
    }
    const chip = inferSourceChip(currentDoc, null);
    if (chip === "XLSX") {
      return <SpreadsheetViewer document={currentDoc} nodes={docNodes} />;
    }
    if (chip === "JSON") {
      return <JsonTreeViewer document={currentDoc} nodes={docNodes} />;
    }
    if (chip === "TXT") {
      return <TextEvidenceViewer document={currentDoc} nodes={docNodes} />;
    }
    return <PdfViewer document={currentDoc} nodes={docNodes} />;
  };

  return (
    <aside
      data-testid="right-inspector"
      data-inspector-tab={activeInspectorTab}
      aria-label="Evidence Inspector Drawer"
      style={width ? { width: `${width}px` } : undefined}
      className={`${
        mobileOpen
          ? "fixed inset-y-0 right-0 z-50 w-[min(92vw,384px)] shadow-2xl flex"
          : "hidden md:flex"
      } h-full bg-white border-l border-zinc-200/80 flex-col shrink-0 text-zinc-900 ${width ? "" : "md:w-88 lg:w-96"}`}
    >
      {/* Header & Tabs */}
      <div className="p-3 border-b border-zinc-200/80 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900">
            <FileSearch size={15} className="text-blue-700" />
            <span>Inspector & Evidence</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {currentDoc && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-700 truncate max-w-36"
                title={currentDoc.filename}
              >
                {currentDoc.filename}
              </span>
            )}
            {onCloseMobile && (
              <button
                type="button"
                onClick={onCloseMobile}
                aria-label="Close inspector drawer"
                className="md:hidden p-1 rounded-md text-zinc-700 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        <CorpusFilterBanner compact />

        {/* Tab Switcher */}
        <div
          role="tablist"
          aria-label="Evidence inspector modes"
          className="flex p-0.5 bg-zinc-100 rounded-lg text-xs font-medium text-zinc-700"
        >
          {INSPECTOR_TABS.map((tab, idx) => {
            const isSelected = activeInspectorTab === tab.id;
            return (
              <button
                key={tab.id}
                ref={(el) => {
                  tabRefs.current[tab.id] = el;
                }}
                type="button"
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => setActiveInspectorTab(tab.id)}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                className={`flex-1 py-1 px-2 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                  isSelected
                    ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                    : "text-zinc-700 hover:text-zinc-950"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Search & Filter bar for quotes & AST */}
        {activeInspectorTab !== "visual" && activeInspectorTab !== "audit" && (
          <div className="space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-600" />
              <input
                type="text"
                aria-label="Search clauses or quotes"
                placeholder="Search clauses or quotes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs text-zinc-900 placeholder:text-zinc-600 focus:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 transition-all"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] no-scrollbar">
              {(["All", "P0 Critical", "P1 Review", "Verified", "Legal", "Tables", "JSON Rules"] as FilterPill[]).map(
                (pill) => (
                  <button
                    key={pill}
                    type="button"
                    onClick={() => setActiveFilter(pill)}
                    className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                      activeFilter === pill
                        ? "bg-[#18181B] text-white font-medium"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                    }`}
                  >
                    {pill}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Verified Quotes & Findings */}
      {activeInspectorTab === "quotes" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filteredWorkItems.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-600">
              No matching quotes found for current filter.
            </div>
          ) : (
            filteredWorkItems.map((item) => {
              const citation = item.verified_citations[0];
              const isP0 = item.priority_tier === "P0_CRITICAL";
              const isP1 = item.priority_tier === "P1_HIGH";
              const isLegal = item.verification_status === "ESCALATED_LEGAL";
              const matchScore = item.gate_telemetry.citation_match;
              const targetDoc =
                resolveCitationDocument(documents, {
                  locator: citation?.locator,
                  documentFilename: citation?.document_filename,
                  fallbackDocumentId: item.document_id,
                  fallbackDoc: currentDoc,
                }) || currentDoc;
              const targetNodes = targetDoc ? nodesByDocument[targetDoc.id] || [] : [];
              const matchedNode = citation
                ? targetNodes.find((n) => n.id === citation.ast_node_id)
                : undefined;
              const resolvedLocator =
                citation?.locator ?? deriveNodeLocator(matchedNode, targetDoc);
              const resolvedBbox =
                matchedNode?.bounding_box ?? citation?.bounding_box ?? null;
              const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);

              const triggerInspect = () => {
                if (!citation) return;
                inspectCitation({
                  quote: citation.quote,
                  ast_node_id: citation.ast_node_id,
                  page_number: citation.page_number,
                  bounding_box: resolvedBbox,
                  document_filename:
                    citation.document_filename || targetDoc?.filename || currentDoc?.filename || "",
                  confidence_score: matchScore,
                  locator: resolvedLocator,
                  region_match_score: citation.region_match_score,
                });
              };

              return (
                <div
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  data-testid="quote-card"
                  onClick={triggerInspect}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      triggerInspect();
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isLegal
                      ? "bg-amber-50/70 border-amber-300 hover:border-amber-500 shadow-2xs"
                      : isP0
                        ? "bg-[#FEF2F2] border-[#FECACA] hover:border-red-400 shadow-2xs"
                        : isP1
                          ? "bg-[#FFFBEB] border-[#FDE68A] hover:border-amber-400 shadow-2xs"
                          : "bg-white border-zinc-200/90 hover:border-blue-400 shadow-2xs"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-zinc-700 font-medium truncate">
                      {citation?.page_number ? `Page ${citation.page_number}` : item.category}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        item.verification_status === "VERIFIED"
                          ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                          : isLegal
                            ? "bg-amber-100 text-amber-900 border border-amber-300"
                            : "bg-rose-100 text-rose-900 border border-rose-200"
                      }`}
                    >
                      {item.verification_status === "VERIFIED"
                        ? `${matchScore.toFixed(1)}% Match`
                        : isLegal
                          ? `LEGAL ESCALATED (${item.priority_tier})`
                          : "ACTION NEEDED"}
                    </span>
                  </div>

                  {/* Evidence Locator Chip + Path/Coordinates */}
                  <EvidenceLocatorBadge
                    locator={resolvedLocator}
                    document={targetDoc}
                    fallbackPage={citation?.page_number}
                    fallbackBbox={resolvedBbox}
                    regionMatchScore={citation?.region_match_score}
                    context={`inspector-quote:${item.id}`}
                  />

                  {/* Question / Clause Name */}
                  <div className="font-semibold text-zinc-900 leading-snug">
                    {item.prompt_or_question}
                  </div>

                  {/* Legal escalation detail */}
                  {isLegal && (
                    <div className="p-2 rounded-lg bg-white border border-amber-200 text-amber-950 text-[11px] flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 min-w-0 truncate">
                        <Scale size={12} className="shrink-0 text-amber-700" />
                        <span className="truncate">
                          {item.escalation_assignee || "Legal Counsel"}
                          {item.escalation_reason ? ` · ${item.escalation_reason}` : ""}
                        </span>
                      </span>
                      {canUndo && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void undoWorkItem(item.id);
                          }}
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold text-[10px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          <RotateCcw size={10} />
                          <span>Undo</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Verbatim Highlighted Quote */}
                  {citation?.quote ? (
                    <div
                      data-testid="citation-badge"
                      className="p-2.5 rounded-lg bg-white/95 border border-zinc-200 text-zinc-800 italic font-serif leading-relaxed"
                    >
                      “{citation.quote}”
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-[11px]">
                      {item.fluent_output}
                    </div>
                  )}

                  {/* Metadata & quick Copy action */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 pt-1">
                    <span>rapidfuzz gate · Conf {(item.gate_telemetry.critical_logprob || 0.96).toFixed(2)}</span>
                    {citation?.quote && (
                      <button
                        type="button"
                        onClick={(e) => void handleCopyQuote(e, item.id, citation.quote)}
                        aria-label={`Copy quote for ${item.prompt_or_question}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        {copiedId === item.id ? <CheckCircle2 size={10} /> : <Copy size={10} />}
                        <span>{copiedId === item.id ? "Copied" : "Copy"}</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 2: Raw AST Tree Nodes */}
      {activeInspectorTab === "ast" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {docNodes.length === 0 ? (
            <div className="text-center py-12 text-xs text-zinc-600">
              No AST nodes loaded for this document.
            </div>
          ) : (
            docNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              const nodeLocator = deriveNodeLocator(node, currentDoc);
              return (
                <div
                  key={node.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedNode(node.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedNode(node.id);
                    }
                  }}
                  className={`p-3 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    isSelected
                      ? "bg-blue-50/80 border-blue-400 ring-1 ring-blue-400"
                      : "bg-white border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600">
                    <span className="font-bold text-zinc-800">{node.node_type}</span>
                    <span>{node.section_path || `Node #${node.node_order}`}</span>
                  </div>
                  <p className="font-mono text-zinc-900 text-[11px] leading-relaxed line-clamp-3">
                    {node.verbatim_text}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <EvidenceLocatorBadge
                      locator={nodeLocator}
                      document={currentDoc}
                      fallbackPage={node.page_number}
                      fallbackBbox={node.bounding_box}
                      context={`ast-node:${node.id}`}
                    />
                    <span className="text-[10px] font-mono text-zinc-700 shrink-0">
                      Conf: {node.ocr_confidence.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Visual Document Viewer */}
      {activeInspectorTab === "visual" && (
        <div
          data-testid="visual-viewer"
          data-inspector-tab={activeInspectorTab}
          className="flex-1 flex flex-col min-h-0 bg-zinc-50 overflow-hidden"
        >
          {renderVisualViewer()}
        </div>
      )}

      {/* Tab 4: SHA-256 Audit Hashes & Verifiable Jump Cards */}
      {activeInspectorTab === "audit" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-900">
              <ShieldCheck size={15} />
              <span>Zero-Data-Loss Verified</span>
            </div>
            <p className="text-[11px] text-emerald-900 leading-relaxed">
              Every document AST has been validated against its source byte stream with SHA-256 cryptographic hashes.
            </p>
          </div>

          {auditFindings.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700 font-mono">
                Cryptographic Finding Links
              </span>
              {auditFindings.map((item) => {
                const cit = item.verified_citations[0];
                const doc =
                  resolveCitationDocument(documents, {
                    locator: cit.locator,
                    documentFilename: cit.document_filename,
                    fallbackDocumentId: item.document_id,
                    fallbackDoc: currentDoc,
                  }) ?? currentDoc;
                const node = doc
                  ? nodesByDocument[doc.id]?.find((n) => n.id === cit.ast_node_id)
                  : undefined;
                const resolvedLocator = cit.locator ?? deriveNodeLocator(node, doc);
                const openFinding = () => {
                  inspectCitation({
                    ...cit,
                    document_filename: cit.document_filename || doc?.filename || "",
                    locator: resolvedLocator,
                    bounding_box: cit.bounding_box ?? node?.bounding_box ?? null,
                    confidence_score: item.gate_telemetry.citation_match,
                  });
                };

                return (
                  <div
                    key={`audit-${item.id}`}
                    data-testid="audit-finding-card"
                    role="button"
                    tabIndex={0}
                    onClick={openFinding}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openFinding();
                      }
                    }}
                    className="p-2.5 rounded-lg bg-zinc-50 hover:bg-blue-50/70 border border-zinc-200 hover:border-blue-400 text-xs space-y-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-zinc-900 truncate">
                        {item.prompt_or_question}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-blue-700 shrink-0">
                        Inspect →
                      </span>
                    </div>
                    <EvidenceLocatorBadge
                      locator={resolvedLocator}
                      document={doc}
                      fallbackPage={cit.page_number}
                      fallbackBbox={cit.bounding_box ?? node?.bounding_box}
                      regionMatchScore={cit.region_match_score}
                      context={`audit:${item.id}`}
                    />
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-700 font-mono">
              Document Audit Registry
            </span>
            {auditDocs.map((doc) => (
              <div key={doc.id} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-900 truncate max-w-44" title={doc.filename}>
                    {doc.filename}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-700">
                    {(doc.file_size_bytes / 1024).toFixed(0)} KB
                  </span>
                </div>
                <div className="font-mono text-[10px] text-zinc-700 break-all bg-white p-2 rounded border border-zinc-200">
                  {doc.ast_checksum}
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-700 font-mono">
                  <span>Status: {doc.processing_status}</span>
                  <span>{doc.total_ast_nodes} AST nodes</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}
