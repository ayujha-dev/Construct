import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  FileCheck2,
  Pause,
  Play,
} from "lucide-react";
import { useEffect, useState } from "react";
import { CLAIM_EVIDENCE_DEMOS, prefersReducedMotion } from "../../../lib/landingContent";

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

export function EvidenceDemoSection() {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const [activeDemoIdx, setActiveDemoIdx] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState<boolean>(() => !prefersReducedMotion());
  const [isDemoHovered, setIsDemoHovered] = useState(false);
  const [isDemoFocused, setIsDemoFocused] = useState(false);

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

  const activeDemo = CLAIM_EVIDENCE_DEMOS[activeDemoIdx] ?? CLAIM_EVIDENCE_DEMOS[0];

  return (
    <section
      id="evidence-demo"
      className="relative z-10 scroll-mt-28 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 text-[var(--text-primary)] border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/85 backdrop-blur-[2px]"
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
              01 · CLAIM &rarr; SOURCE EVIDENCE INSPECTOR
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
              Inspect how every claim resolves to source proof—or fails closed.
            </h2>
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              Step through real ShieldStaff verification cases: SOC 2 MFA, AWS IAM{" "}
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
                  (prev) => (prev - 1 + CLAIM_EVIDENCE_DEMOS.length) % CLAIM_EVIDENCE_DEMOS.length
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
                {reducedMotion ? "Reduced Motion" : isAutoPlaying ? "Pause" : "Auto-play"}
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
                      selected ? "text-white" : "text-[var(--text-secondary)]"
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

            <div className="lg:col-span-3 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-4 flex flex-col justify-between">
              <div className="space-y-3">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                  2 · Gate &amp; Locator
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
  );
}
