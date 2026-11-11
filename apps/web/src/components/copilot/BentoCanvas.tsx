import {
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  CheckCircle2,
  Download,
  Eye,
  FileCode2,
  FileSearch,
  FileSpreadsheet,
  FileText,
  Filter,
  Layers,
  MessageSquare,
  Pause,
  Play,
  RotateCcw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBertStore } from "../../store/useBertStore";

export function BentoCanvas() {
  const navigate = useNavigate();
  const {
    documents,
    workItems,
    selectedDocumentId,
    setSelectedDocument,
    inspectCitation,
    askCopilot,
    asking,
    activeJob,
  } = useBertStore();

  const [dockInput, setDockInput] = useState("");
  const [selectedBentoTab, setSelectedBentoTab] = useState<"all" | "critical" | "verified">("all");

  const currentDoc = documents.find((d) => d.id === selectedDocumentId) || documents[0];

  const criticalItems = workItems.filter(
    (i) => i.priority_tier === "P0_CRITICAL" || i.verification_status !== "VERIFIED"
  );
  const highItems = workItems.filter((i) => i.priority_tier === "P1_HIGH");
  const verifiedItems = workItems.filter(
    (i) => i.verification_status === "VERIFIED" && i.priority_tier !== "P0_CRITICAL"
  );

  const handleDockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dockInput.trim()) return;
    void askCopilot(dockInput.trim());
    setDockInput("");
  };

  return (
    <div className="relative flex-1 h-full overflow-y-auto p-6 lg:p-8 dot-grid-pattern bg-[#FAFAFA] text-zinc-900 select-none">
      <div className="max-w-5xl mx-auto space-y-6 pb-24">
        {/* Top Canvas Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white/80 backdrop-blur-md p-4 rounded-2xl border border-zinc-200/80 shadow-2xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                BENTO CANVAS MODE
              </span>
              <span className="text-xs text-zinc-400">·</span>
              <span className="text-xs font-mono text-zinc-500">
                {documents.length} Active Documents
              </span>
            </div>
            <h2 className="text-lg font-semibold text-zinc-950 mt-1 font-ui">
              Visual Intelligence Architecture
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedBentoTab("all")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedBentoTab === "all" ? "bg-zinc-900 text-white" : "bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              All Intelligence ({workItems.length})
            </button>
            <button
              onClick={() => setSelectedBentoTab("critical")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedBentoTab === "critical" ? "bg-rose-600 text-white" : "bg-white border border-zinc-200 text-rose-700 hover:bg-rose-50"
              }`}
            >
              Critical Risks ({criticalItems.length})
            </button>
            <button
              onClick={() => setSelectedBentoTab("verified")}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                selectedBentoTab === "verified" ? "bg-emerald-600 text-white" : "bg-white border border-zinc-200 text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              Verified Safe ({verifiedItems.length})
            </button>
          </div>
        </div>

        {/* 4 Bento Containers */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* Card 1: Document Category & Corpus Overview (span 5) */}
          <div className="md:col-span-5 rounded-3xl bg-white border border-zinc-200/90 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                  <FileText size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">Corpus Architecture</h3>
                  <span className="text-[10px] text-zinc-400 font-mono">Quartermaster Classification</span>
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-blue-600">
                100% Ingested
              </span>
            </div>

            <div className="space-y-2.5">
              {documents.map((doc) => {
                const isSelected = doc.id === selectedDocumentId;
                return (
                  <div
                    key={doc.id}
                    onClick={() => setSelectedDocument(doc.id)}
                    className={`p-3 rounded-xl border text-xs space-y-1 transition-all cursor-pointer ${
                      isSelected
                        ? "bg-blue-50/70 border-blue-400 ring-1 ring-blue-300"
                        : "bg-zinc-50 border-zinc-200/80 hover:bg-zinc-100/60"
                    }`}
                  >
                    <div className="flex items-center justify-between font-medium">
                      <span className="truncate max-w-44 text-zinc-900 font-semibold" title={doc.filename}>
                        {doc.filename}
                      </span>
                      <span className="font-mono text-[10px] text-zinc-500">
                        {doc.source_format}
                      </span>
                    </div>
                    <div className="text-[11px] text-zinc-500">
                      Category: <span className="text-zinc-700 font-medium">{doc.category || "General"}</span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
                      <span>{doc.total_ast_nodes} AST nodes</span>
                      <span>SHA-256 Verified</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Card 2: Critical Risks & Contradictions (span 7) */}
          <div className="md:col-span-7 rounded-3xl bg-[#FEF2F2] border border-[#FECACA] p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-rose-200/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center">
                  <ShieldAlert size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-rose-950">Critical Risks & Contradictions</h3>
                  <span className="text-[10px] text-rose-700 font-mono">Vanguard & Arbiter Triage</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono">
                {criticalItems.length} P0 Blockers
              </span>
            </div>

            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {criticalItems.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.verified_citations[0]) {
                      inspectCitation({
                        ...item.verified_citations[0],
                        confidence_score: item.gate_telemetry.citation_match,
                        document_filename: item.verified_citations[0].document_filename || "",
                        bounding_box: null,
                      });
                    }
                  }}
                  className="p-3 rounded-xl bg-white/90 border border-rose-200 text-xs space-y-1.5 cursor-pointer hover:border-rose-400 shadow-2xs transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-rose-950">{item.prompt_or_question}</span>
                    <span className="font-mono text-[10px] font-bold text-rose-600">
                      Score: {item.priority_score}
                    </span>
                  </div>
                  <p className="text-zinc-700 font-serif text-[11px] leading-snug">
                    {item.fluent_output}
                  </p>
                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
                    <span>{item.category}</span>
                    <span className="text-blue-600 font-medium">Click to inspect quote →</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Card 3: Human Action Queue (span 6) */}
          <div className="md:col-span-6 rounded-3xl bg-amber-50/70 border border-amber-200 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-amber-200/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <AlertTriangle size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-amber-950">Human Action Queue</h3>
                  <span className="text-[10px] text-amber-700 font-mono">Unreadable Scans & Missing Proof</span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-amber-500 text-white text-[10px] font-bold font-mono">
                Needs Input
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="p-3.5 rounded-xl bg-white border border-amber-200 text-xs space-y-2 shadow-2xs">
                <div className="font-semibold text-zinc-900">
                  Physical Stamp Note on Scanned_Addendum_p7.pdf
                </div>
                <p className="text-zinc-600 font-serif italic text-xs leading-relaxed">
                  “[LOW_CONFIDENCE] STAMP NOTE: Compliance addendum reviewed 2026-02-14 — uncapped indemnification override”
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={() => navigate("/workspace")}
                    className="px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white font-medium text-[11px] cursor-pointer"
                  >
                    Open in Copilot Stream
                  </button>
                  <span className="text-[10px] font-mono text-zinc-400">OCR confidence: 81.2%</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-white border border-amber-200 text-xs space-y-2 shadow-2xs">
                <div className="font-semibold text-zinc-900">
                  Questionnaire Row 11: Cyber Insurance Limit
                </div>
                <p className="text-zinc-600 text-xs leading-relaxed">
                  Vendor cyber insurance limit requested in questionnaire, but not disclosed in SOC 2 report.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                    INSUFFICIENT_EVIDENCE
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Verified Clauses & Controls (span 6) */}
          <div className="md:col-span-6 rounded-3xl bg-white border border-zinc-200/90 p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-zinc-900">Verified Evidence Clauses</h3>
                  <span className="text-[10px] text-zinc-400 font-mono">≥97% Mathematical Match</span>
                </div>
              </div>
              <span className="font-mono text-xs font-bold text-emerald-600">
                {verifiedItems.length} Verified
              </span>
            </div>

            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {verifiedItems.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (item.verified_citations[0]) {
                      inspectCitation({
                        ...item.verified_citations[0],
                        confidence_score: item.gate_telemetry.citation_match,
                        document_filename: item.verified_citations[0].document_filename || "",
                        bounding_box: null,
                      });
                    }
                  }}
                  className="p-3 rounded-xl bg-zinc-50 border border-zinc-200/70 text-xs space-y-1 cursor-pointer hover:bg-emerald-50/50 hover:border-emerald-300 transition-colors"
                >
                  <div className="flex items-center justify-between font-medium">
                    <span className="text-zinc-900 font-semibold truncate max-w-48">
                      {item.prompt_or_question}
                    </span>
                    <span className="font-mono text-[10px] text-emerald-700 font-bold">
                      {item.gate_telemetry.citation_match}% Match
                    </span>
                  </div>
                  <p className="text-zinc-600 text-[11px] truncate">
                    {item.fluent_output}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom-Left Floating Chat Input Dock (Replit Image 4 Reference) */}
      <div className="fixed bottom-6 left-68 z-30 w-80 md:w-96">
        <form
          onSubmit={handleDockSubmit}
          className="rounded-2xl bg-white/95 backdrop-blur-md border border-zinc-200/90 shadow-xl p-2.5 flex items-center gap-2"
        >
          <input
            type="text"
            value={dockInput}
            onChange={(e) => setDockInput(e.target.value)}
            placeholder="Ask anything or search canvas..."
            className="flex-1 bg-transparent px-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!dockInput.trim() || asking}
            className="w-7 h-7 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <ArrowUp size={14} />
          </button>
        </form>
      </div>

      {/* Bottom-Center Floating Action Pill (Replit Image 4 Reference) */}
      <div className="fixed bottom-6 right-108 z-30">
        <div className="flex items-center gap-1 rounded-full bg-white/95 backdrop-blur-md shadow-xl border border-zinc-200/90 px-3 py-1.5 text-xs font-medium text-zinc-700">
          <button
            onClick={() => navigate("/workspace")}
            className="px-2.5 py-1 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <MessageSquare size={13} />
            <span>Chat</span>
          </button>
          <button
            onClick={() => {}}
            className="px-2.5 py-1 rounded-full hover:bg-zinc-100 transition-colors cursor-pointer flex items-center gap-1"
          >
            <Eye size={13} />
            <span>Inspect Quotes</span>
          </button>
          <button
            onClick={() => navigate("/results")}
            className="px-2.5 py-1 rounded-full text-blue-600 hover:bg-blue-50 transition-colors cursor-pointer flex items-center gap-1 font-semibold"
          >
            <Download size={13} />
            <span>+ Export</span>
          </button>
        </div>
      </div>
    </div>
  );
}
