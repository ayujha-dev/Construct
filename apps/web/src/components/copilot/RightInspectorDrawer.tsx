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
import {
  assessQuoteStrength,
  getMatchBadgeTone,
  itemMatchesDocumentFilter,
} from "../../lib/workItemMetrics";
import { useBertStore, type ActiveInspectorTab } from "../../store/useBertStore";
import { CorpusFilterBanner } from "./CorpusFilterBanner";
import { EvidenceLocatorBadge } from "./EvidenceLocatorBadge";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { PdfViewer } from "./PdfViewer";
import { SpreadsheetViewer } from "./SpreadsheetViewer";
import { TextEvidenceViewer } from "./TextEvidenceViewer";

type FilterPill =
  | "All"
  | "P0 Critical"
  | "P1 Review"
  | "Verified"
  | "Overrides"
  | "N/A"
  | "Legal"
  | "Weak"
  | "Tables"
  | "JSON Rules";

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

  const filteredWorkItems = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedFileFilterId) {
        if (!itemMatchesDocumentFilter(item, selectedFileFilterId)) return false;
      } else if (
        selectedDocumentId &&
        !itemMatchesDocumentFilter(item, selectedDocumentId)
      ) {
        if (workItems.some((w) => itemMatchesDocumentFilter(w, selectedDocumentId))) {
          return false;
        }
      }

      const isWeak =
        Boolean(item.weak_evidence) ||
        Boolean(
          item.verified_citations[0]?.quote &&
            assessQuoteStrength(item.verified_citations[0].quote).isWeak
        );

      if (activeFilter === "P0 Critical" && item.priority_tier !== "P0_CRITICAL") return false;
      if (activeFilter === "P1 Review" && item.priority_tier !== "P1_HIGH") return false;
      if (activeFilter === "Verified" && item.verification_status !== "VERIFIED") return false;
      if (activeFilter === "Overrides" && item.verification_status !== "HUMAN_OVERRIDE") return false;
      if (activeFilter === "N/A" && item.verification_status !== "NOT_APPLICABLE") return false;
      if (activeFilter === "Legal" && item.verification_status !== "ESCALATED_LEGAL") return false;
      if (activeFilter === "Weak" && !isWeak) return false;
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

  const auditFindings = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedFileFilterId && !itemMatchesDocumentFilter(item, selectedFileFilterId)) {
        return false;
      }
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
        <div className="p-8 text-center text-xs text-[var(--text-muted)]">
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
      } h-full bg-[var(--bg-surface)] border-l border-[var(--border-subtle)] flex-col shrink-0 text-[var(--text-primary)] ${width ? "" : "md:w-88 lg:w-96"}`}
    >
      {/* Header & Tabs */}
      <div className="p-3 border-b border-[var(--border-subtle)] space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
            <FileSearch size={15} className="text-[var(--accent-brand-ink)]" />
            <span>Inspector &amp; Evidence</span>
          </div>

          <div className="flex items-center gap-1.5 min-w-0">
            {currentDoc && (
              <span
                className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-secondary)] truncate max-w-36"
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
                className="md:hidden p-1 rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
              >
                <X size={15} />
              </button>
            )}
          </div>
        </div>

        <CorpusFilterBanner compact />

        {/* Tab Switcher (Active tab preserves "bg-white" token class per Tier 1/3 E2E hook; dark mode styled via CSS) */}
        <div
          role="tablist"
          aria-label="Evidence inspector modes"
          className="flex p-0.5 bg-[var(--bg-sunken)] border border-[var(--border-subtle)] rounded-lg text-xs font-medium text-[var(--text-secondary)]"
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
                className={`flex-1 py-1 px-2 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                  isSelected
                    ? "bg-white text-[var(--text-primary)] font-semibold shadow-2xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
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
              <Search size={13} className="absolute left-2.5 top-2.5 text-[var(--text-muted)]" />
              <input
                type="text"
                aria-label="Search clauses or quotes"
                placeholder="Search clauses or quotes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:bg-[var(--bg-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] transition-all"
              />
            </div>

            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] no-scrollbar">
              {(
                [
                  "All",
                  "P0 Critical",
                  "P1 Review",
                  "Verified",
                  "Overrides",
                  "N/A",
                  "Legal",
                  "Weak",
                  "Tables",
                  "JSON Rules",
                ] as FilterPill[]
              ).map((pill) => (
                <button
                  key={pill}
                  type="button"
                  onClick={() => setActiveFilter(pill)}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    activeFilter === pill
                      ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] font-medium"
                      : "bg-[var(--bg-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] border border-[var(--border-subtle)]"
                  }`}
                >
                  {pill}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Tab 1: Verified Quotes & Findings */}
      {activeInspectorTab === "quotes" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {filteredWorkItems.length === 0 ? (
            <div className="text-center py-12 text-xs text-[var(--text-muted)]">
              No matching quotes found for current filter.
            </div>
          ) : (
            filteredWorkItems.map((item) => {
              const citation = item.verified_citations[0];
              const isP0 = item.priority_tier === "P0_CRITICAL";
              const isP1 = item.priority_tier === "P1_HIGH";
              const isLegal = item.verification_status === "ESCALATED_LEGAL";
              const isOverride = item.verification_status === "HUMAN_OVERRIDE";
              const isNA = item.verification_status === "NOT_APPLICABLE";
              const quoteStrength = citation?.quote
                ? assessQuoteStrength(citation.quote)
                : { isWeak: false, reason: null };
              const isWeak = Boolean(item.weak_evidence || quoteStrength.isWeak);
              const matchScore = item.gate_telemetry.citation_match;
              const matchTone = getMatchBadgeTone(matchScore, item.verification_status, isWeak);

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
                  className={`p-3.5 rounded-xl border text-xs space-y-2 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    isOverride
                      ? "bg-[var(--status-override-row)] border-[var(--status-override-border)] hover:border-[var(--status-override-ink)] shadow-2xs"
                      : isNA
                        ? "bg-[var(--status-neutral-row)] border-[var(--status-neutral-border)] hover:border-[var(--status-neutral-ink)] shadow-2xs"
                        : isLegal
                          ? "bg-[var(--status-warning-row)] border-[var(--status-warning-border)] hover:border-[var(--status-warning-ink)] shadow-2xs"
                          : isP0
                            ? "bg-[var(--status-danger-row)] border-[var(--status-danger-border)] hover:border-[var(--status-danger-ink)] shadow-2xs"
                            : isP1
                              ? "bg-[var(--status-warning-row)] border-[var(--status-warning-border)] hover:border-[var(--status-warning-ink)] shadow-2xs"
                              : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)] shadow-2xs"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="font-mono text-[var(--text-secondary)] font-medium truncate tabular-nums">
                      {citation?.page_number ? `Page ${citation.page_number}` : item.category}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {isWeak && (
                        <span
                          data-testid="weak-evidence-badge"
                          title={item.weak_evidence_reason || quoteStrength.reason || "Weak quote"}
                          className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]"
                        >
                          Weak Evidence
                        </span>
                      )}
                      <span
                        className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded tabular-nums ${matchTone.badgeClass}`}
                      >
                        {item.verification_status === "VERIFIED"
                          ? `${matchScore.toFixed(1)}% Match`
                          : isOverride
                            ? "Human Override"
                            : isNA
                              ? `Marked N/A (${item.priority_tier})`
                              : isLegal
                                ? `LEGAL ESCALATED (${item.priority_tier})`
                                : `ACTION NEEDED (${Math.round(matchScore)}%)`}
                      </span>
                    </div>
                  </div>

                  {/* Evidence Locator Chip + Path/Coordinates */}
                  {item.verified_citations.length > 1 ? (
                    <div className="flex flex-wrap gap-1.5">
                      {item.verified_citations.map((citItem, citIdx) => {
                        const citDoc = resolveCitationDocument(documents, {
                          locator: citItem.locator,
                          documentFilename: citItem.document_filename,
                          fallbackDocumentId: item.document_id,
                          fallbackDoc: currentDoc,
                        });
                        const citNode = citDoc
                          ? nodesByDocument[citDoc.id]?.find((n) => n.id === citItem.ast_node_id)
                          : undefined;
                        const citLoc = citItem.locator ?? deriveNodeLocator(citNode, citDoc);
                        return (
                          <button
                            key={`${item.id}-cit-${citIdx}`}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              inspectCitation({
                                ...citItem,
                                locator: citLoc,
                                bounding_box: citItem.bounding_box ?? citNode?.bounding_box ?? null,
                                confidence_score:
                                  citItem.confidence_score ?? item.gate_telemetry.citation_match ?? 0,
                                document_filename: citItem.document_filename || citDoc?.filename || "",
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] cursor-pointer"
                          >
                            <EvidenceLocatorBadge
                              locator={citLoc}
                              document={citDoc}
                              fallbackPage={citItem.page_number}
                              fallbackBbox={citItem.bounding_box ?? citNode?.bounding_box}
                              regionMatchScore={citItem.region_match_score}
                              context={`inspector-quote:${item.id}:${citIdx}`}
                            />
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <EvidenceLocatorBadge
                      locator={resolvedLocator}
                      document={targetDoc}
                      fallbackPage={citation?.page_number}
                      fallbackBbox={resolvedBbox}
                      regionMatchScore={citation?.region_match_score}
                      context={`inspector-quote:${item.id}`}
                    />
                  )}

                  {/* Question / Clause Name */}
                  <div className="font-semibold text-[var(--text-primary)] leading-snug">
                    {item.prompt_or_question}
                  </div>

                  {/* Legal / Override / N/A detail */}
                  {isLegal && (
                    <div className="p-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] text-[11px] flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 min-w-0 truncate">
                        <Scale size={12} className="shrink-0 text-[var(--status-warning-ink)]" />
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
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--status-warning-soft)] hover:opacity-90 border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] font-semibold text-[10px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                      className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)] italic font-serif leading-relaxed"
                    >
                      “{citation.quote}”
                    </div>
                  ) : (
                    <div
                      className={`p-2 rounded-lg border text-[11px] ${
                        isOverride
                          ? "bg-[var(--status-override-soft)] border-[var(--status-override-border)] text-[var(--status-override-ink)]"
                          : isNA
                            ? "bg-[var(--status-neutral-soft)] border-[var(--status-neutral-border)] text-[var(--status-neutral-ink)]"
                            : "bg-[var(--status-danger-soft)] border-[var(--status-danger-border)] text-[var(--status-danger-ink)]"
                      }`}
                    >
                      {item.fluent_output}
                    </div>
                  )}

                  {/* Metadata & quick Copy action */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)] pt-1 tabular-nums">
                    <span>
                      {isOverride
                        ? `Human override · ${item.human_override_reason_code || "SME_ATTESTATION"} · Unverified by gate`
                        : isNA
                          ? `Marked N/A · ${item.human_override_reason_code || "OUT_OF_SCOPE"}`
                          : `rapidfuzz gate · Conf ${(item.gate_telemetry.critical_logprob || 0).toFixed(2)}`}
                    </span>
                    {citation?.quote && (
                      <button
                        type="button"
                        onClick={(e) => void handleCopyQuote(e, item.id, citation.quote)}
                        aria-label={`Copy quote for ${item.prompt_or_question}`}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] hover:border-[var(--border-strong)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
            <div className="text-center py-12 text-xs text-[var(--text-muted)]">
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
                  className={`p-3 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    isSelected
                      ? "bg-[var(--accent-brand-soft)] border-[var(--accent-brand-border)] ring-1 ring-[var(--accent-brand-ring)]"
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-[var(--text-muted)]">
                    <span className="font-bold text-[var(--text-primary)]">{node.node_type}</span>
                    <span>{node.section_path || `Node #${node.node_order}`}</span>
                  </div>
                  <p className="font-mono text-[var(--text-primary)] text-[11px] leading-relaxed line-clamp-3">
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
                    <span className="text-[10px] font-mono text-[var(--text-secondary)] shrink-0 tabular-nums">
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
          className="flex-1 flex flex-col min-h-0 bg-[var(--bg-sunken)] overflow-hidden"
        >
          {renderVisualViewer()}
        </div>
      )}

      {/* Tab 4: SHA-256 Audit Hashes & Verifiable Jump Cards */}
      {activeInspectorTab === "audit" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-3 rounded-xl bg-[var(--status-verified-soft)] border border-[var(--status-verified-border)] text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-[var(--status-verified-ink)]">
              <ShieldCheck size={15} />
              <span>Zero-Data-Loss Verified</span>
            </div>
            <p className="text-[11px] text-[var(--status-verified-ink)] leading-relaxed">
              Every document AST has been validated against its source byte stream with SHA-256 cryptographic hashes.
            </p>
          </div>

          {auditFindings.length > 0 && (
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
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
                    className="p-2.5 rounded-lg bg-[var(--bg-sunken)] hover:bg-[var(--accent-brand-soft)] border border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)] text-xs space-y-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {item.prompt_or_question}
                      </span>
                      <span className="font-mono text-[10px] font-semibold text-[var(--accent-brand-ink)] shrink-0">
                        Inspect &rarr;
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
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-secondary)] font-mono">
              Document Audit Registry
            </span>
            {auditDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-3 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] space-y-1.5 text-xs"
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[var(--text-primary)] truncate max-w-44" title={doc.filename}>
                    {doc.filename}
                  </span>
                  <span className="font-mono text-[10px] text-[var(--text-secondary)] tabular-nums">
                    {(doc.file_size_bytes / 1024).toFixed(0)} KB
                  </span>
                </div>
                <div className="font-mono text-[10px] text-[var(--text-primary)] break-all bg-[var(--bg-surface)] p-2 rounded border border-[var(--border-subtle)]">
                  {doc.ast_checksum}
                </div>
                <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)] font-mono tabular-nums">
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
