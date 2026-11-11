import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FileUp,
  Layers,
  Pause,
  Play,
  RotateCcw,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGENTS, AGENT_ROLES, useBertStore } from "../../store/useBertStore";
import type { WorkItem } from "../../types/bert";

export function CopilotStream() {
  const {
    documents,
    workItems,
    events,
    activeJob,
    chatMessages,
    asking,
    pauseJob,
    resumeJob,
    askCopilot,
    uploadFile,
    resolveWorkItem,
    inspectCitation,
  } = useBertStore();

  const [promptInput, setPromptInput] = useState("");
  const [inlineAnswerId, setInlineAnswerId] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamBottomRef = useRef<HTMLDivElement>(null);

  const isRunning = activeJob?.status === "RUNNING";
  const isPaused = activeJob?.status === "PAUSED";
  const currentAgent = activeJob ? AGENTS[activeJob.current_agent_index] : "Scout";
  const currentRole = activeJob ? AGENT_ROLES[activeJob.current_agent_index] : "Vision Rescue";
  const currentNode = (activeJob?.current_node_index ?? 0) + 1;

  // Escalated items requiring human attention
  const escalations = workItems.filter(
    (item) => item.verification_status !== "VERIFIED" || item.priority_tier === "P0_CRITICAL"
  );

  const handleSubmitPrompt = async (textToSubmit?: string) => {
    const text = (textToSubmit || promptInput).trim();
    if (!text) return;

    if (isRunning) {
      // Mid-run instruction: pause, apply, resume
      await resumeJob(text);
      setPromptInput("");
    } else {
      await askCopilot(text);
      setPromptInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmitPrompt();
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void uploadFile(file);
    }
  };

  const handleManualResolve = async (id: string) => {
    if (!manualText.trim()) return;
    await resolveWorkItem(id, "manual_correction", manualText.trim());
    setInlineAnswerId(null);
    setManualText("");
  };

  // Auto-scroll when chat messages or events change
  useEffect(() => {
    streamBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages.length, events.length]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 md:p-8 space-y-8 bg-[#F8F9FA] text-zinc-900">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Attio/Replit Greeting Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 font-ui">
            Review Copilot
          </h1>
          <p className="text-sm text-zinc-500">
            Ask anything about your corpus or steer the active 7-agent regiment with real-time checkpointing.
          </p>
        </div>

        {/* Central Spacious Prompt Composer Box */}
        <div className="rounded-2xl bg-white border border-zinc-200/90 shadow-sm p-4 space-y-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/10">
          <textarea
            rows={3}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              isRunning
                ? "Steer running agents: e.g. 'Focus on liability and uncapped indemnification clauses first'..."
                : "Ask anything about your uploaded files, or give an instruction: e.g. 'What is the liability cap?'..."
            }
            className="w-full resize-none text-sm text-zinc-900 placeholder:text-zinc-400 bg-transparent focus:outline-none"
          />

          {/* Bottom Toolbar inside the Composer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 text-xs">
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.xlsx,.json,.txt"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700 font-medium transition-colors cursor-pointer"
              >
                <FileUp size={13} className="text-zinc-500" />
                <span>+ Upload File</span>
              </button>

              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-600 font-medium">
                <Compass size={13} className="text-zinc-400" />
                <span>B2B Security Playbook</span>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                <ShieldCheck size={13} className="text-emerald-600" />
                <span>7-Agent Strict Gate (≥97%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  onClick={() => void pauseJob()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 font-medium transition-colors cursor-pointer"
                  title="Pause active agent safely"
                >
                  <Pause size={13} />
                  <span>Pause Agent</span>
                </button>
              )}

              {isPaused && (
                <button
                  onClick={() => void resumeJob()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-medium transition-colors cursor-pointer"
                  title="Resume from last checkpoint"
                >
                  <Play size={13} />
                  <span>Resume</span>
                </button>
              )}

              <button
                onClick={() => void handleSubmitPrompt()}
                disabled={!promptInput.trim() || asking}
                className="w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* 5 Quick Workflow Squircles (Replit Image 3 Style) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            {
              icon: FileSpreadsheet,
              label: "Auto-Answer .XLSX",
              prompt: "Auto-answer all rows in the security questionnaire using verified SOC 2 evidence.",
              color: "text-emerald-600 bg-emerald-50 border-emerald-100",
            },
            {
              icon: ShieldAlert,
              label: "Flag Critical Risks",
              prompt: "Expose all P0 Critical risks, uncapped liabilities, and open AWS IAM wildcard rules.",
              color: "text-rose-600 bg-rose-50 border-rose-100",
            },
            {
              icon: AlertCircle,
              label: "Verify Scan Readability",
              prompt: "Verify OCR confidence across physical scan pages and highlight degraded stamp annotations.",
              color: "text-amber-600 bg-amber-50 border-amber-100",
            },
            {
              icon: Clock,
              label: "Check Policy Conflicts",
              prompt: "Detect contradictions between 2023 and 2026 policies, enforcing latest supersession.",
              color: "text-purple-600 bg-purple-50 border-purple-100",
            },
            {
              icon: Sparkles,
              label: "Executive Summary",
              prompt: "Generate an Envoy executive compliance briefing with inline verbatim citations.",
              color: "text-blue-600 bg-blue-50 border-blue-100",
            },
          ].map((item) => (
            <button
              key={item.label}
              onClick={() => handleSubmitPrompt(item.prompt)}
              className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs hover:shadow-sm hover:border-zinc-300 transition-all text-center gap-2 cursor-pointer group"
            >
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${item.color} group-hover:scale-105 transition-transform`}>
                <item.icon size={18} />
              </div>
              <span className="text-xs font-medium text-zinc-700 group-hover:text-zinc-950 leading-tight">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Clickable Example Prompt Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400 font-medium">Try asking:</span>
          {[
            "What is the liability cap?",
            "Are there conflicts between 2023 and 2026 policies?",
            "Show all items needing human review",
          ].map((ex) => (
            <button
              key={ex}
              onClick={() => handleSubmitPrompt(ex)}
              className="px-3 py-1 rounded-full bg-white border border-zinc-200/80 hover:border-zinc-300 text-zinc-600 hover:text-zinc-900 transition-colors cursor-pointer shadow-2xs"
            >
              “{ex}”
            </button>
          ))}
        </div>

        {/* Safe Interrupt & Resume Banner (When user paused or gave steer instruction) */}
        {isPaused && (
          <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs flex items-center justify-between shadow-xs">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <Pause size={16} />
              </div>
              <div>
                <strong className="block font-semibold">
                  ⏸ Safely paused at Agent {(activeJob?.current_agent_index ?? 0) + 1} ({currentAgent}) on Node {currentNode}.
                </strong>
                <span className="text-amber-800">
                  Checkpoint saved. Type an instruction in the box above to steer or click Resume.
                </span>
              </div>
            </div>
            <button
              onClick={() => void resumeJob()}
              className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium shrink-0 cursor-pointer shadow-2xs transition-colors"
            >
              Resume Execution
            </button>
          </div>
        )}

        {/* Live Transparent Agent Activity Feed & Human Escalation Cards */}
        <div className="space-y-4 pt-4 border-t border-zinc-200/80">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-500 uppercase tracking-wider font-mono">
            <span>Agent Telemetry & Verification Stream</span>
            <span>{events.length} Recorded Steps</span>
          </div>

          {/* Render Human Escalation Cards (OCR <90% or Insufficient Evidence) */}
          {escalations.map((item) => (
            <div
              key={item.id}
              className="p-5 rounded-2xl bg-[#FEF2F2] border border-[#FECACA] shadow-sm text-xs space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-mono text-[10px] font-bold">
                    P0 CRITICAL ESCALATION
                  </span>
                  <span className="font-semibold text-rose-950 font-ui">
                    {item.category}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-rose-700 font-medium">
                  {item.verification_status}
                </span>
              </div>

              <div className="text-sm font-semibold text-rose-950">
                {item.prompt_or_question}
              </div>

              <p className="text-rose-800 leading-relaxed font-serif text-xs bg-white/80 p-3 rounded-xl border border-rose-200">
                {item.fluent_output}
              </p>

              {/* Inline input for manual override if opened */}
              {inlineAnswerId === item.id ? (
                <div className="space-y-2 pt-2 border-t border-rose-200">
                  <input
                    type="text"
                    value={manualText}
                    onChange={(e) => setManualText(e.target.value)}
                    placeholder="Enter verified manual answer or confirmation note..."
                    className="w-full px-3 py-2 rounded-lg bg-white border border-rose-300 text-xs focus:outline-none focus:ring-1 focus:ring-rose-500"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleManualResolve(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs cursor-pointer"
                    >
                      Save & Verify Answer
                    </button>
                    <button
                      onClick={() => setInlineAnswerId(null)}
                      className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 text-xs cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                /* 3 High-Visibility Action Buttons */
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    onClick={() => {
                      setInlineAnswerId(item.id);
                      setManualText(item.fluent_output.includes("Insufficient") ? "" : item.fluent_output);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-900 font-medium transition-colors cursor-pointer shadow-2xs"
                  >
                    ✏️ Type Manual Answer / Override
                  </button>

                  <button
                    onClick={() =>
                      resolveWorkItem(
                        item.id,
                        "approve",
                        "Accepted Vision Rescue transcription with OCR confidence flag."
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors cursor-pointer shadow-2xs"
                  >
                    ✓ Accept Vision Rescue Text
                  </button>

                  <button
                    onClick={() =>
                      resolveWorkItem(
                        item.id,
                        "counsel",
                        "Flagged for Legal Review and excluded from auto-certification."
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-900 text-white font-medium transition-colors cursor-pointer shadow-2xs"
                  >
                    ⚖️ Flag for Legal & Skip
                  </button>
                </div>
              )}
            </div>
          ))}

          {/* User Chat Question & Answer Cards */}
          {chatMessages.map((msg) => (
            <div key={msg.id} className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-2 text-xs">
              <div className="flex items-center justify-between text-zinc-500">
                <span className="font-semibold text-zinc-900">User Query: “{msg.prompt}”</span>
                <span className="font-mono text-[10px]">
                  {msg.status === "VERIFIED" ? (
                    <span className="text-emerald-600 font-bold">VERIFIED ({msg.match_score}%)</span>
                  ) : (
                    <span className="text-rose-600 font-bold">INSUFFICIENT EVIDENCE</span>
                  )}
                </span>
              </div>
              <p className="text-zinc-800 text-xs leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-100">
                {msg.answer || "Processing response through 7-agent verification gate..."}
              </p>
              {msg.citations.length > 0 && (
                <div className="pt-2 space-y-1.5" role="group" aria-label="Verified source citations">
                  <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-blue-600" />
                    <span>Verified Citations ({msg.citations.length}):</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {msg.citations.map((citation, idx) => {
                      const targetDoc = documents.find(
                        (d) => d.filename === citation.document_filename || d.id === msg.document_id
                      );
                      return (
                        <button
                          key={`${citation.ast_node_id}-${idx}`}
                          type="button"
                          onClick={() => {
                            inspectCitation(
                              targetDoc?.id ?? citation.document_filename,
                              citation.page_number ?? 1,
                              citation.bounding_box,
                              citation.ast_node_id
                            );
                          }}
                          aria-label={`Inspect citation in ${citation.document_filename}, page ${citation.page_number ?? 1}, confidence ${Math.round(citation.confidence_score)}%`}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50/90 hover:bg-blue-100/90 border border-blue-200/90 text-blue-800 text-[11px] font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 shadow-2xs hover:shadow-xs text-left"
                        >
                          <ShieldCheck size={12} className="text-blue-600 shrink-0" />
                          <span className="font-semibold truncate max-w-[180px]" title={citation.document_filename}>
                            {citation.document_filename}
                          </span>
                          <span className="font-mono text-[10px] text-blue-600/90 shrink-0">
                            (p. {citation.page_number ?? 1})
                          </span>
                          <span className="font-mono text-[10px] bg-blue-200/60 px-1.5 py-0.5 rounded text-blue-900 shrink-0">
                            {Math.round(citation.confidence_score)}% match
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Agent Activity Cards (Scout -> Envoy) */}
          {events.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white border border-zinc-200/70 text-zinc-400 text-xs">
              No agent events yet. Click <strong>Load Investor Demo Case</strong> or upload a document to start.
            </div>
          ) : (
            events.slice(-15).map((ev, i) => {
              const agentName = ev.agent_name || "Envoy";
              const targetDoc = documents.find((d) => d.id === ev.document_id)?.filename || "SOC2_Type_II_2026.pdf";
              const isComplete = ev.status === "completed";

              return (
                <div
                  key={`${ev.type}-${i}`}
                  className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs text-xs space-y-2 hover:border-zinc-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold">
                        {agentName.slice(0, 1)}
                      </span>
                      <strong className="font-semibold text-zinc-900">{agentName}</strong>
                      <span className="text-zinc-400 font-mono text-[10px]">·</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 font-mono text-[10px] text-zinc-600">
                        {targetDoc}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isComplete
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {isComplete ? "VERIFIED SAFE" : "INSPECTION ACTIVE"}
                      </span>
                    </div>
                  </div>

                  <p className="text-zinc-700 text-xs leading-relaxed">
                    {ev.message || `Agent executed atomic verification pass on ${targetDoc}.`}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400 pt-1">
                    <span>Node Index: {(ev.node_index ?? 0) + 1}</span>
                    <span>rapidfuzz gate: ≥97% match</span>
                  </div>
                </div>
              );
            })
          )}

          <div ref={streamBottomRef} />
        </div>
      </div>
    </div>
  );
}
