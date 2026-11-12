import {
  ArrowRight,
  CheckCircle2,
  Circle,
  Loader2,
  Play,
  RotateCcw,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../../../lib/landingContent";
import { PIPELINE_STAGE_SPECS } from "../homeData";

type StageState = "pending" | "running" | "done";

export function PipelineExplorerSection() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [runCursor, setRunCursor] = useState<number>(-1); // -1 = idle, 0..6 = running idx, 7 = all done
  const [reducedMotion, setReducedMotion] = useState<boolean>(() => prefersReducedMotion());
  const stepButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = (matches: boolean) => setReducedMotion(matches);
    sync(mql.matches);
    const handler = (event: MediaQueryListEvent) => sync(event.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (!isPlaying) return;
    if (runCursor < 0) {
      setRunCursor(0);
      setSelectedIdx(0);
      return;
    }
    if (runCursor >= PIPELINE_STAGE_SPECS.length) {
      setIsPlaying(false);
      return;
    }

    const delayMs = reducedMotion ? 220 : 750;
    const timer = window.setTimeout(() => {
      const next = runCursor + 1;
      setRunCursor(next);
      if (next < PIPELINE_STAGE_SPECS.length) {
        setSelectedIdx(next);
      } else {
        setSelectedIdx(PIPELINE_STAGE_SPECS.length - 1);
        setIsPlaying(false);
      }
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [isPlaying, runCursor, reducedMotion]);

  const getStageState = (idx: number): StageState => {
    if (runCursor < 0) return "pending";
    if (idx < runCursor) return "done";
    if (idx === runCursor && isPlaying) return "running";
    if (runCursor >= PIPELINE_STAGE_SPECS.length) return "done";
    return "pending";
  };

  const handlePlay = () => {
    setRunCursor(0);
    setSelectedIdx(0);
    setIsPlaying(true);
  };

  const handleReset = () => {
    setIsPlaying(false);
    setRunCursor(-1);
    setSelectedIdx(0);
  };

  const handleStepKeyDown = (idx: number, e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      const next = (idx + 1) % PIPELINE_STAGE_SPECS.length;
      setSelectedIdx(next);
      stepButtonRefs.current[next]?.focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      const prev = (idx - 1 + PIPELINE_STAGE_SPECS.length) % PIPELINE_STAGE_SPECS.length;
      setSelectedIdx(prev);
      stepButtonRefs.current[prev]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      setSelectedIdx(0);
      stepButtonRefs.current[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      const last = PIPELINE_STAGE_SPECS.length - 1;
      setSelectedIdx(last);
      stepButtonRefs.current[last]?.focus();
    }
  };

  const activeAgent = PIPELINE_STAGE_SPECS[selectedIdx] ?? PIPELINE_STAGE_SPECS[0];
  const completedCount =
    runCursor < 0
      ? 0
      : runCursor >= PIPELINE_STAGE_SPECS.length
        ? PIPELINE_STAGE_SPECS.length
        : runCursor;

  return (
    <section
      id="pipeline-explorer"
      className="relative z-10 scroll-mt-20 py-16 sm:py-20 px-4 sm:px-8 md:px-10 lg:px-14 text-[var(--text-primary)] border-b border-[var(--border-subtle)] bg-[var(--bg-canvas)]/75"
    >
      <span id="how-it-works" className="scroll-mt-20 block h-0 w-0 overflow-hidden" aria-hidden="true" />
      <div className="max-w-6xl mx-auto space-y-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div className="max-w-3xl space-y-2.5">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
              02 · 7-AGENT PIPELINE EXPLORER
            </span>
            <h2 className="font-serif text-3xl sm:text-4xl font-semibold text-[var(--text-primary)]">
              Scout through Envoy: step a dossier through seven deterministic stages.
            </h2>
            <p className="text-sm sm:text-base text-[var(--text-secondary)] leading-relaxed">
              Hover, tap, or use arrow keys across any stage to inspect its inputs, checkpoint rules,
              and outputs—or press Play to trace a sample dossier end-to-end.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              data-testid="pipeline-play-btn"
              onClick={handlePlay}
              disabled={isPlaying}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-70 text-[var(--accent-brand-contrast)] text-xs font-semibold shadow-sm cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <Play size={13} />
              <span>
                {isPlaying
                  ? "Running Dossier…"
                  : runCursor >= PIPELINE_STAGE_SPECS.length
                    ? "Replay Document Run"
                    : "Play Document Run"}
              </span>
            </button>
            <button
              type="button"
              data-testid="pipeline-reset-btn"
              onClick={handleReset}
              aria-label="Reset pipeline run"
              className="inline-flex items-center gap-1 px-3 py-2 rounded-full border border-[var(--border-strong)] bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] text-xs font-semibold text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </button>
          </div>
        </div>

        {/* Interactive 7-Stage Stepper */}
        <ol
          role="list"
          aria-label="7-Agent Review Pipeline Stepper"
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3"
        >
          {PIPELINE_STAGE_SPECS.map((agent, idx) => {
            const state = getStageState(idx);
            const isSelected = idx === selectedIdx;

            const stateBadgeStyle =
              state === "done"
                ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
                : state === "running"
                  ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] border-[var(--accent-brand)]"
                  : "bg-[var(--bg-sunken)] text-[var(--text-secondary)] border-[var(--border-subtle)]";

            return (
              <li
                key={agent.name}
                data-testid={`pipeline-agent-${agent.name.toLowerCase()}`}
                data-stage-state={state}
                className="flex"
              >
                <button
                  ref={(el) => {
                    stepButtonRefs.current[idx] = el;
                  }}
                  type="button"
                  aria-pressed={isSelected}
                  onMouseEnter={() => {
                    if (!isPlaying) setSelectedIdx(idx);
                  }}
                  onFocus={() => {
                    if (!isPlaying) setSelectedIdx(idx);
                  }}
                  onClick={() => setSelectedIdx(idx)}
                  onKeyDown={(e) => handleStepKeyDown(idx, e)}
                  className={`w-full text-left rounded-2xl border p-4 flex flex-col justify-between transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                    isSelected
                      ? "bg-[var(--bg-surface)] border-[var(--accent-brand)] ring-2 ring-[var(--accent-brand-soft)] shadow-md"
                      : "bg-[var(--bg-surface)] border-[var(--border-subtle)] hover:border-[var(--border-strong)] shadow-xs"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11px] font-bold text-[var(--accent-brand-ink)] tabular-nums">
                        {agent.step}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${stateBadgeStyle}`}
                      >
                        {state === "done" ? (
                          <CheckCircle2 size={10} />
                        ) : state === "running" ? (
                          <Loader2 size={10} className={reducedMotion ? "" : "spin"} />
                        ) : (
                          <Circle size={10} />
                        )}
                        <span>{state}</span>
                      </span>
                    </div>

                    <h3 className="font-serif text-lg font-semibold text-[var(--text-primary)] mt-2.5">
                      {agent.name}
                    </h3>
                    <div className="text-xs font-medium text-[var(--accent-brand-ink)] mt-0.5">
                      {agent.role}
                    </div>
                  </div>

                  <div className="mt-4 pt-2.5 border-t border-[var(--border-subtle)] text-[10px] font-mono text-[var(--text-secondary)] flex items-center justify-between">
                    <span>{idx < 6 ? `-> ${PIPELINE_STAGE_SPECS[idx + 1].name}` : "Terminal Gate"}</span>
                    {idx < 6 && <ArrowRight size={11} />}
                  </div>
                </button>
              </li>
            );
          })}
        </ol>

        {/* Active Stage Input / Output Inspector */}
        <div
          data-testid="pipeline-detail-panel"
          className="rounded-3xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] p-5 sm:p-6 shadow-sm space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[var(--border-subtle)]">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)] tabular-nums">
                Stage {activeAgent.step} · {activeAgent.name}
              </span>
              <span className="text-sm font-semibold text-[var(--text-primary)]">
                {activeAgent.role}
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs font-mono text-[var(--text-secondary)]">
              <span>{activeAgent.modelTier}</span>
              <span>·</span>
              <span className="tabular-nums font-semibold text-[var(--accent-brand-ink)]">
                {completedCount}/7 completed
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--accent-brand-ink)]">
                Stage Input
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-primary)] mt-1.5 leading-relaxed">
                {activeAgent.inputLabel}
              </p>
            </div>

            <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--status-verified-ink)]">
                Stage Output
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-primary)] mt-1.5 leading-relaxed">
                {activeAgent.outputLabel}
              </p>
            </div>

            <div className="rounded-2xl bg-[var(--bg-sunken)] border border-[var(--border-subtle)] p-4">
              <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                Checkpoint &amp; Trace
              </div>
              <p className="text-xs text-[var(--text-primary)] mt-1.5 leading-relaxed">
                {activeAgent.checkpointRule}
              </p>
              <div className="mt-2 pt-2 border-t border-[var(--border-subtle)] font-mono text-[11px] text-[var(--accent-brand-ink)]">
                {activeAgent.sampleTrace}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
