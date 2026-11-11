import {
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Database,
  FileCheck2,
  FileCode2,
  FileSpreadsheet,
  FileText,
  Layers,
  Lock,
  Pause,
  Plus,
  Scan,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  Zap,
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
  const { uploadFile, loadDemo } = useBertStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>(DEFAULT_STAGED_FILES);
  const [reviewScope, setReviewScope] = useState("Full 7-Agent Verification");
  const [targetPlaybook, setTargetPlaybook] = useState("B2B Security & Liability");
  const [verificationGate, setVerificationGate] = useState("Strict >= 97% Quote Match");
  const [expandedUseCase, setExpandedUseCase] = useState<number | null>(0);
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const added: StagedFile[] = files.map((f) => ({
      name: f.name,
      size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
      type: f.name.split(".").pop()?.toUpperCase() ?? "FILE",
      file: f,
    }));
    setStagedFiles((prev) => [...prev, ...added]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (!files.length) return;
    const added: StagedFile[] = files.map((f) => ({
      name: f.name,
      size: `${(f.size / (1024 * 1024)).toFixed(1)} MB`,
      type: f.name.split(".").pop()?.toUpperCase() ?? "FILE",
      file: f,
    }));
    setStagedFiles((prev) => [...prev, ...added]);
  };

  const handleStartReview = async () => {
    // If user added real files, upload the first real file; otherwise load demo
    const realFile = stagedFiles.find((f) => f.file)?.file;
    if (realFile) {
      await uploadFile(realFile);
    } else {
      await loadDemo();
    }
    navigate("/workspace");
  };

  const handleDemoLaunch = async () => {
    await loadDemo();
    navigate("/workspace");
  };

  return (
    <div className="w-full">
      {/* =========================================================================
          SECTION 1A: WeTransfer-Style Interactive Intake Split Hero
          Deep Midnight Navy Canvas (#0B1026 to #111827) + WebGL2 Particles
      ========================================================================= */}
      <section className="relative min-h-screen bg-[#0B1026] bg-radial-[at_top_right] from-[#111827] via-[#0B1026] to-[#060814] text-white overflow-hidden flex items-center justify-center p-6 md:p-12 lg:p-16">
        {/* WebGL2 Particle System Canvas */}
        <Particles
          particleColors={["#ffffff", "#93c5fd", "#c7d2fe"]}
          particleCount={160}
          speed={0.08}
          connections={true}
          moveParticlesOnHover={true}
          hoverEffect="parallax"
          className="opacity-75"
        />

        <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
          {/* Left Column: Floating White WeTransfer Intake Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl text-zinc-900 border transition-all ${
                isDragging ? "border-blue-500 ring-4 ring-blue-500/20" : "border-zinc-100"
              }`}
            >
              {/* Header / Staged Items Counter */}
              <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-semibold">
                    <Check size={12} strokeWidth={2.5} />
                  </div>
                  <span className="text-xs font-semibold text-zinc-800">
                    {stagedFiles.length} item{stagedFiles.length === 1 ? "" : "s"} staged
                  </span>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept=".pdf,.xlsx,.xls,.json,.txt"
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 cursor-pointer"
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
                    className="flex items-center justify-between p-2.5 rounded-xl bg-zinc-50 border border-zinc-100 text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded bg-zinc-200/80 font-bold text-zinc-700">
                        {f.type}
                      </span>
                      <span className="font-medium text-zinc-800 truncate" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                    <span className="text-zinc-400 font-mono text-[10px] shrink-0 ml-2">{f.size}</span>
                  </div>
                ))}
              </div>

              {/* Configuration Dividers */}
              <div className="space-y-3 py-3 border-t border-zinc-100 text-xs">
                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
                    Review Scope
                  </label>
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200/70 text-zinc-800 font-medium text-xs">
                    <span>{reviewScope}</span>
                    <ShieldCheck size={14} className="text-blue-600" />
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
                    Target Playbook
                  </label>
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200/70 text-zinc-800 font-medium text-xs">
                    <span>{targetPlaybook}</span>
                    <span className="text-[10px] font-mono text-zinc-500">v2.4</span>
                  </div>
                </div>

                <div>
                  <label className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400 block mb-1">
                    Verification Gate
                  </label>
                  <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-emerald-50/70 border border-emerald-200/80 text-emerald-800 font-medium text-xs">
                    <span>{verificationGate}</span>
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-3 space-y-2">
                <button
                  onClick={handleStartReview}
                  className="w-full py-3.5 px-4 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-lg shadow-blue-500/25 flex items-center justify-center gap-2 transition-all cursor-pointer group"
                >
                  <span>Start Agent Review</span>
                  <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={handleDemoLaunch}
                  className="w-full py-2 text-center text-xs text-zinc-500 hover:text-zinc-800 transition-colors cursor-pointer"
                >
                  ⚡ Or load instant 4-document demo case
                </button>
              </div>
            </div>
          </div>

          {/* Right Column: Editorial Headline & Floating Pastel File Squircles */}
          <div className="lg:col-span-7 space-y-8 text-center lg:text-left relative">
            {/* Bobbing Pastel File Squircles */}
            <div className="hidden sm:block absolute -top-12 right-6 animate-float-slow">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#E0E7FF] text-[#4F46E5] border border-[#C7D2FE] shadow-lg backdrop-blur-sm text-xs font-semibold">
                <FileText size={15} />
                <span>.pdf contract</span>
              </div>
            </div>

            <div className="hidden sm:block absolute top-28 -right-4 animate-float-delay">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#D1FAE5] text-[#059669] border border-[#A7F3D0] shadow-lg backdrop-blur-sm text-xs font-semibold">
                <FileSpreadsheet size={15} />
                <span>.xlsx questionnaire</span>
              </div>
            </div>

            <div className="hidden sm:block absolute bottom-0 right-16 animate-float-slow">
              <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-[#FFEDD5] text-[#EA580C] border border-[#FED7AA] shadow-lg backdrop-blur-sm text-xs font-semibold">
                <FileCode2 size={15} />
                <span>.json cloud config</span>
              </div>
            </div>

            {/* Editorial Serif Display Headline */}
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-blue-200 border border-white/15 text-xs font-mono">
                <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                <span>MARSHAL LOUIS-ALEXANDRE BERTHIER INTELLIGENCE</span>
              </div>

              <h1 className="font-serif text-5xl sm:text-6xl lg:text-7xl font-semibold tracking-tight leading-[1.08] text-white">
                Drop files. <br />
                <span className="italic font-normal text-blue-300">Verify every line.</span>
              </h1>

              <p className="max-w-xl text-base sm:text-lg text-zinc-300 font-light leading-relaxed">
                BERT orchestrates seven specialized small agents to decompose messy scans,
                200-page audit reports, and cloud configs into an immutable syntax tree. Every answer is deterministically tied to an exact source quote.
              </p>
            </div>

            {/* Preview Card of Highlighted Clause */}
            <div className="max-w-md p-4 rounded-2xl bg-white/10 backdrop-blur-md border border-white/15 text-left text-xs space-y-2 shadow-xl">
              <div className="flex items-center justify-between text-zinc-300 text-[11px] font-mono">
                <span>SOC2_Type_II_2026.pdf · Page 4</span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  99.4% Quote Match
                </span>
              </div>
              <p className="text-zinc-100 font-serif text-sm italic leading-snug">
                “Access control requires multifactor authentication for all privileged accounts across production environments.”
              </p>
              <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-mono">
                <span>Ranger Node #14</span>
                <span>•</span>
                <span>Deterministic rapidfuzz verify: SAFE</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          SECTION 1B: Daylight Editorial Pitch & Showcase Bento
          Warm Alabaster Surface (#F7F7F5) + Royal Blue Bento Showcase Container
      ========================================================================= */}
      <section id="how-it-works" className="py-24 px-6 md:px-12 lg:px-16 bg-[#F7F7F5] text-zinc-900">
        <div className="max-w-5xl mx-auto space-y-16">
          {/* Centered Editorial Serif Headline */}
          <div className="text-center space-y-5 max-w-3xl mx-auto">
            <span className="text-xs uppercase tracking-widest font-semibold text-blue-600 font-mono">
              ZERO-HALLUCINATION EVIDENCE MATRIX
            </span>
            <h2 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight text-zinc-950 leading-tight">
              One workspace, seven specialist agents. <br />
              <span className="italic font-normal text-zinc-600">Zero hallucinations. Full proof.</span>
            </h2>
            <p className="text-base sm:text-lg text-zinc-600 leading-relaxed font-light">
              BERT reads your messy scans, 200-page audit PDFs, Excel questionnaires, and cloud configs—backing every answer with an exact highlighted quote. If proof doesn't exist, BERT refuses to guess and asks you directly.
            </p>
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => navigate("/workspace")}
                className="py-3 px-7 rounded-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-semibold shadow-md shadow-blue-500/20 flex items-center gap-2 transition-all cursor-pointer"
              >
                <span>Launch Live Copilot</span>
                <ArrowRight size={15} />
              </button>
              <span className="text-xs text-zinc-500 font-mono">
                Works with local 48GB GPU or instant Demo Mode · Zero data loss
              </span>
            </div>
          </div>

          {/* Royal Blue Bento Showcase Container (#2563EB) */}
          <div id="use-cases" className="rounded-3xl bg-[#2563EB] p-8 sm:p-12 text-white shadow-2xl">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
              {/* Left Column: Built for High-Stakes Review (3 Use Cases) */}
              <div className="lg:col-span-5 space-y-6">
                <div>
                  <span className="text-blue-200 text-xs font-mono font-semibold uppercase tracking-wider">
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
                      detail: "Every cell is populated with an Envoy synthesis linked deterministically to the underlying AST node. Missing items become human escalations.",
                    },
                    {
                      title: "Contract Risk Triage",
                      summary: "Flag uncapped indemnities and policy contradictions across years.",
                      detail: "Chronos detects supersession chains, while Vanguard scores liabilities P0 to P3 so counsel starts where risk is highest.",
                    },
                    {
                      title: "Degraded Physical Scans",
                      summary: "Lossless intake of stamps, faxed signatures, and handwriting.",
                      detail: "Scout Vision SLM rescues low-confidence OCR crops with bounding boxes without guessing or hallucinating missing characters.",
                    },
                  ].map((uc, idx) => (
                    <div
                      key={uc.title}
                      className="p-4 rounded-2xl bg-white/10 hover:bg-white/15 transition-colors cursor-pointer border border-white/10"
                      onClick={() => setExpandedUseCase(expandedUseCase === idx ? null : idx)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm">{uc.title}</span>
                        <ChevronDown
                          size={15}
                          className={`text-blue-200 transition-transform ${
                            expandedUseCase === idx ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                      <p className="text-xs text-blue-100 mt-1 leading-snug">{uc.summary}</p>
                      {expandedUseCase === idx && (
                        <div className="mt-3 pt-3 border-t border-white/15 text-xs text-blue-200 leading-relaxed font-light">
                          {uc.detail}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: 2x2 Bento Grid */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                      <Database size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-blue-600">01 · INTAKE</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Lossless AST Intake</h4>
                    <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                      PDFs, Excel rows, and 50MB+ cloud JSONs decompose into an immutable PostgreSQL syntax tree with SHA-256 completeness checksums.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-400">
                    O(1) memory · Zero truncation
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                      <Layers size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-amber-600">02 · TRIAGE</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Automatic Caution Tagging</h4>
                    <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                      Quartermaster categorizes clauses; Vanguard computes 0–100 risk scores; Chronos maps 2023 vs 2026 policy supersession.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-400">
                    P0 Critical to P3 Low tiers
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                      <Pause size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-emerald-600">03 · CONTROL</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Live Pausable Agent Stream</h4>
                    <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                      Pause between atomic agent steps. Direct the regiment via natural language mid-run and resume without restarting.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-400">
                    LangGraph safe checkpointing
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-white text-zinc-900 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                      <ShieldCheck size={17} />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-purple-600">04 · VERIFICATION</span>
                    <h4 className="font-semibold text-sm text-zinc-900 mt-1">Mathematical Quote Verification</h4>
                    <p className="text-xs text-zinc-500 mt-2 leading-relaxed">
                      Every cited fact must match the source verbatim at ≥97% ratio via rapidfuzz. Any discrepancy triggers human escalation.
                    </p>
                  </div>
                  <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-400">
                    Decoupled extraction & fluency
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Minimal Editorial Footer */}
      <footer className="py-8 px-6 border-t border-zinc-200/80 bg-white text-zinc-500 text-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="font-mono font-semibold text-zinc-800">BERT · Zero Hallucination Engine</span>
          <span>·</span>
          <span>Inspired by Marshal Louis-Alexandre Berthier</span>
        </div>
        <div className="font-mono text-[11px] text-zinc-400">
          Clean MIT/BSD/Apache-2.0 Stack · Local 48GB GPU Ready
        </div>
      </footer>
    </div>
  );
}
