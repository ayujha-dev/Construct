import {
  ArrowRight,
  Bot,
  Check,
  Command,
  FileJson,
  FileSpreadsheet,
  FileText,
  Pause,
  Play,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  extractRealFiles,
  mergeStagedFiles,
  prefersReducedMotion,
  removeStagedFileAt,
  type StagedFileItem,
} from "../../../lib/landingContent";
import { useBertStore } from "../../../store/useBertStore";
import { HERO_CLAIM_DEMOS } from "../homeData";

interface HeroEvidenceSectionProps {
  onOpenCommandPalette: () => void;
}

export function HeroEvidenceSection({ onOpenCommandPalette }: HeroEvidenceSectionProps) {
  const navigate = useNavigate();
  const { uploadFiles, loadDemo, workspaceId } = useBertStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stagedFiles, setStagedFiles] = useState<StagedFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLaunching, setIsLaunching] = useState(false);

  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const [activeClaimIdx, setActiveClaimIdx] = useState(0);
  const [isAutoCycling, setIsAutoCycling] = useState<boolean>(() => !prefersReducedMotion());
  const [isHoverPaused, setIsHoverPaused] = useState(false);
  const [pulsePhase, setPulsePhase] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (matches: boolean) => {
      setReducedMotion(matches);
      if (matches) setIsAutoCycling(false);
    };
    sync(mql.matches);
    const handler = (event: MediaQueryListEvent) => sync(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!isAutoCycling || isHoverPaused || reducedMotion) return;
    const timer = window.setTimeout(() => {
      setActiveClaimIdx((prev) => (prev + 1) % HERO_CLAIM_DEMOS.length);
    }, 4800);
    return () => window.clearTimeout(timer);
  }, [activeClaimIdx, isAutoCycling, isHoverPaused, reducedMotion]);

  useEffect(() => {
    if (reducedMotion) {
      setPulsePhase(false);
      return;
    }
    setPulsePhase(true);
    const timer = window.setTimeout(() => {
      setPulsePhase(false);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [activeClaimIdx, reducedMotion]);

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

  const handleLaunchCopilot = () => {
    const ws = useBertStore.getState().workspaceId || workspaceId || "default";
    navigate(`/workspace?workspace=${encodeURIComponent(ws)}`);
  };

  const hasStagedFiles = stagedFiles.length > 0;
  const activeClaim = HERO_CLAIM_DEMOS[activeClaimIdx] ?? HERO_CLAIM_DEMOS[0];

  const FormatIcon =
    activeClaim.format === "PDF"
      ? FileText
      : activeClaim.format === "JSON"
        ? FileJson
        : FileSpreadsheet;

  return (
    <section
      id="hero"
      className="relative z-10 overflow-hidden pt-20 pb-14 sm:pt-24 sm:pb-16 lg:py-22 px-4 sm:px-8 md:px-10 lg:px-14 bg-transparent text-[var(--text-primary)]"
    >
      <div className="relative z-10 w-full max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
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
                        <span className="font-medium text-[var(--text-primary)] truncate" title={f.name}>
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
            <div className="space-y-2 py-3 border-t border-[var(--border-subtle)] text-xs">
              <div className="flex items-center justify-between py-1.5 px-2.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)]">
                <span className="font-medium">Pipeline</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)] tabular-nums">
                  7-Agent Pipeline
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

            {/* Primary & Secondary CTAs */}
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
                <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
              </button>

              <div className="flex flex-wrap items-center justify-center gap-2 pt-0.5">
                <button
                  type="button"
                  data-testid="landing-demo-link"
                  disabled={isLaunching}
                  onClick={() => void handleDemoLaunch()}
                  className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] border border-[var(--accent-brand-border)] hover:opacity-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Sparkles size={12} />
                  <span>Load demo case</span>
                </button>
                <button
                  type="button"
                  data-testid="landing-copilot-cta"
                  onClick={handleLaunchCopilot}
                  className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full text-xs font-semibold text-[var(--text-primary)] bg-[var(--bg-sunken)] border border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  <Bot size={12} />
                  <span>Launch Live Copilot</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Headline + Live Document-to-Evidence Demo */}
        <div className="lg:col-span-7 space-y-5 text-center lg:text-left min-w-0">
          <div className="flex flex-wrap items-center justify-center lg:justify-between gap-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono border bg-[var(--bg-surface)] text-[var(--accent-brand-ink)] border-[var(--border-subtle)] shadow-xs">
              <span className="w-2 h-2 rounded-full bg-[var(--accent-brand)]" aria-hidden="true" />
              <span>ShieldStaff · DETERMINISTIC EVIDENCE VERIFICATION</span>
            </div>

            <button
              type="button"
              data-testid="hero-command-palette-trigger"
              onClick={onOpenCommandPalette}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono border bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)] shadow-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <Command size={12} className="text-[var(--accent-brand-ink)]" />
              <span>Quick Jump</span>
              <kbd className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[10px] font-semibold">
                ⌘K
              </kbd>
            </button>
          </div>

          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08] text-[var(--text-primary)]">
            Drop files.{" "}
            <span className="italic font-normal text-[var(--accent-brand-ink)]">
              Verify every line.
            </span>
          </h1>

          <p className="max-w-2xl text-base sm:text-lg leading-relaxed mx-auto lg:mx-0 text-[var(--text-secondary)]">
            Every answer is tied to a source quote or flagged for review. Missing, stale, or
            low-confidence evidence fails closed to human triage instead of guessing.
          </p>

          {/* Interactive Live Document-to-Evidence Demo */}
          <div
            data-testid="hero-evidence-playground"
            onMouseEnter={() => setIsHoverPaused(true)}
            onMouseLeave={() => setIsHoverPaused(false)}
            onFocus={() => setIsHoverPaused(true)}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                setIsHoverPaused(false);
              }
            }}
            className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 sm:p-5 shadow-xl text-left space-y-4"
          >
            {/* Header & Cycle Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-[var(--border-subtle)]">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-[var(--status-verified-ink)] shrink-0" />
                <span className="font-mono text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
                  Live Document-to-Evidence Trace
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="hero-demo-cycle-toggle"
                  disabled={reducedMotion}
                  onClick={() => setIsAutoCycling((prev) => !prev)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-[11px] font-mono font-semibold text-[var(--text-primary)] disabled:opacity-60 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                >
                  {isAutoCycling && !reducedMotion ? <Pause size={11} /> : <Play size={11} />}
                  <span>
                    {reducedMotion ? "Static" : isAutoCycling ? "Auto" : "Paused"}
                  </span>
                </button>
              </div>
            </div>

            {/* Clickable Highlighted Claim Pills */}
            <div className="space-y-2">
              <div className="text-[11px] font-mono text-[var(--text-secondary)]">
                Click any highlighted claim to animate its source locator:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {HERO_CLAIM_DEMOS.map((claim, idx) => {
                  const selected = idx === activeClaimIdx;
                  return (
                    <button
                      key={claim.id}
                      type="button"
                      data-testid={`hero-claim-btn-${claim.format.toLowerCase()}`}
                      aria-pressed={selected}
                      onClick={() => {
                        setIsAutoCycling(false);
                        setActiveClaimIdx(idx);
                      }}
                      className={`text-left p-2.5 rounded-2xl border transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                        selected
                          ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] border-[var(--accent-brand)] shadow-sm"
                          : "bg-[var(--bg-sunken)] text-[var(--text-primary)] border-[var(--border-subtle)] hover:border-[var(--accent-brand-border)]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span
                          className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            selected
                              ? "bg-[var(--accent-brand-hover)] text-white"
                              : "bg-[var(--bg-surface)] text-[var(--accent-brand-ink)] border border-[var(--border-subtle)]"
                          }`}
                        >
                          {claim.format}
                        </span>
                        <span
                          className={`font-mono text-[10px] tabular-nums ${
                            selected ? "text-white" : "text-[var(--text-secondary)]"
                          }`}
                        >
                          0{idx + 1}
                        </span>
                      </div>
                      <div className="text-xs font-semibold mt-1.5 truncate">
                        {claim.claimChip}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Claim + Animated Source Highlight Stage */}
            <div
              data-testid="hero-evidence-stage"
              data-active-format={activeClaim.format}
              className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-3.5 sm:p-4 space-y-3"
            >
              {/* Source-Type Chip + Location Label */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span
                    data-testid="hero-source-type-chip"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] font-mono text-[10px] font-bold shrink-0"
                  >
                    <FormatIcon size={11} />
                    <span>{activeClaim.format}</span>
                  </span>
                  <span className="font-mono text-[11px] font-semibold text-[var(--text-primary)] truncate">
                    {activeClaim.sourceFile}
                  </span>
                </div>
                <span
                  data-testid="hero-location-label"
                  className="font-mono text-[11px] font-semibold text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] border border-[var(--accent-brand-border)] px-2 py-0.5 rounded-md tabular-nums"
                >
                  {activeClaim.locationLabel}
                </span>
              </div>

              {/* Claim Quote */}
              <div className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] px-3 py-2 text-xs text-[var(--text-primary)]">
                <span className="font-mono text-[10px] font-bold uppercase text-[var(--accent-brand-ink)] mr-2">
                  Claim:
                </span>
                <span className="font-medium">{activeClaim.claimText}</span>
              </div>

              {/* Animated Format-Specific Source Proof */}
              {activeClaim.format === "PDF" && activeClaim.pdfPreview && (
                <div
                  data-testid="hero-proof-pdf"
                  className="relative rounded-xl border border-[var(--border-strong)] p-3.5 shadow-sm overflow-hidden"
                  style={{ backgroundColor: "var(--pdf-page-bg)", color: "#181715" }}
                >
                  <div className="flex items-center justify-between text-[10px] font-mono pb-2 mb-2 border-b border-[#E2DDD3] text-[#524E47]">
                    <span>{activeClaim.pdfPreview.sectionHeading}</span>
                    <span className="tabular-nums">Page {activeClaim.pdfPreview.pageNumber}</span>
                  </div>
                  <div className="space-y-1.5 text-[11px] leading-relaxed relative">
                    <p className="text-[#524E47]">{activeClaim.pdfPreview.linesBefore}</p>
                    <div
                      className={`relative rounded-lg px-2 py-1.5 border-2 border-[#0D6B50] bg-[#E7F6F0] text-[#0A5740] font-semibold transition-all duration-300 ${
                        pulsePhase ? "ring-4 ring-[#A7DEC9]" : ""
                      }`}
                    >
                      <span>{activeClaim.pdfPreview.highlightedLine}</span>
                      <span className="mt-1 block font-mono text-[10px] text-[#0A5740] tabular-nums">
                        {activeClaim.pdfPreview.bboxLabel}
                      </span>
                    </div>
                    <p className="text-[#524E47]">{activeClaim.pdfPreview.linesAfter}</p>
                  </div>
                </div>
              )}

              {activeClaim.format === "JSON" && activeClaim.jsonPreview && (
                <div
                  data-testid="hero-proof-json"
                  className="rounded-xl bg-[var(--bg-hero)] border border-[#2F4461] p-3.5 font-mono text-[11px] text-[#F4F1EA] space-y-1"
                >
                  <div className="text-[10px] text-[#A8D4F5] pb-1.5 mb-1.5 border-b border-[#2F4461] flex items-center justify-between">
                    <span>CANONICAL JSONPATH STREAM</span>
                    <span>{activeClaim.jsonPreview.jsonPath}</span>
                  </div>
                  {activeClaim.jsonPreview.lines.map((line, idx) => (
                    <div
                      key={idx}
                      className={`px-2 py-0.5 rounded transition-all duration-300 whitespace-pre ${
                        line.isTarget
                          ? `bg-[#36171C] text-[#FF9BA3] border-l-4 border-[#FF9BA3] font-bold ${
                              pulsePhase ? "ring-2 ring-[#FF9BA3]" : ""
                            }`
                          : "text-[#E6E2D8]"
                      }`}
                    >
                      {line.text}
                    </div>
                  ))}
                </div>
              )}

              {activeClaim.format === "XLSX" && activeClaim.xlsxPreview && (
                <div
                  data-testid="hero-proof-xlsx"
                  className="rounded-xl bg-[var(--bg-surface)] border border-[var(--border-strong)] overflow-x-auto"
                >
                  <table className="w-full text-left border-collapse text-[11px]">
                    <thead>
                      <tr className="bg-[var(--bg-sunken)] border-b border-[var(--border-subtle)] font-mono text-[10px] text-[var(--text-secondary)]">
                        {activeClaim.xlsxPreview.headers.map((h) => (
                          <th key={h} className="px-2.5 py-1.5 font-semibold">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {activeClaim.xlsxPreview.rows.map((row) => (
                        <tr
                          key={row.rowNum}
                          className={`border-b last:border-b-0 border-[var(--border-subtle)] transition-colors duration-300 ${
                            row.isTarget
                              ? `bg-[var(--accent-brand-soft)] font-semibold ${
                                  pulsePhase ? "ring-2 ring-inset ring-[var(--accent-brand-ring)]" : ""
                                }`
                              : "bg-[var(--bg-surface)]"
                          }`}
                        >
                          <td className="px-2.5 py-1.5 font-mono tabular-nums text-[var(--accent-brand-ink)]">
                            {row.rowNum}
                          </td>
                          {row.cells.map((cell, cIdx) => (
                            <td key={cIdx} className="px-2.5 py-1.5 text-[var(--text-primary)]">
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)] font-semibold">
                  <ShieldCheck size={11} />
                  <span>{activeClaim.matchBadge}</span>
                </span>
                <span className="text-[var(--text-secondary)]">
                  Persisted AST Locator · Fail-Closed Gate
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
