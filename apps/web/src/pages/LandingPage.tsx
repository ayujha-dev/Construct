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
      <mark className="bg-[#F7BE68] text-[#181715] px-1 py-0.5 rounded font-semibold">
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
    <div className="w-full overflow-x-clip bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* SECTION 1: Hero & Interactive Intake Card */}
      <section
        id="hero"
        className="relative bg-[var(--bg-hero)] text-[#F4F1EA] overflow-hidden pt-20 pb-14 sm:pt-24 sm:pb-16 lg:py-24 px-4 sm:px-8 md:px-10 lg:px-14"
      >
        <Particles
          particleColors={["#F4F1EA", "#82C4EC", "#C8C2B6"]}
          particleCount={140}
          speed={0.07}
          connections={true}
          moveParticlesOnHover={true}
          hoverEffect="parallax"
          className="opacity-70"
        />

        <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Clean Dossier Intake Card */}
          <div className="lg:col-span-5 flex justify-center lg:justify-start min-w-0">
            <div
              data-testid="landing-intake-card"
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`w-full max-w-md rounded-3xl bg-[var(--bg-surface)] p-5 sm:p-6 shadow-2xl text-[var(--text-primary)] border transition-colors ${
                isDragging
                  ? "border-[var(--accent-brand-ring)] ring-4 ring-[var(--accent-brand-soft)]"
                  : "border-[var(--border-subtle)]"
              }`}
            >
              {/* Card Header */}
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-6 h-6 rounded-full bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] flex items-center justify-center text-xs font-semibold shrink-0">
                    {hasStagedFiles ? <Check size={13} strokeWidth={2.5} /> : <UploadCloud size={13} />}
                  </div>
                  <span
                    data-testid="staged-files-count"
                    className="text-xs font-semibold text-[var(--text-primary)] truncate tabular-nums"
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
                  className="sr-only focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                />

                <div className="flex items-center gap-2 shrink-0">
                  {hasStagedFiles && (
                    <button
                      type="button"
                      data-testid="clear-staged-files"
                      onClick={clearAllStagedFiles}
                      className="inline-flex items-center gap-1 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--status-danger-ink)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded px-1.5 py-0.5"
                    >
                      <Trash2 size={12} />
                      <span>Clear</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] hover:opacity-90 border border-[var(--accent-brand-border)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded-lg px-2 py-1"
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
                    className="w-full rounded-2xl border-2 border-dashed border-[var(--border-strong)] bg-[var(--bg-sunken)] hover:border-[var(--accent-brand-border)] px-4 py-5 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                  >
                    <UploadCloud size={22} className="mx-auto text-[var(--accent-brand-ink)] mb-2" />
                    <span className="block text-xs font-semibold text-[var(--text-primary)]">
                      Drop PDFs, .xlsx questionnaires, or .json IAM configs
                    </span>
                    <span className="block text-[11px] text-[var(--text-secondary)] mt-1">
                      Supports .pdf, .xlsx, .json, .txt, .md · Multi-file batch upload
                    </span>
                  </button>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-0.5">
                    {stagedFiles.map((f, i) => (
                      <div
                        key={f.id}
                        data-testid="staged-file-item"
                        className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-xs"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-subtle)] font-bold text-[var(--text-primary)] shrink-0">
                            {f.typeLabel}
                          </span>
                          <span
                            className="font-medium text-[var(--text-primary)] truncate"
                            title={f.name}
                          >
                            {f.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[var(--text-secondary)] font-mono text-[11px] tabular-nums">
                            {f.sizeLabel}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeStagedFile(i)}
                            aria-label={`Remove ${f.name}`}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--status-danger-ink)] hover:bg-[var(--status-danger-soft)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
              <div className="space-y-2.5 py-3 border-t border-[var(--border-subtle)] text-xs">
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <span className="font-medium">Pipeline</span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                    7-Agent Regiment
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <span className="font-medium">Verification Gate</span>
                  <span className="font-mono text-[11px] text-[var(--status-verified-ink)] font-semibold tabular-nums">
                    rapidfuzz &ge;97% · logprob &ge;0.92
                  </span>
                </div>
                <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                  <span className="font-medium">Audit Ledger</span>
                  <span className="font-mono text-[11px] text-[var(--text-secondary)]">
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
                  className="w-full py-3.5 px-4 rounded-full bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70 text-[var(--accent-brand-contrast)] text-sm font-semibold shadow-lg flex items-center justify-center gap-2 transition-colors cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] focus-visible:ring-offset-2"
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
                    className="inline-flex items-center justify-center py-1 px-2 text-xs font-semibold text-[var(--accent-brand-ink)] hover:opacity-80 underline underline-offset-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                  >
                    Try Demo Corpus
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: High-Contrast Value Proposition */}
          <div className="lg:col-span-7 space-y-6 text-center lg:text-left min-w-0">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--bg-hero-card)] text-[#B8DCF2] border border-[#2F4461] text-xs font-mono">
              <span className="w-2 h-2 rounded-full bg-[#82C4EC]" />
              <span>BERT · DETERMINISTIC EVIDENCE VERIFICATION</span>
            </div>

            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08] text-[#F4F1EA]">
              Drop files.{" "}
              <span className="italic font-normal text-[#A8D4F5]">Verify every line.</span>
            </h1>

            <p className="max-w-2xl text-base sm:text-lg text-[#E6E2D8] leading-relaxed mx-auto lg:mx-0">
              Every answer is tied to a verbatim source quote (&ge;97% rapidfuzz match) or
              flagged for human review. Missing or low-confidence evidence fails closed to
              human triage.
            </p>

            {/* Verifiable Guarantees Strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left">
              <div className="p-3.5 rounded-2xl bg-[var(--bg-hero-card)] border border-[#2F4461]">
                <div className="text-[11px] font-mono font-semibold text-[#A8D4F5]">
                  QUOTE GATE
                </div>
                <p className="text-xs text-[#F4F1EA] mt-1 leading-snug tabular-nums">
                  &ge;97% rapidfuzz match + &ge;0.92 critical-entity logprob check.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[var(--bg-hero-card)] border border-[#2F4461]">
                <div className="text-[11px] font-mono font-semibold text-[#A8D4F5]">
                  SHA-256 LEDGER
                </div>
                <p className="text-xs text-[#F4F1EA] mt-1 leading-snug">
                  Every ingested file is SHA-256 checksummed into an immutable Audit Ledger.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-[var(--bg-hero-card)] border border-[#2F4461]">
                <div className="text-[11px] font-mono font-semibold text-[#A8D4F5]">
                  FAIL-CLOSED TRIAGE
                </div>
                <p className="text-xs text-[#F4F1EA] mt-1 leading-snug">
                  Unsupported claims route to human triage instead of unverified prose.
                </p>
              </div>
            </div>

            {/* Verbatim Proof Preview Card */}
            <div className="max-w-xl mx-auto lg:mx-0 p-4 rounded-2xl bg-[var(--bg-hero-card)] border border-[#2F4461] text-left text-xs space-y-2 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[#E6E2D8] text-[11px] font-mono tabular-nums">
                <span>SOC2_Type_II_2026.pdf · Page 14</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#0A5740] text-[#E7F6F0] border border-[#1F7A5D] tabular-nums">
                  <ShieldCheck size={11} aria-hidden="true" />
                  <span>99.4% rapidfuzz Match</span>
                </span>
              </div>
              <p className="text-[#F4F1EA] font-serif text-sm italic leading-snug">
                “Access control requires multifactor authentication for all privileged accounts
                across production environments.”
              </p>
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#C8C2B6] font-mono tabular-nums">
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
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--bg-surface)] text-[var(--text-primary)] border-b border-[var(--border-subtle)]"
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
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                INTERACTIVE CLAIM &rarr; SOURCE EVIDENCE DEMO
              </span>
              <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
                Inspect how every claim resolves to source proof—or fails closed.
              </h2>
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
                Step through real BERT verification cases: SOC 2 MFA, AWS IAM{" "}
                <code className="px-1 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs font-mono">
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
                className="p-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                className="p-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-sunken)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
              >
                <ChevronRight size={16} />
              </button>
              <button
                type="button"
                data-testid="evidence-demo-autoplay-toggle"
                onClick={() => setIsAutoPlaying((prev) => !prev)}
                disabled={reducedMotion}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[var(--border-strong)] bg-[var(--bg-sunken)] hover:border-[var(--accent-brand-border)] disabled:opacity-60 text-xs font-semibold text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                  className={`text-left p-3 rounded-2xl border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    selected
                      ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] border-[var(--accent-brand)] shadow-sm"
                      : "bg-[var(--bg-sunken)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        selected
                          ? "bg-[var(--accent-brand-hover)] text-white"
                          : "bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-primary)]"
                      }`}
                    >
                      {item.sourceFormat}
                    </span>
                    <span
                      className={`text-[10px] font-mono tabular-nums ${
                        selected ? "text-white/90" : "text-[var(--text-secondary)]"
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
            className="rounded-3xl border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-5 sm:p-7 space-y-5 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
              <div>
                <div className="text-[11px] font-mono font-semibold text-[var(--text-secondary)] tabular-nums">
                  {activeDemo.sourceFile} · {activeDemo.locatorLabel}
                </div>
                <h3 className="font-serif text-xl font-semibold text-[var(--text-primary)] mt-0.5">
                  {activeDemo.claimTitle}
                </h3>
              </div>

              <span
                data-testid="evidence-demo-status"
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold border ${
                  activeDemo.status === "VERIFIED"
                    ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
                    : "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]"
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
              <div className="lg:col-span-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                    1 · Claim / Question
                  </span>
                  <p className="text-sm font-medium text-[var(--text-primary)] mt-2 leading-relaxed">
                    {activeDemo.claimText}
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                  {activeDemo.gateRule}
                </div>
              </div>

              {/* Step 2: Gate & Locator */}
              <div className="lg:col-span-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between">
                <div className="space-y-3">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                    2 · Gate & Locator
                  </span>
                  <div className="p-2.5 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] font-mono text-[var(--text-muted)]">MATCH SCORE</div>
                    <div className="text-xs font-mono font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
                      {activeDemo.matchScoreLabel}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)]">
                    <div className="text-[10px] font-mono text-[var(--text-muted)]">GATE SIGNAL</div>
                    <div className="text-xs font-mono font-semibold text-[var(--text-primary)] mt-0.5 tabular-nums">
                      {activeDemo.logprobLabel}
                    </div>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)] break-all">
                  {activeDemo.locatorLabel}
                </div>
              </div>

              {/* Step 3: Source Snippet */}
              <div className="lg:col-span-5 rounded-2xl bg-[var(--bg-hero)] text-[#F4F1EA] p-4 flex flex-col justify-between border border-[var(--border-strong)]">
                <div>
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#A8D4F5]">
                    3 · Source AST Snippet
                  </span>
                  <p className="mt-2 font-mono text-xs leading-relaxed text-[#F4F1EA]">
                    <HighlightedExcerpt
                      text={activeDemo.sourceExcerpt}
                      highlight={activeDemo.highlightedSpan}
                    />
                  </p>
                </div>
                <p className="mt-4 pt-3 border-t border-[#2F4461] text-xs text-[#C8C2B6] leading-relaxed">
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
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--bg-canvas)] text-[var(--text-primary)] border-b border-[var(--border-subtle)]"
      >
        <div className="max-w-6xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
              7-AGENT REGIMENT PIPELINE
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
              Scout through Envoy: seven specialized deterministic stages.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
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
                className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between shadow-xs"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] font-bold text-[var(--accent-brand-ink)] tabular-nums">
                      {agent.step}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)]">
                      {agent.modelTier === "Vision SLM" ? "Vision" : "Text"}
                    </span>
                  </div>
                  <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)] mt-2">
                    {agent.name}
                  </h3>
                  <div className="text-xs font-medium text-[var(--accent-brand-ink)] mt-0.5">
                    {agent.role}
                  </div>
                  <p className="text-xs text-[var(--text-secondary)] mt-2 leading-relaxed">
                    {agent.detail}
                  </p>
                </div>
                <div className="mt-4 pt-2.5 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-muted)] flex items-center justify-between">
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
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--bg-surface)] text-[var(--text-primary)] border-b border-[var(--border-subtle)]"
      >
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
              VERIFICATION GATE &amp; STATUS SEPARATION
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
              Why rapidfuzz &ge;97%, logprob &ge;0.92, and human statuses stay strictly separated.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Passing automated synthesis requires deterministic proof. Any human edits, legal
              counsel escalations, or N/A markings are recorded transparently without inflating
              machine-verified scores.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VERIFICATION_GATE_PILLARS.map((pillar) => (
              <article
                key={pillar.id}
                className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-mono font-bold text-[var(--accent-brand-ink)]">
                    <Lock size={13} />
                    <span>{pillar.tag}</span>
                  </div>
                  <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)] mt-2">
                    {pillar.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                    {pillar.summary}
                  </p>
                </div>
                <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
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
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--accent-brand)] text-white"
      >
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
          <div className="lg:col-span-5 space-y-4">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#D2E8F7]">
              BERT USE CASES
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-white">
              Built for messy compliance corpora across four native formats.
            </h2>
            <p className="text-sm text-[#EBF2F7] leading-relaxed">
              Select any workflow to inspect how BERT parses source geometry, anchors locators,
              and routes edge cases to human reviewers.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={() => void handleDemoLaunch()}
                className="inline-flex items-center gap-2 py-2.5 px-5 rounded-full bg-white text-[#14384F] hover:bg-[#EBF2F7] text-xs font-semibold shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
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
                  className="rounded-2xl bg-[#123146] border border-white/25 overflow-hidden"
                >
                  <button
                    type="button"
                    data-testid={`use-case-toggle-${uc.id}`}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setExpandedUseCase(isOpen ? null : idx)}
                    className="w-full text-left p-4 sm:p-5 hover:bg-[#173D57] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="px-2 py-0.5 rounded bg-white text-[#14384F] font-mono text-[10px] font-bold shrink-0">
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
                    <p className="text-xs sm:text-sm text-[#EBF2F7] mt-1.5 leading-snug">
                      {uc.summary}
                    </p>
                  </button>

                  {isOpen && (
                    <div
                      id={panelId}
                      data-testid={`use-case-panel-${uc.id}`}
                      className="px-4 pb-4 sm:px-5 sm:pb-5 pt-3 border-t border-white/20 bg-[#0D2536] space-y-2"
                    >
                      <p className="text-xs sm:text-sm text-white leading-relaxed">
                        {uc.detail}
                      </p>
                      <div className="text-[11px] font-mono text-[#CFE6F7]">
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
        className="scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--bg-canvas)] text-[var(--text-primary)] border-b border-[var(--border-subtle)]"
      >
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="max-w-3xl space-y-3">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
              SECURITY &amp; LOCAL-FIRST ARCHITECTURE
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
              Local SQLite, deterministic offline fallback, and cryptographic auditability.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
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
                  className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-6 flex flex-col justify-between shadow-xs"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="font-mono text-[11px] font-bold text-[var(--accent-brand-ink)]">
                        {item.tag}
                      </span>
                      <Icon size={16} className="text-[var(--accent-brand-ink)]" />
                    </div>
                    <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)]">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-2 leading-relaxed">
                      {item.detail}
                    </p>
                  </div>
                  <div className="mt-5 pt-3 border-t border-[var(--border-subtle)] text-[11px] font-mono text-[var(--text-secondary)]">
                    {item.artifactNote}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      {/* SECTION 7: Footer */}
      <footer className="py-10 px-4 sm:px-8 md:px-10 lg:px-14 bg-[var(--bg-surface)] text-[var(--text-secondary)] border-t border-[var(--border-subtle)]">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          <div className="md:col-span-5 space-y-2">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-[var(--status-verified-ink)] shrink-0" />
              <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                BERT · Evidence-Verified Document Intelligence
              </span>
            </div>
            <p className="text-xs text-[var(--text-secondary)] leading-relaxed max-w-sm">
              Inspired by Marshal Louis-Alexandre Berthier. Every answer is backed by verbatim
              source quotes (&ge;97% rapidfuzz match) or escalated to human triage.
            </p>
            <div className="text-[11px] font-mono text-[var(--text-muted)]">
              SQLite Async · Local vLLM / Offline Fallback · SHA-256 Audit Ledger
            </div>
          </div>

          <div className="md:col-span-4 space-y-2">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Page Sections
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <button
                type="button"
                onClick={() => scrollToSection("hero")}
                className="text-[var(--text-secondary)] hover:text-[var(--accent-brand-ink)] underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
              >
                Overview
              </button>
              {LANDING_NAV_ITEMS.map((navItem) => (
                <button
                  key={navItem.id}
                  type="button"
                  onClick={() => scrollToSection(navItem.id)}
                  className="text-[var(--text-secondary)] hover:text-[var(--accent-brand-ink)] underline underline-offset-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                >
                  {navItem.label}
                </button>
              ))}
            </div>
          </div>

          <div className="md:col-span-3 space-y-2">
            <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Application Routes
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
              <Link
                to="/workspace"
                className="text-[var(--accent-brand-ink)] hover:opacity-80 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
              >
                Workspace
              </Link>
              <Link
                to="/triage"
                className="text-[var(--accent-brand-ink)] hover:opacity-80 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
              >
                Triage Queue
              </Link>
              <Link
                to="/results"
                className="text-[var(--accent-brand-ink)] hover:opacity-80 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
              >
                Results Report
              </Link>
              <Link
                to="/results?tab=audit"
                className="inline-flex items-center gap-1 text-[var(--accent-brand-ink)] hover:opacity-80 font-medium underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
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
