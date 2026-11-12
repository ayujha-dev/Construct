import {
  ArrowRight,
  Check,
  ChevronDown,
  Database,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  Pause,
  Plus,
  ShieldCheck,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Particles } from "../components/ui/Particles";
import { useBertStore } from "../store/useBertStore";

interface StagedFile {
  name: string;
  size: string;
  type: string;
  file?: File;
}

const DEFAULT_STAGED_FILES: StagedFile[] = [
  { name: "SOC2_Type_II_2026.pdf", size: "2.4 MB", type: "PDF" },
  { name: "Security_Questionnaire.xlsx", size: "18.4 KB", type: "XLSX" },
];

export function LandingPage() {
  const navigate = useNavigate();
  const { uploadFiles, loadDemo, workspaceId } = useBertStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>(DEFAULT_STAGED_FILES);
  const [reviewScope] = useState("Full 7-Agent Verification");
  const [targetPlaybook] = useState("B2B Security & Liability");
  const [verificationGate] = useState("Strict >= 97% Quote Match");
  const [expandedUseCase, setExpandedUseCase] = useState<number | null>(0);
  const [isDragging, setIsDragging] = useState(false);

  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const appendRealFiles = (files: File[]) => {
    if (!files.length) return;
    const added: StagedFile[] = files.map((f) => ({
      name: f.name,
      size: formatSize(f.size),
      type: f.name.split(".").pop()?.toUpperCase() ?? "FILE",
      file: f,
    }));
    setStagedFiles((prev) => {
      const existingReal = prev.filter((item) => item.file);
      return [...existingReal, ...added];
    });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    appendRealFiles(Array.from(e.target.files || []));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    appendRealFiles(Array.from(e.dataTransfer.files || []));
  };

  const removeStagedFile = (idx: number) => {
    setStagedFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleStartReview = async () => {
    const realFiles = stagedFiles.map((f) => f.file).filter((f): f is File => Boolean(f));
    if (realFiles.length > 0) {
      await uploadFiles(realFiles);
    } else {
      await loadDemo();
    }
    navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
  };

  const handleDemoLaunch = async () => {
    await loadDemo();
    navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`);
  };

  return (
    <div className="w-full">
      {/* SECTION 1A: Interactive Intake Split Hero */}
      <section className="relative min-h-screen bg-[#0B1026] bg-radial-[at_top_right] from-[#111827] via-[#0B1026] to-[#060814] text-white overflow-hidden flex items-center justify-center p-4 sm:p-8 md:p-12 lg:p-16">
        <Particles
          particleColors={["#ffffff", "#93c5fd", "#c7d2fe"]}
          particleCount={160}
          speed={0.08}
          connections={true}
          moveParticlesOnHover={true}
          hoverEffect="parallax"
          className="opacity-75"
        />

        <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-center pt-12 md:pt-0">
          {/* Left Column: Intake Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`w-full max-w-sm rounded-3xl bg-white p-5 sm:p-6 shadow-2xl text-zinc-900 border transition-all ${
                isDragging ? "border-blue-500 ring-4 ring-blue-500/20" : "border-zinc-100"
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-700 flex items-center justify-center text-xs font-semibold">
                    <Check size={12} strokeWidth={2.5} />
                  </div>
                  <span className="text-xs font-semibold text-zinc-900">
                    {stagedFiles.length} item{stagedFiles.length === 1 ? "" : "s"} staged
                  </span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md"
                  aria-label="Select documents or spreadsheets to stage"
                  className="hidden focus-visible:ring-2 focus-visible:ring-blue-600"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1"
                >
                  <Plus size={14} />
                  <span>Add more</span>
                </button>
              </div>

              {/* Staged File List */}
              <div className="py-3 space-y-2 max-h-36 overflow-y-auto">
                {stagedFiles.map((f, i) => (
                  <div
                    key={`${f.name}-${i}`}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-200/70 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-zinc-200 font-bold text-zinc-800 shrink-0">
                        {f.type}
                      </span>
                      <span className="font-medium text-zinc-900 truncate" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 ml-2">
                      <span className="text-zinc-600 font-mono text-[10px]">{f.size}</span>
                      <button
                        type="button"
                        onClick={() => removeStagedFile(i)}
                        aria-label={`Remove ${f.name}`}
                        className="p-0.5 rounded text-zinc-600 hover:text-rose-700 hover:bg-rose-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Configuration Summary */}
              <div className="space-y-3 py-3 border-t border-zinc-100 text-xs">
                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 block mb-1">
                    Review Scope
                  </span>
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-zinc-900 font-medium text-xs">
                    <span>{reviewScope}</span>
                    <ShieldCheck size={14} className="text-blue-700" />
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 block mb-1">
                    Target Playbook
                  </span>
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200/80 text-zinc-900 font-medium text-xs">
                    <span>{targetPlaybook}</span>
                    <span className="text-[10px] font-mono text-zinc-600">v2.4</span>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-600 block mb-1">
                    Verification Gate
                  </span>
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium text-xs">
                    <span>{verificationGate}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-600" />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 space-y-2">
                <button
                  type="button"
                  onClick={() => void handleStartReview()}
                  className="w-full py-3.5 px-4 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                >
                  <span>Start Agent Review</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => void handleDemoLaunch()}
                  className="w-full py-2 text-center text-xs text-zinc-700 hover:text-zinc-950 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Or load instant 4-document demo case
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Headline */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left relative">
            <div className="hidden sm:block absolute -top-12 right-6 animate-float-slow">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#E0E7FF] text-[#3730A3] border border-[#C7D2FE] shadow-lg backdrop-blur-sm text-xs font-semibold">
                <FileText size={15} />
                <span>.pdf contract</span>
              </div>
            </div>

            <div className="hidden sm:block absolute top-28 -right-4 animate-float-delay">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#D1FAE5] text-[#065F46] border border-[#A7F3D0] shadow-lg backdrop-blur-sm text-xs font-semibold">
                <FileSpreadsheet size={15} />
                <span>.xlsx questionnaire</span>
              </div>
            </div>

            <div className="hidden sm:block absolute bottom-0 right-16 animate-float-slow">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#FFEDD5] text-[#9A3412] border border-[#FED7AA] shadow-lg backdrop-blur-sm text-xs font-semibold">
                <FileCode2 size={15} />
                <span>.json cloud config</span>
              </div>
            </div>

            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-100 border border-white/15 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span>MARSHAL LOUIS-ALEXANDRE BERTHIER INTELLIGENCE</span>
              </div>

              <h1 className="font-serif text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.08] text-white">
                Drop files. <br />
                <span className="italic font-normal text-blue-200">Verify every line.</span>
              </h1>

              <p className="max-w-xl text-base sm:text-lg text-zinc-200 font-light leading-relaxed mx-auto lg:mx-0">
                BERT orchestrates seven specialized small agents to decompose messy scans,
                200-page audit reports, and cloud configs into an immutable syntax tree. Every answer is deterministically tied to an exact source quote.
              </p>
            </div>

            {/* Preview Card */}
            <div className="max-w-md mx-auto lg:mx-0 p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-left text-xs space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-zinc-200 text-[11px] font-mono">
                <span>SOC2_Type_II_2026.pdf · Page 4</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  99.4% Quote Match
                </span>
              </div>
              <p className="text-white font-serif text-sm italic leading-snug">
                “Access control requires multifactor authentication for all privileged accounts across production environments.”
              </p>
              <div className="flex items-center gap-2 text-[10px] text-zinc-300 font-mono">
                <span>Ranger Node #14</span>
                <span>·</span>
                <span>Deterministic rapidfuzz verify: SAFE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 1B: Editorial Pitch & Showcase Bento */}
      <section id="how-it-works" className="py-20 px-4 sm:px-8 md:px-12 lg:px-16 bg-[#F7F7F5] text-zinc-900">
        <div className="max-w-5xl mx-auto space-y-16">
          <div className="text-center space-y-5 max-w-3xl mx-auto">
            <span className="text-xs uppercase tracking-widest font-semibold text-blue-700 font-mono">
              ZERO-HALLUCINATION EVIDENCE MATRIX
            </span>
            <h2 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-zinc-950 leading-tight">
              One workspace, seven specialist agents. <br />
              <span className="italic font-normal text-zinc-700">Zero hallucinations. Full proof.</span>
            </h2>
            <p className="text-base sm:text-lg text-zinc-700 leading-relaxed font-light">
              BERT reads your messy scans, 200-page audit PDFs, Excel questionnaires, and cloud configs—backing every answer with an exact highlighted quote. If proof doesn't exist, BERT refuses to guess and asks you directly.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => navigate(`/workspace?workspace=${encodeURIComponent(workspaceId || "default")}`)}
                className="py-3 px-7 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              >
                <span>Launch Live Copilot</span>
                <ArrowRight size={15} />
              </button>
              <span className="text-xs text-zinc-700 font-mono">
                Works with local 48GB GPU or instant Demo Mode · Zero data loss
              </span>
            </div>
          </div>

          {/* Royal Blue Bento Showcase Container */}
          <div id="use-cases" className="rounded-3xl bg-[#1D4ED8] p-6 sm:p-12 text-white shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              <div className="lg:col-span-5 space-y-6">
                <div>
                  <span className="text-blue-100 text-xs font-mono font-semibold uppercase tracking-wider">
                    MISSION CAPABILITY
                  </span>
                  <h3 className="font-serif text-3xl font-semibold mt-1">
                    Built for High-Stakes Review
                  </h3>
                  <p className="text-blue-100 text-xs sm:text-sm mt-2 leading-relaxed">
                    Designed for legal, security, and compliance teams where a single unverified claim can trigger liability.
                  </p>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      title: "Security Questionnaires",
                      summary: "Auto-answer blank Excel spreadsheets with exact SOC 2 page citations.",
                      detail:
                        "Every cell is populated with an Envoy synthesis linked deterministically to the underlying AST node. Missing items become human escalations.",
                    },
                    {
                      title: "Contract Risk Triage",
                      summary: "Flag uncapped indemnities and policy contradictions across years.",
                      detail:
                        "Chronos detects supersession chains, while Vanguard scores liabilities P0 to P3 so counsel starts where risk is highest.",
                    },
                    {
                      title: "Degraded Physical Scans",
                      summary: "Lossless intake of stamps, faxed signatures, and handwriting.",
                      detail:
                        "Scout Vision SLM rescues low-confidence OCR crops with bounding boxes without guessing or hallucinating missing characters.",
                    },
                  ].map((uc, idx) => (
                    <button
                      key={uc.title}
                      type="button"
                      aria-expanded={expandedUseCase === idx}
                      onClick={() => setExpandedUseCase(expandedUseCase === idx ? null : idx)}
                      className="w-full text-left p-4 rounded-2xl bg-white/10 hover:bg-white/15 transition-colors cursor-pointer border border-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-white">{uc.title}</span>
                        <ChevronDown
                          size={15}
                          className={`text-blue-100 transition-transform ${
                            expandedUseCase === idx ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                      <p className="text-xs text-blue-100 mt-1 leading-snug">{uc.summary}</p>
                      {expandedUseCase === idx && (
                        <div className="mt-3 pt-3 border-t border-white/15 text-xs text-blue-50 leading-relaxed">
                          {uc.detail}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center mb-3">
                      <Database size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-blue-700">01 · INTAKE</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Lossless AST Intake</h4>
                    <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                      PDFs, Excel rows, and 50MB+ cloud JSONs decompose into an immutable PostgreSQL syntax tree with SHA-256 completeness checksums.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-600">
                    O(1) memory · Zero truncation
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center mb-3">
                      <Layers size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-amber-800">02 · TRIAGE</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Automatic Caution Tagging</h4>
                    <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                      Quartermaster categorizes clauses; Vanguard computes 0–100 risk scores; Chronos maps 2023 vs 2026 policy supersession.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-600">
                    P0 Critical to P3 Low tiers
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center mb-3">
                      <Pause size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-emerald-800">03 · CONTROL</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Live Pausable Agent Stream</h4>
                    <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                      Pause between atomic agent steps. Direct the regiment via natural language mid-run and resume without restarting.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-600">
                    LangGraph safe checkpointing
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-800 flex items-center justify-center mb-3">
                      <ShieldCheck size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-purple-800">04 · VERIFICATION</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Mathematical Quote Verification</h4>
                    <p className="text-xs text-zinc-600 mt-2 leading-relaxed">
                      Every cited fact must match the source verbatim at ≥97% ratio via rapidfuzz. Any discrepancy triggers human escalation.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-600">
                    Decoupled extraction & fluency
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Security Gate Guarantee Strip */}
          <div
            id="security-gate"
            className="rounded-3xl bg-white border border-zinc-200 p-6 sm:p-8 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-6"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-blue-700">
                <Lock size={14} />
                <span>DETERMINISTIC GATE</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-950">≥97% Quote-in-Region Proof</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                PDF, XLSX, JSON, and scanned OCR findings validate coordinates directly against source page text geometry.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-800">
                <ShieldCheck size={14} />
                <span>COUNSEL ESCALATION</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-950">ESCALATED_LEGAL Safeguard</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Legal flags preserve original P0/P1 risk scores, record assignee/reason audit logs, and support full transactional Undo.
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-mono font-bold text-emerald-800">
                <ShieldCheck size={14} />
                <span>CRYPTOGRAPHIC LEDGER</span>
              </div>
              <h3 className="text-sm font-semibold text-zinc-950">SHA-256 Chain of Custody</h3>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Zero-data-loss verification hashes every AST node, exported questionnaire cell, and reviewer action.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-6 border-t border-zinc-200/80 bg-white text-zinc-700 text-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          <span className="font-mono font-semibold text-zinc-900">BERT · Zero Hallucination Engine</span>
          <span>·</span>
          <span>Inspired by Marshal Louis-Alexandre Berthier</span>
        </div>
        <div className="font-mono text-[11px] text-zinc-600">
          Clean MIT/BSD/Apache-2.0 Stack · Local 48GB GPU Ready
        </div>
      </footer>
    </div>
  );
}
