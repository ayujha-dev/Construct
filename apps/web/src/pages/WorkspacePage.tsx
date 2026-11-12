import {
  ArrowRight,
  Bot,
  ChevronRight,
  Layers,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BentoCanvas } from "../components/copilot/BentoCanvas";
import { CopilotStream } from "../components/copilot/CopilotStream";
import { RightInspectorDrawer } from "../components/copilot/RightInspectorDrawer";
import { AGENTS, useBertStore } from "../store/useBertStore";
import { computeWorkItemMetrics } from "../lib/workItemMetrics";

const MIN_INSPECTOR_WIDTH = 240;
const MAX_INSPECTOR_WIDTH = 600;

function getDefaultInspectorWidth(): number {
  if (typeof window !== "undefined" && window.innerWidth <= 1120) {
    return 340;
  }
  return 384;
}

export function WorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const isCanvas = modeParam === "canvas";

  const {
    documents,
    workItems,
    activeJob,
    corpusStatus,
    selectedFileFilterId,
    selectedDocumentId,
    pauseJob,
    resumeJob,
    refresh,
  } = useBertStore();

  const [inspectorWidth, setInspectorWidth] = useState<number>(getDefaultInspectorWidth);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);

  // Only refresh on WorkspacePage mount if App hasn't already initiated corpus load
  useEffect(() => {
    if (corpusStatus === "idle") {
      void refresh();
    }
  }, [corpusStatus, refresh]);

  // Keep inspector bounded on narrow desktop viewports so center workspace retains >= 400px
  useEffect(() => {
    const onResize = () => {
      const maxAllowed = Math.max(MIN_INSPECTOR_WIDTH, window.innerWidth - 240 - 420);
      setInspectorWidth((prev) => (prev > maxAllowed ? maxAllowed : prev));
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const clampWidth = useCallback(
    (w: number) => Math.max(MIN_INSPECTOR_WIDTH, Math.min(MAX_INSPECTOR_WIDTH, w)),
    []
  );

  const handleSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = inspectorWidth;

    const onMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      setInspectorWidth(clampWidth(startWidth + delta));
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleSplitterKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      setInspectorWidth((w) => clampWidth(w + 10));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      setInspectorWidth((w) => clampWidth(w - 10));
    }
  };

  const isRunning = activeJob?.status === "RUNNING";
  const isPaused = activeJob?.status === "PAUSED";
  const agentIndex = activeJob?.current_agent_index ?? 0;
  const currentAgent = AGENTS[Math.min(agentIndex, AGENTS.length - 1)];

  const activeDocId = selectedFileFilterId || activeJob?.current_document_id || selectedDocumentId;
  const activeDoc = activeDocId ? documents.find((d) => d.id === activeDocId) : documents[0];
  const currentNode = (activeJob?.current_node_index ?? 0) + 1;

  const metrics = computeWorkItemMetrics(workItems);

  const telemetryText = isRunning
    ? `Agent ${agentIndex + 1} (${currentAgent}) is inspecting ${activeDoc?.filename || "source"} (Node ${currentNode})`
    : isPaused
      ? `Paused at Agent ${agentIndex + 1} (${currentAgent}) · Reviewer direction active`
      : "7-Agent Regiment Standby · Evidence Gate Online";

  const setMode = (mode: "stream" | "canvas") => {
    const next = new URLSearchParams(searchParams);
    if (mode === "canvas") {
      next.set("mode", "canvas");
    } else {
      next.delete("mode");
    }
    setSearchParams(next);
  };

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-white">
      {/* 1. Top Context Bar */}
      <header className="h-13 border-b border-zinc-200/90 bg-white px-3 lg:px-4 flex items-center justify-between gap-2 shrink-0 z-20">
        {/* Left: Breadcrumb + Mode Switcher */}
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-zinc-600 font-medium min-w-0">
            <span className="text-zinc-900 font-semibold shrink-0">Enterprise Review</span>
            <ChevronRight size={13} className="text-zinc-500 shrink-0" />
            <span className="truncate max-w-32 text-zinc-700" title={activeDoc?.filename || "Corpus"}>
              {activeDoc?.filename || "Corpus"}
            </span>
          </div>

          <div className="flex p-0.5 rounded-lg bg-zinc-100 border border-zinc-200/80 text-xs font-medium shrink-0">
            <button
              type="button"
              onClick={() => setMode("stream")}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                !isCanvas
                  ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                  : "text-zinc-700 hover:text-zinc-950"
              }`}
            >
              <Bot size={13} />
              <span>Copilot Stream</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("canvas")}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${
                isCanvas
                  ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                  : "text-zinc-700 hover:text-zinc-950"
              }`}
            >
              <Layers size={13} />
              <span>Bento Canvas</span>
            </button>
          </div>
        </div>

        {/* Center: Live Agent Telemetry Pill */}
        <div
          role="status"
          aria-live="polite"
          className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-200/90 text-xs"
        >
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning ? "bg-blue-600 animate-ping" : isPaused ? "bg-amber-600" : "bg-emerald-600"
            }`}
          />
          <span className="text-zinc-800 font-medium font-ui truncate max-w-xs">{telemetryText}</span>
          {isRunning && (
            <button
              type="button"
              onClick={() => void pauseJob()}
              className="ml-1 text-[11px] font-semibold text-amber-900 hover:text-amber-950 bg-amber-100 hover:bg-amber-200 px-2 py-0.5 rounded cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Pause Agent
            </button>
          )}
          {isPaused && (
            <button
              type="button"
              onClick={() => void resumeJob()}
              className="ml-1 text-[11px] font-semibold text-emerald-900 hover:text-emerald-950 bg-emerald-100 hover:bg-emerald-200 px-2 py-0.5 rounded cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Resume
            </button>
          )}
        </div>

        {/* Right: Counters + Inspector Controls + Results Button */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden 2xl:flex items-center gap-1.5 text-xs font-mono" data-testid="workspace-header-metrics">
            {metrics.criticalOpen > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-900 border border-rose-200 font-semibold">
                {metrics.criticalOpen} Critical Open
              </span>
            )}
            {metrics.escalatedLegal > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-950 border border-amber-300 font-semibold">
                {metrics.escalatedLegal} Legal
              </span>
            )}
            {metrics.humanOverride > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-purple-100 text-purple-950 border border-purple-300 font-semibold">
                {metrics.humanOverride} Override
              </span>
            )}
            {metrics.notApplicable > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-900 border border-slate-300 font-semibold">
                {metrics.notApplicable} N/A
              </span>
            )}
            {metrics.unresolved > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-950 border border-amber-200 font-semibold">
                {metrics.unresolved} Human Input
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-950 border border-emerald-200 font-semibold">
              {metrics.machineVerified}/{metrics.total} Verified
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMobileInspectorOpen(true)}
            className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-800 text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <PanelRightOpen size={14} />
            <span>Inspector</span>
          </button>

          <button
            type="button"
            onClick={() => setInspectorCollapsed((prev) => !prev)}
            aria-label={inspectorCollapsed ? "Expand inspector drawer" : "Collapse inspector drawer"}
            title={inspectorCollapsed ? "Expand inspector drawer" : "Collapse inspector drawer"}
            className="hidden md:inline-flex items-center justify-center p-1.5 rounded-lg border border-zinc-200 hover:bg-zinc-100 text-zinc-700 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            {inspectorCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
          </button>

          <button
            type="button"
            onClick={() => navigate("/results")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#18181B] hover:bg-[#27272A] text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span>View Results Report</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* 2. Main Content Split Stage */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        {/* Center Stage */}
        <div className="flex-1 flex min-w-0 overflow-hidden">
          {isCanvas ? <BentoCanvas /> : <CopilotStream />}
        </div>

        {/* Resizable Panel Splitter Handle (Desktop) */}
        {!inspectorCollapsed && (
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize inspector panel"
            aria-valuemin={MIN_INSPECTOR_WIDTH}
            aria-valuemax={MAX_INSPECTOR_WIDTH}
            aria-valuenow={inspectorWidth}
            tabIndex={0}
            data-panel-resize-handle-id="inspector-splitter"
            onMouseDown={handleSplitterMouseDown}
            onKeyDown={handleSplitterKeyDown}
            className="hidden md:flex w-1.5 bg-zinc-100 hover:bg-blue-400 cursor-col-resize items-center justify-center shrink-0 select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <span className="w-0.5 h-8 rounded-full bg-zinc-400" aria-hidden="true" />
          </div>
        )}

        {/* Right Inspector Drawer */}
        {!inspectorCollapsed && (
          <RightInspectorDrawer
            width={inspectorWidth}
            mobileOpen={mobileInspectorOpen}
            onCloseMobile={() => setMobileInspectorOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
