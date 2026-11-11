import {
  ArrowRight,
  Bot,
  ChevronRight,
  Layers,
  Pause,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { BentoCanvas } from "../components/copilot/BentoCanvas";
import { CopilotStream } from "../components/copilot/CopilotStream";
import { RightInspectorDrawer } from "../components/copilot/RightInspectorDrawer";
import { AGENTS, AGENT_ROLES, useBertStore } from "../store/useBertStore";

export function WorkspacePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const modeParam = searchParams.get("mode");
  const isCanvas = modeParam === "canvas";

  const {
    documents,
    workItems,
    activeJob,
    pauseJob,
    resumeJob,
    refresh,
  } = useBertStore();

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isRunning = activeJob?.status === "RUNNING";
  const isPaused = activeJob?.status === "PAUSED";
  const agentIndex = activeJob?.current_agent_index ?? 0;
  const currentAgent = AGENTS[Math.min(agentIndex, AGENTS.length - 1)];
  const currentRole = AGENT_ROLES[Math.min(agentIndex, AGENT_ROLES.length - 1)];
  const activeDoc = activeJob?.current_document_id
    ? documents.find((d) => d.id === activeJob.current_document_id)
    : documents[0];
  const currentNode = (activeJob?.current_node_index ?? 0) + 1;

  // Caution summary counters
  const criticalCount = workItems.filter((i) => i.priority_tier === "P0_CRITICAL").length;
  const needsHumanCount = workItems.filter((i) => i.verification_status !== "VERIFIED").length;
  const verifiedCount = workItems.filter(
    (i) => i.verification_status === "VERIFIED" && i.priority_tier !== "P0_CRITICAL"
  ).length;

  // Plain-English live agent telemetry
  const telemetryText = isRunning
    ? `Agent ${agentIndex + 1} (${currentAgent}) is inspecting ${activeDoc?.filename || "source"} (Node ${currentNode})`
    : isPaused
    ? `Paused at Agent ${agentIndex + 1} (${currentAgent}) · Reviewer direction active`
    : "7-Agent Regiment Standby · Evidence Gate Online";

  const setMode = (mode: "stream" | "canvas") => {
    if (mode === "canvas") {
      setSearchParams({ mode: "canvas" });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-white select-none">
      {/* 1. Top Context Bar (Attio / Replit Hybrid) */}
      <header className="h-13 border-b border-zinc-200/90 bg-white px-4 flex items-center justify-between shrink-0 z-20">
        {/* Left: Active project breadcrumb + Segmented Mode Switcher Pill */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs text-zinc-500 font-medium">
            <span className="text-zinc-900 font-semibold">Enterprise Review</span>
            <ChevronRight size={13} className="text-zinc-400" />
            <span className="truncate max-w-36 text-zinc-600">
              {activeDoc?.filename || "Corpus"}
            </span>
          </div>

          {/* Replit-style Segmented Switcher Pill (Design | Build) */}
          <div className="flex p-0.5 rounded-lg bg-zinc-100 border border-zinc-200/80 text-xs font-medium">
            <button
              onClick={() => setMode("stream")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                !isCanvas
                  ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <Bot size={13} />
              <span>Copilot Stream</span>
            </button>

            <button
              onClick={() => setMode("canvas")}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition-all cursor-pointer ${
                isCanvas
                  ? "bg-white text-zinc-950 font-semibold shadow-2xs"
                  : "text-zinc-600 hover:text-zinc-950"
              }`}
            >
              <Layers size={13} />
              <span>Bento Canvas</span>
            </button>
          </div>
        </div>

        {/* Center: Live Agent Telemetry Pill */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-50 border border-zinc-200/90 text-xs">
          <span
            className={`w-2 h-2 rounded-full ${
              isRunning ? "bg-blue-600 animate-ping" : isPaused ? "bg-amber-500" : "bg-emerald-500"
            }`}
          />
          <span className="text-zinc-700 font-medium font-ui truncate max-w-sm">
            {telemetryText}
          </span>
          {isRunning && (
            <button
              onClick={() => void pauseJob()}
              className="ml-1 text-[11px] font-semibold text-amber-700 hover:text-amber-800 bg-amber-100/70 hover:bg-amber-100 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              ⏸ Pause Agent
            </button>
          )}
          {isPaused && (
            <button
              onClick={() => void resumeJob()}
              className="ml-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-100/70 hover:bg-emerald-100 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              ▶ Resume
            </button>
          )}
        </div>

        {/* Right: Caution Summary Pills + Results Button */}
        <div className="flex items-center gap-2">
          <div className="hidden xl:flex items-center gap-1.5 text-xs font-mono">
            {criticalCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 font-semibold">
                {criticalCount} Critical
              </span>
            )}
            {needsHumanCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">
                {needsHumanCount} Human Input
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">
              {verifiedCount} Verified
            </span>
          </div>

          <button
            onClick={() => navigate("/results")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-medium transition-colors cursor-pointer shadow-2xs"
          >
            <span>View Results Report</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </header>

      {/* 2. Main Content Split Stage */}
      <div className="flex-1 flex overflow-hidden">
        {/* Center Stage: Mode A or Mode B */}
        {isCanvas ? <BentoCanvas /> : <CopilotStream />}

        {/* Right Inspector Drawer (Replit Image 4 + Attio Image 5) */}
        <RightInspectorDrawer />
      </div>
    </div>
  );
}
