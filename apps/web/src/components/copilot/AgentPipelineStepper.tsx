import {
  AlertCircle,
  Check,
  ChevronRight,
  Circle,
  Pause,
  Play,
  RefreshCw,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  computeTotalPipelineElapsedMs,
  derivePipelineBadgeState,
  formatElapsedMs,
  parseTimestampMs,
} from "../../lib/pipelineTelemetry";
import { useBertStore } from "../../store/useBertStore";

export type { PipelineRunBadgeState } from "../../lib/pipelineTelemetry";
export { derivePipelineBadgeState };

export function AgentPipelineStepper() {
  const {
    activeJob,
    agentSteps,
    agentRuns,
    wsStatus,
    backendAvailable,
    isSimulating,
    hasCompletedRun,
    jobStartedAt,
    jobCompletedAt,
    pauseJob,
    resumeJob,
  } = useBertStore();

  const [selectedStepIdx, setSelectedStepIdx] = useState<number | null>(null);
  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());

  const hasRunningStep = useMemo(
    () =>
      agentSteps.some((s) => s.status === "running") &&
      activeJob?.status !== "PAUSED" &&
      activeJob?.status !== "COMPLETED" &&
      activeJob?.status !== "FAILED",
    [agentSteps, activeJob?.status]
  );

  // Use requestAnimationFrame ONLY while an agent step is actively running (zero periodic intervals, zero idle ticks)
  useEffect(() => {
    if (!hasRunningStep) return;
    let rafId = 0;
    let lastTick = 0;
    const tick = (frameTime: number) => {
      if (frameTime - lastTick >= 120) {
        lastTick = frameTime;
        setLiveNowMs(Date.now());
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [hasRunningStep]);

  const badgeState = derivePipelineBadgeState({
    activeJobStatus: activeJob?.status ?? null,
    hasCompletedRun,
    isSimulating,
    agentSteps,
    agentRunsCount: agentRuns.length,
  });

  const totalElapsedMs = useMemo(
    () => computeTotalPipelineElapsedMs(agentSteps, jobStartedAt, jobCompletedAt),
    [agentSteps, jobStartedAt, jobCompletedAt]
  );
  const totalElapsedLabel = formatElapsedMs(totalElapsedMs);

  const runningAgent = agentSteps.find((s) => s.status === "running");
  const isRunning = badgeState === "Running";
  const isPaused = badgeState === "Paused";
  const selectedStep =
    selectedStepIdx !== null ? agentSteps[selectedStepIdx] ?? null : null;

  const badgeStyle =
    badgeState === "Running"
      ? "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border-[var(--accent-brand-border)]"
      : badgeState === "Paused"
        ? "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
        : badgeState === "Completed"
          ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
          : badgeState === "Failed"
            ? "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]"
            : "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]";

  const wsLabel =
    wsStatus === "connected"
      ? "WS Live"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "WS Connecting"
        : backendAvailable
          ? "API Online"
          : "Local Mode";

  const wsBadgeStyle =
    wsStatus === "connected"
      ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border-[var(--status-verified-border)]"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]"
        : "bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border-[var(--status-neutral-border)]";

  return (
    <section
      aria-label="7-Agent Pipeline Stepper"
      data-testid="agent-pipeline-stepper"
      className="border-b border-[var(--border-subtle)] bg-[var(--bg-sunken)] px-3 lg:px-4 py-2 shrink-0 relative z-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Job Status + Pause/Resume + WS Status */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="status"
            aria-live="polite"
            data-testid="pipeline-status-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold tabular-nums ${badgeStyle}`}
          >
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full ${
                badgeState === "Running"
                  ? "bg-[var(--accent-brand)] animate-ping"
                  : badgeState === "Paused"
                    ? "bg-[var(--status-warning-solid)]"
                    : badgeState === "Completed"
                      ? "bg-[var(--status-verified-solid)]"
                      : badgeState === "Failed"
                        ? "bg-[var(--status-danger-solid)]"
                        : "bg-[var(--status-neutral-solid)]"
              }`}
            />
            <span>
              {badgeState}
              {badgeState === "Running" && runningAgent ? ` · ${runningAgent.agentName}` : ""}
              {badgeState === "Completed" && totalElapsedLabel ? ` · ${totalElapsedLabel}` : ""}
            </span>
          </div>

          {isRunning && activeJob && (
            <button
              type="button"
              data-testid="stepper-pause-btn"
              onClick={() => void pauseJob()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--status-warning-soft)] hover:opacity-90 border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <Pause size={11} />
              <span>Pause</span>
            </button>
          )}

          {isPaused && activeJob && (
            <button
              type="button"
              data-testid="stepper-resume-btn"
              onClick={() => void resumeJob()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-[var(--status-verified-soft)] hover:opacity-90 border border-[var(--status-verified-border)] text-[var(--status-verified-ink)] text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <Play size={11} />
              <span>Resume</span>
            </button>
          )}

          <span
            data-testid="workspace-ws-status"
            title={`WebSocket status: ${wsStatus}`}
            className={`hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-mono font-semibold ${wsBadgeStyle}`}
          >
            {wsStatus === "connected" ? <Wifi size={10} /> : <WifiOff size={10} />}
            <span>{wsLabel}</span>
          </span>
        </div>

        {/* Right / Main: 7-Agent Horizontal Stepper */}
        <ol
          aria-label="Regiment stages"
          className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 min-w-0"
        >
          {agentSteps.map((step, idx) => {
            const startedMs = parseTimestampMs(step.startedAt);
            const stepElapsed =
              step.status === "running" && startedMs !== null
                ? Math.max(1, liveNowMs - startedMs)
                : step.elapsedMs;
            const elapsedStr = formatElapsedMs(stepElapsed);
            const isSelected = selectedStepIdx === idx;

            const pillClasses =
              step.status === "done"
                ? "bg-[var(--status-verified-soft)] border-[var(--status-verified-border)] text-[var(--status-verified-ink)] hover:opacity-95"
                : step.status === "running"
                  ? "bg-[var(--accent-brand-soft)] border-[var(--accent-brand-border)] text-[var(--accent-brand-ink)] ring-1 ring-[var(--accent-brand-ring)]"
                  : step.status === "failed"
                    ? "bg-[var(--status-danger-soft)] border-[var(--status-danger-border)] text-[var(--status-danger-ink)]"
                    : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]";

            const tooltip = `${step.agentName} (${step.role}) · ${step.status}${
              elapsedStr ? ` · ${elapsedStr}` : ""
            }${step.summary ? ` — ${step.summary}` : ""}`;

            return (
              <li key={step.agentName} className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  data-testid={`agent-step-${step.agentName.toLowerCase()}`}
                  data-step-status={step.status}
                  aria-expanded={isSelected}
                  aria-label={`${step.agentName} (${step.role}): ${step.status}${
                    elapsedStr ? `, ${elapsedStr}` : ""
                  }`}
                  title={tooltip}
                  onClick={() => setSelectedStepIdx(isSelected ? null : idx)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${pillClasses} ${
                    isSelected ? "shadow-xs ring-2 ring-[var(--accent-brand-ring)]" : ""
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      step.status === "done"
                        ? "bg-[var(--status-verified-solid)] text-white"
                        : step.status === "running"
                          ? "bg-[var(--accent-brand)] text-[var(--accent-brand-contrast)]"
                          : step.status === "failed"
                            ? "bg-[var(--status-danger-solid)] text-white"
                            : "bg-[var(--bg-sunken)] text-[var(--text-secondary)]"
                    }`}
                  >
                    {step.status === "done" ? (
                      <Check size={10} strokeWidth={3} />
                    ) : step.status === "running" ? (
                      <RefreshCw size={9} className="spin" />
                    ) : step.status === "failed" ? (
                      <AlertCircle size={10} />
                    ) : (
                      <Circle size={7} />
                    )}
                  </span>

                  <span className="font-semibold">{step.agentName}</span>

                  {elapsedStr && (
                    <span className="font-mono text-[10px] opacity-90 tabular-nums">
                      {elapsedStr}
                    </span>
                  )}
                </button>

                {idx < agentSteps.length - 1 && (
                  <ChevronRight
                    size={12}
                    className="text-[var(--text-muted)] shrink-0"
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Expandable Step Details Drawer */}
      {selectedStep && (
        <div
          data-testid="stepper-detail-panel"
          className="mt-2 p-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-xs text-xs flex flex-wrap items-start justify-between gap-3"
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-[var(--text-primary)] font-semibold tabular-nums">
                {selectedStep.index + 1}. {selectedStep.agentName}
              </strong>
              <span className="text-[var(--text-secondary)] font-medium">
                ({selectedStep.role})
              </span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] text-[var(--text-primary)] border border-[var(--border-subtle)] uppercase font-semibold">
                {selectedStep.status}
              </span>
              {selectedStep.elapsedMs !== null && (
                <span className="font-mono text-[10px] text-[var(--text-secondary)] tabular-nums">
                  {formatElapsedMs(selectedStep.elapsedMs)}
                </span>
              )}
              {selectedStep.documentFilename && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border border-[var(--accent-brand-border)]">
                  {selectedStep.documentFilename}
                </span>
              )}
            </div>
            <p className="text-[var(--text-secondary)]">
              {selectedStep.summary || `${selectedStep.role} awaiting execution.`}
            </p>
            {(selectedStep.inputHash || selectedStep.outputHash) && (
              <div className="flex flex-wrap gap-3 font-mono text-[10px] text-[var(--text-muted)]">
                {selectedStep.inputHash && (
                  <span title={selectedStep.inputHash}>
                    in: {selectedStep.inputHash.slice(0, 12)}
                  </span>
                )}
                {selectedStep.outputHash && (
                  <span title={selectedStep.outputHash}>
                    out: {selectedStep.outputHash.slice(0, 12)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSelectedStepIdx(null)}
            className="px-2 py-1 rounded-md bg-[var(--bg-sunken)] hover:bg-[var(--border-subtle)] text-[var(--text-primary)] text-[11px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
}
