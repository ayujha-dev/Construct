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
      ? "bg-blue-50 text-blue-900 border-blue-200"
      : badgeState === "Paused"
        ? "bg-amber-50 text-amber-950 border-amber-300"
        : badgeState === "Completed"
          ? "bg-emerald-50 text-emerald-950 border-emerald-200"
          : badgeState === "Failed"
            ? "bg-rose-50 text-rose-950 border-rose-300"
            : "bg-zinc-100 text-zinc-800 border-zinc-200";

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
      ? "bg-emerald-50 text-emerald-900 border-emerald-200"
      : wsStatus === "connecting" || wsStatus === "reconnecting"
        ? "bg-amber-50 text-amber-900 border-amber-200"
        : "bg-zinc-100 text-zinc-800 border-zinc-300";

  return (
    <section
      aria-label="7-Agent Pipeline Stepper"
      data-testid="agent-pipeline-stepper"
      className="border-b border-zinc-200/90 bg-zinc-50/80 px-3 lg:px-4 py-2 shrink-0 relative z-10"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Job Status + Pause/Resume + WS Status */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            role="status"
            aria-live="polite"
            data-testid="pipeline-status-badge"
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-semibold ${badgeStyle}`}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                badgeState === "Running"
                  ? "bg-blue-600 animate-ping"
                  : badgeState === "Paused"
                    ? "bg-amber-600"
                    : badgeState === "Completed"
                      ? "bg-emerald-600"
                      : badgeState === "Failed"
                        ? "bg-rose-600"
                        : "bg-zinc-500"
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 text-emerald-950 text-[11px] font-semibold cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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
                ? "bg-emerald-50 border-emerald-300 text-emerald-950 hover:bg-emerald-100"
                : step.status === "running"
                  ? "bg-blue-50 border-blue-400 text-blue-950 ring-1 ring-blue-300 hover:bg-blue-100"
                  : step.status === "failed"
                    ? "bg-rose-50 border-rose-300 text-rose-950 hover:bg-rose-100"
                    : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-100";

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
                  className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${pillClasses} ${
                    isSelected ? "shadow-xs ring-2 ring-blue-600" : ""
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                      step.status === "done"
                        ? "bg-emerald-700 text-white"
                        : step.status === "running"
                          ? "bg-blue-700 text-white"
                          : step.status === "failed"
                            ? "bg-rose-700 text-white"
                            : "bg-zinc-200 text-zinc-700"
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
                    <span className="font-mono text-[10px] text-zinc-700">
                      {elapsedStr}
                    </span>
                  )}
                </button>

                {idx < agentSteps.length - 1 && (
                  <ChevronRight
                    size={12}
                    className="text-zinc-500 shrink-0"
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
          className="mt-2 p-2.5 rounded-xl bg-white border border-zinc-200 shadow-xs text-xs flex flex-wrap items-start justify-between gap-3"
        >
          <div className="space-y-1 min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="text-zinc-950 font-semibold">
                {selectedStep.index + 1}. {selectedStep.agentName}
              </strong>
              <span className="text-zinc-700 font-medium">({selectedStep.role})</span>
              <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-800 border border-zinc-200 uppercase font-semibold">
                {selectedStep.status}
              </span>
              {selectedStep.elapsedMs !== null && (
                <span className="font-mono text-[10px] text-zinc-700">
                  {formatElapsedMs(selectedStep.elapsedMs)}
                </span>
              )}
              {selectedStep.documentFilename && (
                <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200">
                  {selectedStep.documentFilename}
                </span>
              )}
            </div>
            <p className="text-zinc-800">
              {selectedStep.summary || `${selectedStep.role} awaiting execution.`}
            </p>
            {(selectedStep.inputHash || selectedStep.outputHash) && (
              <div className="flex flex-wrap gap-3 font-mono text-[10px] text-zinc-700">
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
            className="px-2 py-1 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-[11px] font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            Close
          </button>
        </div>
      )}
    </section>
  );
}
