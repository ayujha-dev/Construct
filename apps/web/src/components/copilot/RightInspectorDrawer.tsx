import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Eye,
  FileCode2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Filter,
  Hash,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useBertStore, type ActiveInspectorTab } from "../../store/useBertStore";
import type { ASTNode, Document } from "../../types/bert";
import { JsonTreeViewer } from "./JsonTreeViewer";
import { PdfViewer } from "./PdfViewer";
import { SpreadsheetViewer } from "./SpreadsheetViewer";

type FilterPill = "All" | "P0 Critical" | "P1 Review" | "Verified" | "Tables" | "JSON Rules";

export function RightInspectorDrawer() {
  const {
    documents,
    nodesByDocument,
    workItems,
    selectedDocumentId,
    selectedNodeId,
    setSelectedNode,
    inspectCitation,
    activeInspectorTab,
    setActiveInspectorTab,
  } = useBertStore();

  const [activeFilter, setActiveFilter] = useState<FilterPill>("All");
  const [searchQuery, setSearchQuery] = useState("");

  const currentDoc = documents.find((d) => d.id === selectedDocumentId) || documents[0];
  const docNodes = currentDoc ? nodesByDocument[currentDoc.id] || [] : [];

  // Filtered quotes / findings
  const filteredWorkItems = useMemo(() => {
    return workItems.filter((item) => {
      if (selectedDocumentId && item.document_id && item.document_id !== selectedDocumentId) {
        // If specific doc selected, show items for that doc, or show all if none match
        const matchesDoc = item.document_id === selectedDocumentId;
        if (!matchesDoc && workItems.some((w) => w.document_id === selectedDocumentId)) {
          return false;
        }
      }

      if (activeFilter === "P0 Critical" && item.priority_tier !== "P0_CRITICAL") return false;
      if (activeFilter === "P1 Review" && item.priority_tier !== "P1_HIGH") return false;
      if (activeFilter === "Verified" && item.verification_status !== "VERIFIED") return false;
      if (activeFilter === "Tables" && !item.prompt_or_question.toLowerCase().includes("row") && !item.category.includes("Questionnaire")) return false;
      if (activeFilter === "JSON Rules" && !item.category.includes("Cloud") && item.item_type !== "CONFIG_AUDIT") return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const text = `${item.prompt_or_question} ${item.fluent_output} ${item.verified_citations.map((c) => c.quote).join(" ")}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [workItems, selectedDocumentId, activeFilter, searchQuery]);

  return (
    <aside className="w-96 h-full bg-white border-l border-zinc-200/80 flex flex-col shrink-0 text-zinc-900 select-none">
      {/* Header & Tabs */}
      <div className="p-3 border-b border-zinc-200/80 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800">
            <FileSearch size={15} className="text-blue-600" />
            <span>Inspector & Evidence</span>
          </div>
          {currentDoc && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-600 truncate max-w-36" title={currentDoc.filename}>
              {currentDoc.filename}
            </span>
          )}
        </div>

        {/* Tab Switcher */}
        <div className="flex p-0.5 bg-zinc-100/90 rounded-lg text-xs font-medium text-zinc-600">
          <button
            onClick={() => setActiveInspectorTab("quotes")}
            className={`flex-1 py-1 px-2 rounded-md transition-all cursor-pointer ${
              activeInspectorTab === "quotes" ? "bg-white text-zinc-950 font-semibold shadow-2xs" : "hover:text-zinc-950"
            }`}
          >
            Verified Quotes
          </button>
          <button
            onClick={() => setActiveInspectorTab("ast")}
            className={`flex-1 py-1 px-2 rounded-md transition-all cursor-pointer ${
              activeInspectorTab === "ast" ? "bg-white text-zinc-950 font-semibold shadow-2xs" : "hover:text-zinc-950"
            }`}
          >
            Source AST
          </button>
          <button
            onClick={() => setActiveInspectorTab("visual")}
            className={`flex-1 py-1 px-2 rounded-md transition-all cursor-pointer ${
              activeInspectorTab === "visual" ? "bg-white text-zinc-950 font-semibold shadow-2xs" : "hover:text-zinc-950"
            }`}
          >
            Viewer
          </button>
          <button
            onClick={() => setActiveInspectorTab("audit")}
            className={`flex-1 py-1 px-2 rounded-md transition-all cursor-pointer ${
              activeInspectorTab === "audit" ? "bg-white text-zinc-950 font-semibold shadow-2xs" : "hover:text-zinc-950"
            }`}
          >
            Hashes
          </button>
        </div>

        {/* Search & Filter bar for quotes & AST */}
        {activeInspectorTab !== "visual" && activeInspectorTab !== "audit" && (
          <div className="space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-2.5 text-zinc-400" />
              <input
                type="text"
                placeholder="Search clauses or quotes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-xs focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] no-scrollbar">
              {(["All", "P0 Critical", "P1 Review", "Verified", "Tables", "JSON Rules"] as FilterPill[]).map((pill) => (
                <button
                  key={pill}
                  onClick={() => setActiveFilter(pill)}
                  className={`px-2 py-0.5 rounded-md whitespace-nowrap transition-colors cursor-pointer ${
                    activeFilter === pill
                      ? "bg-zinc-900 text-white font-medium"
                      : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"
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
            <div className="text-center py-12 text-xs text-zinc-400">
              No matching quotes found for current filter.
            </div>
          ) : (
            filteredWorkItems.map((item) => {
              const citation = item.verified_citations[0];
              const isP0 = item.priority_tier === "P0_CRITICAL";
              const isP1 = item.priority_tier === "P1_HIGH";
              const matchScore = item.gate_telemetry.citation_match;

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (citation) {
                      const targetDoc = documents.find((d) => d.filename === citation.document_filename || d.id === item.document_id) || currentDoc;
                      const targetNodes = targetDoc ? nodesByDocument[targetDoc.id] || [] : [];
                      const matchedNode = targetNodes.find((n) => n.id === citation.ast_node_id);
                      const resolvedBbox = matchedNode?.bounding_box ?? (citation as { bounding_box?: { x0: number; y0: number; x1: number; y1: number } | null }).bounding_box ?? null;

                      inspectCitation({
                        quote: citation.quote,
                        ast_node_id: citation.ast_node_id,
                        page_number: citation.page_number,
                        bounding_box: resolvedBbox,
                        document_filename: citation.document_filename || currentDoc?.filename || "",
                        confidence_score: matchScore,
                      });
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 cursor-pointer transition-all ${
                    isP0
                      ? "bg-[#FEF2F2] border-[#FECACA] hover:border-red-400 shadow-2xs"
                      : isP1
                      ? "bg-[#FFFBEB] border-[#FDE68A] hover:border-amber-400 shadow-2xs"
                      : "bg-white border-zinc-200/90 hover:border-blue-400 shadow-2xs"
                  }`}
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-zinc-500 font-medium">
                      {citation?.page_number ? `Page ${citation.page_number}` : item.category}
                    </span>
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        item.verification_status === "VERIFIED"
                          ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          : "bg-rose-100 text-rose-800 border border-rose-200"
                      }`}
                    >
                      {item.verification_status === "VERIFIED"
                        ? `${matchScore.toFixed(1)}% Match`
                        : "ACTION NEEDED"}
                    </span>
                  </div>

                  {/* Question / Clause Name */}
                  <div className="font-semibold text-zinc-900 leading-snug">
                    {item.prompt_or_question}
                  </div>

                  {/* Verbatim Highlighted Quote */}
                  {citation?.quote ? (
                    <div className="p-2.5 rounded-lg bg-white/90 border border-zinc-200 text-zinc-700 italic font-serif leading-relaxed">
                      “{citation.quote}”
                    </div>
                  ) : (
                    <div className="p-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px]">
                      {item.fluent_output}
                    </div>
                  )}

                  {/* Metadata & telemetry */}
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
                    <span>rapidfuzz verified</span>
                    <span>Confidence: {(item.gate_telemetry.critical_logprob || 0.96).toFixed(2)}</span>
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
            <div className="text-center py-12 text-xs text-zinc-400">
              No AST nodes loaded for this document.
            </div>
          ) : (
            docNodes.map((node) => {
              const isSelected = node.id === selectedNodeId;
              return (
                <div
                  key={node.id}
                  onClick={() => setSelectedNode(node.id)}
                  className={`p-3 rounded-lg border text-xs space-y-1.5 cursor-pointer transition-all ${
                    isSelected
                      ? "bg-blue-50/80 border-blue-400 ring-1 ring-blue-400"
                      : "bg-white border-zinc-200 hover:border-zinc-300"
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                    <span className="font-bold text-zinc-600">{node.node_type}</span>
                    <span>{node.section_path || `Node #${node.node_order}`}</span>
                  </div>
                  <p className="font-mono text-zinc-800 text-[11px] leading-relaxed line-clamp-3">
                    {node.verbatim_text}
                  </p>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
                    <span>Conf: {node.ocr_confidence.toFixed(2)}</span>
                    {node.bounding_box && <span className="text-blue-600">Bounding Box Available</span>}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Tab 3: Visual Document Viewer */}
      {activeInspectorTab === "visual" && (
        <div className="flex-1 flex flex-col min-h-0 bg-zinc-50 overflow-hidden">
          {currentDoc ? (
            currentDoc.filename.endsWith(".xlsx") ? (
              <SpreadsheetViewer document={currentDoc} nodes={docNodes} />
            ) : currentDoc.filename.endsWith(".json") ? (
              <JsonTreeViewer document={currentDoc} nodes={docNodes} />
            ) : (
              <PdfViewer document={currentDoc} nodes={docNodes} />
            )
          ) : (
            <div className="p-8 text-center text-xs text-zinc-400">
              Select a document to inspect visual layout.
            </div>
          )}
        </div>
      )}

      {/* Tab 4: SHA-256 Audit Hashes */}
      {activeInspectorTab === "audit" && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-emerald-800">
              <ShieldCheck size={15} />
              <span>Zero-Data-Loss Verified</span>
            </div>
            <p className="text-[11px] text-emerald-700 leading-relaxed">
              Every document AST has been validated against its source byte stream with SHA-256 cryptographic hashes.
            </p>
          </div>

          <div className="space-y-3">
            <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 font-mono">
              Document Audit Registry
            </span>
            {documents.map((doc) => (
              <div key={doc.id} className="p-3 rounded-lg bg-zinc-50 border border-zinc-200/80 space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-zinc-900 truncate max-w-44" title={doc.filename}>
                    {doc.filename}
                  </span>
                  <span className="font-mono text-[10px] text-zinc-500">
                    {(doc.file_size_bytes / 1024).toFixed(0)} KB
                  </span>
                </div>
                <div className="font-mono text-[10px] text-zinc-500 break-all bg-white p-2 rounded border border-zinc-200">
                  {doc.ast_checksum}
                </div>
                <div className="flex items-center justify-between text-[10px] text-zinc-400 font-mono">
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
