import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Database,
  FileCheck2,
  HardDrive,
  Lock,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Particles } from "../components/ui/Particles";
import {
  CLAIM_EVIDENCE_DEMOS,
  LANDING_NAV_ITEMS,
  LOCAL_MODE_GUARANTEES,
  PIPELINE_AGENTS,
  USE_CASES,
  VERIFICATION_GATE_PILLARS,
  extractRealFiles,
  mergeStagedFiles,
  prefersReducedMotion,
  removeStagedFileAt,
  scrollToSection,
  type StagedFileItem,
} from "../lib/landingContent";
import { useBertStore } from "../store/useBertStore";

function HighlightedExcerpt({ text, highlight }: { text: string; highlight: string }) {
  const idx = text.indexOf(highlight);
  if (idx === -1 || !highlight) {
    return <span>{text}</span>;
  }
  const before = text.slice(0, idx);
  const after = text.slice(idx + highlight.length);
  return (
    <span>
      {before}
      <mark className="bg-amber-200 text-zinc-950 px-1 py-0.5 rounded font-semibold">
        {highlight}
      </mark>
      {after}
    </span>
  );
}

export function LandingPage() {
  const navigate = useNavigate();
  const { uploadFiles, loadDemo, workspaceId } = useBertStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const [activeDemoIdx, setActiveDemoIdx] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(() => !prefersReducedMotion());
  const [isDemoHovered, setIsDemoHovered] = useState(false);
  const [isDemoFocused, setIsDemoFocused] = useState(false);

  const [expandedUseCase, setExpandedUseCase] = useState<number | null>(0);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (matches: boolean) => {
      setReducedMotion(matches);
      if (matches) setIsAutoPlaying(false);
    };
    sync(mql.matches);
    const handler = (event: MediaQueryListEvent) => sync(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!isAutoPlaying || isDemoHovered || isDemoFocused || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setActiveDemoIdx((prev) => (prev + 1) % CLAIM_EVIDENCE_DEMOS.length);
    }, 4500);
    return () => window.clearTimeout(timer);
  }, [activeDemoIdx, isAutoPlaying, isDemoHovered, isDemoFocused, reducedMotion]);

  const appendRealFiles = (files: File[]) => {
    if (!files.length) return;
    setStagedFiles((prev) => mergeStagedFiles(prev, files));
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    appendRealFiles(Array.from(e.target.files || []));
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    appendRealFiles(Array.from(e.dataTransfer.files || []));
  };

  const removeStagedFile = (idx: number) => {
    setStagedFiles((prev) => removeStagedFileAt(prev, idx));
  };

  const clearAllStagedFiles = () => {
    setStagedFiles([]);
  };

  const handlePrimaryCta = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    try {
      const realFiles = extractRealFiles(stagedFiles);
      if (realFiles.length > 0) {
        await uploadFiles(realFiles);
      } else {
        await loadDemo();
      }
      const ws = useBertStore.getState().workspaceId || workspaceId || "default";
      navigate(`/workspace?workspace=${encodeURIComponent(ws)}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const handleDemoLaunch = async () => {
    if (isLaunching) return;
    setIsLaunching(true);
    try {
      await loadDemo();
      const ws = useBertStore.getState().workspaceId || workspaceId || "default";
      navigate(`/workspace?workspace=${encodeURIComponent(ws)}`);
    } finally {
      setIsLaunching(false);
    }
  };

  const activeDemo = CLAIM_EVIDENCE_DEMOS[activeDemoIdx] ?? CLAIM_EVIDENCE_DEMOS[0];
  const hasStagedFiles = stagedFiles.length > 0;

  return (
    <div className="w-full overflow-x-clip">
      {/* SECTION 1: Hero & Interactive Intake Card */}
      <section
        id="hero"
        className="relative bg-[#0B1026] text-white overflow-hidden pt-20 pb-14 sm:pt-24 sm:pb-16 lg:py-24 px-4 sm:px-8 md:px-10 lg:px-14"
      >
        <Particles
          particleColors={["#ffffff", "#93c5fd", "#c7d2fe"]}
          particleCount={140}
          speed={0.07}
          connections={true}
          moveParticlesOnHover={true}
          hoverEffect="parallax"
          className="opacity-70"
        />

        <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Clean WeTransfer-style Intake Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start min-w-0">
            <div
              data-testid="landing-intake-card"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`w-full max-w-md rounded-3xl bg-white p-5 sm:p-6 shadow-2xl text-zinc-900 border transition-colors ${
                isDragging ? "border-blue-600 ring-4 ring-blue-500/25" : "border-zinc-200"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-zinc-200">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-blue-50 text-blue-800 flex items-center justify-center text-xs font-semibold shrink-0">
                    {hasStagedFiles ? <Check size={13} strokeWidth={2.5} /> : <UploadCloud size={13} />}
                  </div>
                  <span
                    data-testid="staged-files-count"
                    className="text-xs font-semibold text-zinc-900 truncate"
                  >
                    {stagedFiles.length === 0
                      ? "0 files staged"
                      : `${stagedFiles.length} file${stagedFiles.length === 1 ? "" : "s"} staged`}
                  </span>
                </div>

                <input
                  id="landing-file-input"
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  multiple
                  accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md"
                  aria-label="Select documents or spreadsheets to stage"
                  className="sr-only focus-visible:ring-2 focus-visible:ring-blue-600"
                />

                <div className="flex items-center gap-2 shrink-0">
                  {hasStagedFiles && (
                    <button
                      type="button"
                      data-testid="clear-staged-files"
                      onClick={clearAllStagedFiles}
                      className="inline-flex items-center gap-1 text-xs font-medium text-zinc-700 hover:text-rose-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1.5 py-0.5"
                    >
                      <Trash2 size={12} />
                      <span>Clear</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-blue-800 hover:text-blue-950 bg-blue-50 hover:bg-blue-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-lg px-2 py-1"
                  >
                    <Plus size={14} />
                    <span>Add files</span>
                  </button>
                </div>
              </div>

              {/* Staged File List or Empty Dropzone */}
              <div className="py-3">
                {stagedFiles.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full rounded-2xl border-2 border-dashed border-zinc-300 bg-zinc-50 hover:bg-zinc-100 px-4 py-5 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    <UploadCloud size={22} className="mx-auto text-blue-700 mb-2" />
                    <span className="block text-xs font-semibold text-zinc-900">
                      Drop PDFs, .xlsx questionnaires, or .json IAM configs
                    </span>
                    <span className="block text-[11px] text-zinc-700 mt-1">
                      Supports .pdf, .xlsx, .json, .txt, .md · Multi-file batch upload
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                    {stagedFiles.map((f, i) => (
                      <div
                        key={f.id}
                        data-testid="staged-file-item"
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-zinc-50 border border-zinc-200 text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-200 font-bold text-zinc-900 shrink-0">
                            {f.typeLabel}
                          </span>
                          <span
                            className="font-medium text-zinc-900 truncate"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-zinc-700 font-mono text-[11px]">
                            {f.sizeLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeStagedFile(i)}
                            aria-label={`Remove ${f.name}`}
                            className="p-1 rounded text-zinc-700 hover:text-rose-700 hover:bg-rose-50 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Deterministic Contract Summary */}
              <div className="space-y-2.5 py-3 border-t border-zinc-200 text-xs">
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900">
                  <span className="font-medium">Pipeline</span>
                  <span className="font-mono text-[11px] text-zinc-700">
                    7-Agent Regiment
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900">
                  <span className="font-medium">Verification Gate</span>
                  <span className="font-mono text-[11px] text-emerald-900 font-semibold">
                    rapidfuzz &ge;97% · logprob &ge;0.92
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-900">
                  <span className="font-medium">Audit Ledger</span>
                  <span className="font-mono text-[11px] text-zinc-700">
                    SHA-256 AST Checksums
                  </span>
                </div>
              </div>

              {/* ONE Primary CTA + Secondary Link */}
              <div className="pt-3 space-y-2.5">
                <button
                  type="button"
                  data-testid="landing-primary-cta"
                  disabled={isLaunching}
                  onClick={() => void handlePrimaryCta()}
                  className="w-full py-3.5 px-4 rounded-full bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-70 text-white text-sm font-semibold shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2"
                >
                  <span>
                    {isLaunching
                      ? "Starting…"
                      : hasStagedFiles
                        ? "Start Agent Review"
                        : "Launch Demo Dossier"}
                  </span>
                  <ArrowRight
                    size={16}
                    className="group-hover:translate-x-0.5 transition-transform"
                  />
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    data-testid="landing-demo-link"
                    disabled={isLaunching}
                    onClick={() => void handleDemoLaunch()}
                    className="inline-flex items-center justify-center py-1 px-2 text-xs font-semibold text-blue-800 hover:text-blue-950 underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                  >
                    Try Demo Corpus
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: High-Contrast Value Proposition */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#141D3D] text-[#BFDBFE] border border-[#2B3B73] text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-blue-400" />
              <span>BERT · DETERMINISTIC EVIDENCE VERIFICATION</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08] text-white">
              Drop files.{" "}
              <span className="italic font-normal text-[#BFDBFE]">Verify every line.</span>
            </h1>

            <p className="max-w-2xl text-base sm:text-lg text-[#E4E4E7] leading-relaxed mx-auto lg:mx-0">
              Every answer is tied to a verbatim source quote (&ge;97% rapidfuzz match) or
              flagged for human review. Missing or low-confidence evidence fails closed to
              human triage.
            </p>

            {/* Verifiable Guarantees Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-[#141D3D] border border-[#2B3B73]">
                <div className="text-[11px] font-mono font-semibold text-[#BFDBFE]">
                  QUOTE GATE
                </div>
                <p className="text-xs text-white mt-1 leading-snug">
                  &ge;97% rapidfuzz match + &ge;0.92 critical-entity logprob check.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#141D3D] border border-[#2B3B73]">
                <div className="text-[11px] font-mono font-semibold text-[#BFDBFE]">
                  SHA-256 LEDGER
                </div>
                <p className="text-xs text-white mt-1 leading-snug">
                  Every ingested file is SHA-256 checksummed into an immutable Audit Ledger.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[#141D3D] border border-[#2B3B73]">
                <div className="text-[11px] font-mono font-semibold text-[#BFDBFE]">
                  FAIL-CLOSED TRIAGE
                </div>
                <p className="text-xs text-white mt-1 leading-snug">
                  Unsupported claims route to human triage instead of unverified prose.
                </p>
              </div>
            </div>

            {/* Verbatim Proof Preview Card */}
            <div className="max-w-xl mx-auto lg:mx-0 p-4 rounded-2xl bg-[#141D3D] border border-[#2B3B73] text-left text-xs space-y-2 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[#E4E4E7] text-[11px] font-mono">
                <span>SOC2_Type_II_2026.pdf · Page 14</span>
                <span className="px-2 py-0.5 rounded bg-[#064E3B] text-[#A7F3D0] border border-[#059669]">
                  99.4% rapidfuzz Match
                </span>
              </div>
              <p className="text-white font-serif text-sm italic leading-snug">
                “Access control requires multifactor authentication for all privileged accounts
                across production environments.”
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#CBD5E1] font-mono">
                <span>Ranger Fact Node</span>
                <span>·</span>
                <span>bbox [72, 610, 512, 636]</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: Interactive Claim -> Source Evidence Demo */}
      <section
        id="evidence-demo"
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-white text-zinc-900 border-b border-zinc-200"
      >
        <div
          className="max-w-5xl mx-auto space-y-8"
          onMouseEnter={() => setIsDemoHovered(true)}
          onMouseLeave={() => setIsDemoHovered(false)}
          onFocus={() => setIsDemoFocused(true)}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setIsDemoFocused(false);
            }
          }}
        >
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-800">
                INTERACTIVE CLAIM &rarr; SOURCE EVIDENCE DEMO
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-zinc-950">
                Inspect how every claim resolves to source proof—or fails closed.
              </h2>
              <p className="text-sm text-zinc-700 leading-relaxed">
                Step through real BERT verification cases: SOC 2 MFA, AWS IAM{" "}
                <code className="px-1 py-0.5 rounded bg-zinc-100 text-zinc-900 text-xs">
                  s3:*
                </code>{" "}
                wildcards, Chronos 2026 vs 2023 supersession, and a missing-proof escalation.
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                aria-label="Previous evidence demo case"
                onClick={() => {
                  setIsAutoPlaying(false);
                  setActiveDemoIdx(
                    (prev) =>
                      (prev - 1 + CLAIM_EVIDENCE_DEMOS.length) % CLAIM_EVIDENCE_DEMOS.length
                  );
                }}
                className="p-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next evidence demo case"
                onClick={() => {
                  setIsAutoPlaying(false);
                  setActiveDemoIdx((prev) => (prev + 1) % CLAIM_EVIDENCE_DEMOS.length);
                }}
                className="p-2 rounded-lg border border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                data-testid="evidence-demo-autoplay-toggle"
                onClick={() => setIsAutoPlaying((prev) => !prev)}
                disabled={reducedMotion}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 disabled:opacity-60 text-xs font-semibold text-zinc-900 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {isAutoPlaying && !reducedMotion ? <Pause size={13} /> : <Play size={13} />}
                <span>
                  {reducedMotion
                    ? "Reduced Motion"
                    : isAutoPlaying
                      ? "Pause"
                      : "Auto-play"}
                </span>
              </button>
            </div>
          </div>

          {/* Step Selector Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {CLAIM_EVIDENCE_DEMOS.map((item, idx) => {
              const selected = idx === activeDemoIdx;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`evidence-demo-tab-${item.id}`}
                  aria-pressed={selected}
                  onClick={() => {
                    setIsAutoPlaying(false);
                    setActiveDemoIdx(idx);
                  }}
                  className={`text-left p-3 rounded-2xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                    selected
                      ? "bg-[#1D4ED8] text-white border-[#1D4ED8] shadow-sm"
                      : "bg-zinc-50 text-zinc-900 border-zinc-200 hover:bg-zinc-100"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        selected
                          ? "bg-[#1E3A8A] text-white"
                          : "bg-zinc-200 text-zinc-900"
                      }`}
                    >
                      {item.sourceFormat}
                    </span>
                    <span
                      className={`text-[10px] font-mono ${
                        selected ? "text-blue-100" : "text-zinc-700"
                      }`}
                    >
                      0{idx + 1}
                    </span>
                  </div>
                  <div className="font-semibold text-xs mt-2">{item.shortLabel}</div>
                </button>
              );
            })}
          </div>

          {/* Active Demo Inspection Stage */}
          <div
            data-testid="evidence-demo-stage"
            className="rounded-3xl border border-zinc-200 bg-[#F8FAFC] p-5 sm:p-7 space-y-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-zinc-200">
              <div>
                <div className="text-[11px] font-mono font-semibold text-zinc-700">
                  {activeDemo.sourceFile} · {activeDemo.locatorLabel}
                </div>
                <h3 className="text-lg font-semibold text-zinc-950 mt-0.5">
                  {activeDemo.claimTitle}
                </h3>
              </div>

              <span
                data-testid="evidence-demo-status"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                  activeDemo.status === "VERIFIED"
                    ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                    : "bg-rose-50 text-rose-900 border-rose-300"
                }`}
              >
                {activeDemo.status === "VERIFIED" ? (
                  <FileCheck2 size={14} />
                ) : (
                  <AlertTriangle size={14} />
                )}
                <span>{activeDemo.statusBadge}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Step 1: Claim */}
              <div className="lg:col-span-4 rounded-2xl bg-white border border-zinc-200 p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-800">
                    1 · Claim / Question
                  </span>
                  <p className="text-sm font-medium text-zinc-900 mt-2 leading-relaxed">
                    {activeDemo.claimText}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-700">
                  {activeDemo.gateRule}
                </div>
              </div>

              {/* Step 2: Gate & Locator */}
              <div className="lg:col-span-3 rounded-2xl bg-white border border-zinc-200 p-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-blue-800">
                    2 · Gate & Locator
                  </span>
                  <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200">
                    <div className="text-[10px] font-mono text-zinc-600">MATCH SCORE</div>
                    <div className="text-xs font-mono font-bold text-zinc-950 mt-0.5">
                      {activeDemo.matchScoreLabel}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-zinc-50 border border-zinc-200">
                    <div className="text-[10px] font-mono text-zinc-600">GATE SIGNAL</div>
                    <div className="text-xs font-mono font-semibold text-zinc-900 mt-0.5">
                      {activeDemo.logprobLabel}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-zinc-100 text-[11px] font-mono text-zinc-800 break-all">
                  {activeDemo.locatorLabel}
                </div>
              </div>

              {/* Step 3: Source Snippet */}
              <div className="lg:col-span-5 rounded-2xl bg-[#0F172A] text-[#F8FAFC] p-4 flex flex-col justify-between border border-slate-800">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#93C5FD]">
                    3 · Source AST Snippet
                  </span>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-[#F8FAFC]">
                    <HighlightedExcerpt
                      text={activeDemo.sourceExcerpt}
                      highlight={activeDemo.highlightedSpan}
                    />
                  </p>
                </div>
                <p className="mt-4 pt-3 border-t border-slate-700 text-xs text-[#CBD5E1] leading-relaxed">
                  {activeDemo.explanation}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: 7-Agent Pipeline Visual */}
      <section
        id="how-it-works"
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[#F7F7F5] text-zinc-900 border-b border-zinc-200"
      >
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-800">
              7-AGENT REGIMENT PIPELINE
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-zinc-950">
              Scout through Envoy: seven specialized deterministic stages.
            </h2>
            <p className="text-sm sm:text-base text-zinc-700 leading-relaxed">
              BERT separates OCR rescue, classification, temporal tracking, risk scoring,
              structured fact extraction, conflict resolution, and verified synthesis into
              checkpointed stages you can pause and steer mid-run.
            </p>
          </div>

          <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {PIPELINE_AGENTS.map((agent, idx) => (
              <li
                key={agent.name}
                data-testid={`pipeline-agent-${agent.name.toLowerCase()}`}
                className="rounded-2xl bg-white border border-zinc-200 p-4 flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-blue-800">
                      {agent.step}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200">
                      {agent.modelTier === "Vision SLM" ? "Vision" : "Text"}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950 mt-2">
                    {agent.name}
                  </h3>
                  <div className="text-xs font-medium text-blue-800 mt-0.5">
                    {agent.role}
                  </div>
                  <p className="text-xs text-zinc-700 mt-2 leading-relaxed">{agent.detail}</p>
                </div>
                <div className="mt-4 pt-2.5 border-t border-zinc-100 text-[10px] font-mono text-zinc-600 flex items-center justify-between">
                  <span>{idx < 6 ? `Next: ${PIPELINE_AGENTS[idx + 1].name}` : "Terminal Gate"}</span>
                  {idx < 6 && <ArrowRight size={11} />}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* SECTION 4: Verification Gate Explained */}
      <section
        id="security-gate"
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-white text-zinc-900 border-b border-zinc-200"
      >
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-800">
              VERIFICATION GATE &amp; STATUS SEPARATION
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-zinc-950">
              Why rapidfuzz &ge;97%, logprob &ge;0.92, and human statuses stay strictly separated.
            </h2>
            <p className="text-sm sm:text-base text-zinc-700 leading-relaxed">
              Passing automated synthesis requires deterministic proof. Any human edits, legal
              counsel escalations, or N/A markings are recorded transparently without inflating
              machine-verified scores.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VERIFICATION_GATE_PILLARS.map((pillar) => (
              <article
                key={pillar.id}
                className="rounded-2xl bg-[#F8FAFC] border border-zinc-200 p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-blue-800">
                    <Lock size={13} />
                    <span>{pillar.tag}</span>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-950 mt-2">
                    {pillar.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-700 mt-2 leading-relaxed">
                    {pillar.summary}
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-zinc-200 text-[11px] font-mono text-zinc-700">
                  {pillar.contractNote}
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* SECTION 5: Use Cases (Keyboard-Accessible Accordions) */}
      <section
        id="use-cases"
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[#1D4ED8] text-white"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-100">
              BERT USE CASES
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-white">
              Built for messy compliance corpora across four native formats.
            </h2>
            <p className="text-sm text-blue-50 leading-relaxed">
              Select any workflow to inspect how BERT parses source geometry, anchors locators,
              and routes edge cases to human reviewers.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void handleDemoLaunch()}
                className="inline-flex items-center gap-2 py-2.5 px-5 rounded-full bg-white text-[#1E3A8A] hover:bg-blue-50 text-xs font-semibold shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <span>Inspect 4-Doc Demo in Workspace</span>
                <ArrowRight size={14} />
              </button>
            </div>
          </div>

          <div className="lg:col-span-7 space-y-3">
            {USE_CASES.map((uc, idx) => {
              const isOpen = expandedUseCase === idx;
              const panelId = `use-case-panel-${uc.id}`;
              return (
                <div
                  key={uc.id}
                  className="rounded-2xl bg-[#173DB0] border border-blue-400/50 overflow-hidden"
                >
                  <button
                    type="button"
                    data-testid={`use-case-toggle-${uc.id}`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setExpandedUseCase(isOpen ? null : idx)}
                    className="w-full text-left p-4 sm:p-5 hover:bg-[#1E40AF] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-white text-[#1E3A8A] font-mono text-[10px] font-bold shrink-0">
                          {uc.formatBadge}
                        </span>
                        <span className="font-semibold text-sm sm:text-base text-white">
                          {uc.title}
                        </span>
                      </div>
                      <ChevronDown
                        size={16}
                        className={`text-white shrink-0 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                    <p className="text-xs sm:text-sm text-blue-50 mt-1.5 leading-snug">
                      {uc.summary}
                    </p>
                  </button>

                  {isOpen && (
                    <div
                      id={panelId}
                      data-testid={`use-case-panel-${uc.id}`}
                      className="px-4 pb-4 sm:px-5 sm:pb-5 pt-3 border-t border-blue-300/40 bg-[#133294] space-y-2"
                    >
                      <p className="text-xs sm:text-sm text-white leading-relaxed">
                        {uc.detail}
                      </p>
                      <div className="text-[11px] font-mono text-blue-100">
                        {uc.locatorExample}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 6: Security & Local Mode */}
      <section
        id="local-mode"
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[#F7F7F5] text-zinc-900 border-b border-zinc-200"
      >
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-blue-800">
              SECURITY &amp; LOCAL-FIRST ARCHITECTURE
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-zinc-950">
              Local SQLite, deterministic offline fallback, and cryptographic auditability.
            </h2>
            <p className="text-sm sm:text-base text-zinc-700 leading-relaxed">
              Run BERT directly on your workstation or air-gapped node with SQLite async storage,
              local vLLM endpoints, or the built-in deterministic simulator—with no mandatory
              external cloud upload.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {LOCAL_MODE_GUARANTEES.map((item, idx) => {
              const Icon = idx === 0 ? Cpu : idx === 1 ? Database : HardDrive;
              return (
                <article
                  key={item.id}
                  className="rounded-2xl bg-white border border-zinc-200 p-6 flex flex-col justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="font-mono text-[11px] font-bold text-blue-800">
                        {item.tag}
                      </span>
                      <Icon size={16} className="text-blue-800" />
                    </div>
                    <h3 className="text-base font-semibold text-zinc-950">{item.title}</h3>
                    <p className="text-xs sm:text-sm text-zinc-700 mt-2 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                  <div className="mt-5 pt-3 border-t border-zinc-200 text-[11px] font-mono text-zinc-700">
                    {item.artifactNote}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 7: Footer */}
      <footer className="py-10 px-4 sm:px-8 md:px-10 lg:px-14 bg-white text-zinc-800 border-t border-zinc-200">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span className="font-mono text-xs font-bold text-zinc-950">
                BERT · Evidence-Verified Document Intelligence
              </span>
            </div>
            <p className="text-xs text-zinc-700 leading-relaxed max-w-sm">
              Inspired by Marshal Louis-Alexandre Berthier. Every answer is backed by verbatim
              source quotes (&ge;97% rapidfuzz match) or escalated to human triage.
            </p>
            <div className="text-[11px] font-mono text-zinc-600">
              SQLite Async · Local vLLM / Offline Fallback · SHA-256 Audit Ledger
            </div>
          </div>

          <div className="md:col-span-4 space-y-2">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-700">
              Page Sections
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => scrollToSection("hero")}
                className="text-zinc-800 hover:text-blue-800 underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                Overview
              </button>
              {LANDING_NAV_ITEMS.map((navItem) => (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={() => scrollToSection(navItem.id)}
                  className="text-zinc-800 hover:text-blue-800 underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  {navItem.label}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 space-y-2">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-zinc-700">
              Application Routes
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <Link
                to="/workspace"
                className="text-blue-800 hover:text-blue-950 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                Workspace
              </Link>
              <Link
                to="/triage"
                className="text-blue-800 hover:text-blue-950 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                Triage Queue
              </Link>
              <Link
                to="/results"
                className="text-blue-800 hover:text-blue-950 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                Results Report
              </Link>
              <Link
                to="/results?tab=audit"
                className="inline-flex items-center gap-1 text-blue-800 hover:text-blue-950 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
              >
                <ShieldCheck size={12} />
                <span>Audit Ledger</span>
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
