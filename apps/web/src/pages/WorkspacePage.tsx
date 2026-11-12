import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronRight,
  Layers,
  PanelRightClose,
  PanelRightOpen,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AgentPipelineStepper } from "../components/copilot/AgentPipelineStepper";
import { BentoCanvas } from "../components/copilot/BentoCanvas";
import { CopilotStream } from "../components/copilot/CopilotStream";
import { RightInspectorDrawer } from "../components/copilot/RightInspectorDrawer";
import { computeWorkItemMetrics } from "../lib/workItemMetrics";
import { useBertStore } from "../store/useBertStore";

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

  const activeDocId = selectedFileFilterId || activeJob?.current_document_id || selectedDocumentId;
  const activeDoc = activeDocId ? documents.find((d) => d.id === activeDocId) : documents[0];

  const metrics = computeWorkItemMetrics(workItems);

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
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* 1. Top Context Bar */}
      <header className="h-13 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 lg:px-4 flex items-center justify-between gap-2 shrink-0 z-20">
        {/* Left: Breadcrumb + Mode Switcher */}
        <div className="flex items-center gap-2 lg:gap-3 min-w-0">
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-[var(--text-secondary)] font-medium min-w-0">
            <span className="text-[var(--text-primary)] font-semibold shrink-0">
              Enterprise Review
            </span>
            <ChevronRight size={13} className="text-[var(--text-muted)] shrink-0" />
            <span
              className="truncate max-w-32 text-[var(--text-secondary)] font-mono text-[11px]"
              title={activeDoc?.filename || "Corpus"}
            >
              {activeDoc?.filename || "Corpus"}
            </span>
          </div>

          <div className="flex p-0.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-xs font-medium shrink-0">
            <button
              type="button"
              onClick={() => setMode("stream")}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                !isCanvas
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Bot size={13} />
              <span>Copilot Stream</span>
            </button>

            <button
              type="button"
              onClick={() => setMode("canvas")}
              className={`flex items-center gap-1.5 px-2.5 lg:px-3 py-1 rounded-md transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] ${
                isCanvas
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-2xs border border-[var(--border-subtle)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <Layers size={13} />
              <span>Bento Canvas</span>
            </button>
          </div>
        </div>

        {/* Right: Counters + Inspector Controls + Results Button */}
        <div className="flex items-center gap-2 shrink-0">
          <div
            className="hidden 2xl:flex items-center gap-1.5 text-xs font-mono tabular-nums"
            data-testid="workspace-header-metrics"
          >
            {metrics.criticalOpen > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)] font-semibold tabular-nums">
                <AlertTriangle size={11} aria-hidden="true" />
                <span>{metrics.criticalOpen} Critical Open</span>
              </span>
            )}
            {metrics.escalatedLegal > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] font-semibold tabular-nums">
                <Scale size={11} aria-hidden="true" />
                <span>{metrics.escalatedLegal} Legal</span>
              </span>
            )}
            {metrics.humanOverride > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--status-override-soft)] text-[var(--status-override-ink)] border border-[var(--status-override-border)] font-semibold tabular-nums">
                {metrics.humanOverride} Override
              </span>
            )}
            {metrics.notApplicable > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--status-neutral-soft)] text-[var(--status-neutral-ink)] border border-[var(--status-neutral-border)] font-semibold tabular-nums">
                {metrics.notApplicable} N/A
              </span>
            )}
            {metrics.unresolved > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] font-semibold tabular-nums">
                {metrics.unresolved} Human Input
              </span>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)] font-semibold tabular-nums">
              <ShieldCheck size={11} aria-hidden="true" />
              <span>
                {metrics.machineVerified}/{metrics.total} Verified
              </span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMobileInspectorOpen(true)}
            className="md:hidden flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] text-[var(--text-primary)] text-xs font-medium cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <PanelRightOpen size={14} />
            <span>Inspector</span>
          </button>

          <button
            type="button"
            onClick={() => setInspectorCollapsed((prev) => !prev)}
            aria-label={inspectorCollapsed ? "Expand inspector drawer" : "Collapse inspector drawer"}
            title={inspectorCollapsed ? "Expand inspector drawer" : "Collapse inspector drawer"}
            className="hidden md:inline-flex items-center justify-center p-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:bg-[var(--bg-sunken)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            {inspectorCollapsed ? <PanelRightOpen size={15} /> : <PanelRightClose size={15} />}
          </button>

          <button
            type="button"
            onClick={() => navigate("/results")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] text-[var(--accent-brand-contrast)] text-xs font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <span>View Results Report</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* Persistent 7-Step Agent Pipeline Stepper */}
      <AgentPipelineStepper />

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
            className="hidden md:flex w-1.5 bg-[var(--border-subtle)] hover:bg-[var(--accent-brand)] cursor-col-resize items-center justify-center shrink-0 select-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
          >
            <span className="w-0.5 h-8 rounded-full bg-[var(--text-muted)]" aria-hidden="true" />
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
