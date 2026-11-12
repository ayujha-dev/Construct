import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Clock,
  Compass,
  Copy,
  FileSpreadsheet,
  FileUp,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../../lib/evidenceLocators";
import { AGENTS, useBertStore } from "../../store/useBertStore";
import { CorpusFilterBanner } from "./CorpusFilterBanner";
import { EvidenceLocatorBadge } from "./EvidenceLocatorBadge";

export function CopilotStream() {
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    events,
    activeJob,
    chatMessages,
    asking,
    selectedFileFilterId,
    summaryStatus,
    summaryError,
    undoToast,
    dismissUndoToast,
    pauseJob,
    resumeJob,
    askCopilot,
    requestExecutiveSummaryStream,
    uploadFile,
    resolveWorkItem,
    undoWorkItem,
    inspectCitation,
  } = useBertStore();

  const [promptInput, setPromptInput] = useState("");
  const [inlineAnswerId, setInlineAnswerId] = useState<string | null>(null);
  const [manualText, setManualText] = useState("");
  const [legalDialogId, setLegalDialogId] = useState<string | null>(null);
  const [legalReason, setLegalReason] = useState("Flagged for Legal Review and excluded from auto-certification.");
  const [legalAssignee, setLegalAssignee] = useState("Legal Counsel");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const streamBottomRef = useRef<HTMLDivElement>(null);

  const isRunning = activeJob?.status === "RUNNING";
  const isPaused = activeJob?.status === "PAUSED";
  const currentAgent = activeJob ? AGENTS[activeJob.current_agent_index] : "Scout";
  const currentNode = (activeJob?.current_node_index ?? 0) + 1;

  const filteredDoc = useMemo(
    () => (selectedFileFilterId ? documents.find((d) => d.id === selectedFileFilterId) : undefined),
    [documents, selectedFileFilterId]
  );

  // Escalated & unresolved items filtered cleanly by sidebar selection
  const escalations = useMemo(
    () =>
      workItems.filter((item) => {
        if (selectedFileFilterId && item.document_id !== selectedFileFilterId) return false;
        return item.verification_status !== "VERIFIED";
      }),
    [selectedFileFilterId, workItems]
  );

  const visibleChatMessages = useMemo(
    () =>
      chatMessages.filter((msg) => {
        if (!selectedFileFilterId) return true;
        if (msg.document_id === selectedFileFilterId) return true;
        return msg.citations.some(
          (cit) =>
            cit.locator?.doc_id === selectedFileFilterId ||
            (filteredDoc && cit.document_filename === filteredDoc.filename)
        );
      }),
    [chatMessages, filteredDoc, selectedFileFilterId]
  );

  const visibleEvents = useMemo(
    () =>
      events.filter((ev) => {
        if (!selectedFileFilterId) return true;
        return ev.document_id === selectedFileFilterId;
      }),
    [events, selectedFileFilterId]
  );

  const handleSubmitPrompt = async (textToSubmit?: string) => {
    const text = (textToSubmit || promptInput).trim();
    if (!text) return;

    if (isRunning) {
      await resumeJob(text);
      setPromptInput("");
    } else {
      await askCopilot(text, selectedFileFilterId ?? undefined);
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
    await resolveWorkItem(id, {
      action: "manual_correction",
      correction: manualText.trim(),
    });
    setInlineAnswerId(null);
    setManualText("");
  };

  const handleConfirmLegalFlag = async (id: string) => {
    await resolveWorkItem(id, {
      action: "counsel",
      note: legalReason.trim() || "Flagged for Legal Review.",
      assignee: legalAssignee.trim() || "Legal Counsel",
    });
    setLegalDialogId(null);
  };

  const handleCopyMessage = async (msgId: string, answer: string) => {
    try {
      await navigator.clipboard?.writeText(answer);
      setCopiedMsgId(msgId);
      setTimeout(() => setCopiedMsgId((prev) => (prev === msgId ? null : prev)), 1500);
    } catch {
      /* ignore clipboard refusal in non-secure environments */
    }
  };

  useEffect(() => {
    streamBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [visibleChatMessages.length, visibleEvents.length]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 bg-[#F8F9FA] text-zinc-900">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Undo Toast Notification */}
        {undoToast && (
          <div
            role="status"
            aria-live="polite"
            data-testid="undo-toast"
            className="p-3 rounded-xl bg-[#18181B] text-white text-xs flex items-center justify-between gap-3 shadow-lg"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Scale size={14} className="text-amber-400 shrink-0" />
              <span className="truncate">
                {undoToast.action}: {undoToast.label}
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => void undoWorkItem(undoToast.workItemId)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-400 hover:bg-amber-300 text-zinc-950 font-bold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <RotateCcw size={12} />
                <span>Undo</span>
              </button>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={dismissUndoToast}
                className="p-1 rounded hover:bg-zinc-800 text-zinc-300 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <X size={13} />
              </button>
            </div>
          </div>
        )}

        <CorpusFilterBanner />

        {/* Greeting Header */}
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-950 font-ui">
            Review Copilot
          </h1>
          <p className="text-sm text-zinc-600">
            Ask anything about your corpus or steer the active 7-agent regiment with real-time checkpointing.
          </p>
        </div>

        {/* Prompt Composer Box */}
        <div className="rounded-2xl bg-white border border-zinc-200/90 shadow-sm p-4 space-y-3 transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/15">
          <textarea
            rows={3}
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="Ask Review Copilot a question or provide steering instructions"
            placeholder={
              isRunning
                ? "Steer running agents: e.g. 'Focus on liability and uncapped indemnification clauses first'..."
                : filteredDoc
                  ? `Ask anything scoped to ${filteredDoc.filename}...`
                  : "Ask anything about your uploaded files, or give an instruction: e.g. 'What is the liability cap?'..."
            }
            className="w-full resize-none text-sm text-zinc-900 placeholder:text-zinc-500 bg-transparent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 p-1"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md"
                aria-label="Upload file to workspace"
                className="hidden focus-visible:ring-2 focus-visible:ring-blue-600"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                <FileUp size={13} className="text-zinc-600" />
                <span>+ Upload File</span>
              </button>

              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-zinc-50 border border-zinc-200 text-zinc-700 font-medium">
                <Compass size={13} className="text-zinc-600" />
                <span>B2B Security Playbook</span>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium">
                <ShieldCheck size={13} className="text-emerald-700" />
                <span>7-Agent Strict Gate (≥97%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  type="button"
                  onClick={() => void pauseJob()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  title="Pause active agent safely"
                >
                  <Pause size={13} />
                  <span>Pause Agent</span>
                </button>
              )}

              {isPaused && (
                <button
                  type="button"
                  onClick={() => void resumeJob()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-900 font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  title="Resume from last checkpoint"
                >
                  <Play size={13} />
                  <span>Resume</span>
                </button>
              )}

              <button
                type="button"
                aria-label="Submit copilot prompt"
                onClick={() => void handleSubmitPrompt()}
                disabled={!promptInput.trim() || asking}
                className="w-8 h-8 rounded-lg bg-[#1D4ED8] hover:bg-[#1E40AF] disabled:opacity-40 text-white flex items-center justify-center transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1"
              >
                <ArrowUp size={16} strokeWidth={2.5} />
              </button>
            </div>
          </div>
        </div>

        {/* 5 Quick Workflow Squircles */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            {
              icon: FileSpreadsheet,
              label: "Auto-Answer .XLSX",
              prompt: "Auto-answer all rows in the security questionnaire using verified SOC 2 evidence.",
              color: "text-emerald-800 bg-emerald-50 border-emerald-200",
              action: () =>
                void handleSubmitPrompt(
                  "Auto-answer all rows in the security questionnaire using verified SOC 2 evidence."
                ),
            },
            {
              icon: ShieldAlert,
              label: "Flag Critical Risks",
              prompt: "Expose all P0 Critical risks, uncapped liabilities, and open AWS IAM wildcard rules.",
              color: "text-rose-800 bg-rose-50 border-rose-200",
              action: () =>
                void handleSubmitPrompt(
                  "Expose all P0 Critical risks, uncapped liabilities, and open AWS IAM wildcard rules."
                ),
            },
            {
              icon: AlertCircle,
              label: "Verify Scan Readability",
              prompt: "Verify OCR confidence across physical scan pages and highlight degraded stamp annotations.",
              color: "text-amber-800 bg-amber-50 border-amber-200",
              action: () =>
                void handleSubmitPrompt(
                  "Verify OCR confidence across physical scan pages and highlight degraded stamp annotations."
                ),
            },
            {
              icon: Clock,
              label: "Check Policy Conflicts",
              prompt: "Detect contradictions between 2023 and 2026 policies, enforcing latest supersession.",
              color: "text-purple-800 bg-purple-50 border-purple-200",
              action: () =>
                void handleSubmitPrompt(
                  "Detect contradictions between 2023 and 2026 policies, enforcing latest supersession."
                ),
            },
            {
              icon: Sparkles,
              label: "Executive Summary",
              prompt: "Executive Summary",
              color: "text-blue-800 bg-blue-50 border-blue-200",
              action: () => void requestExecutiveSummaryStream(selectedFileFilterId),
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs hover:shadow-sm hover:border-zinc-300 transition-all text-center gap-2 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border ${item.color} group-hover:scale-105 transition-transform`}
              >
                <item.icon size={18} />
              </div>
              <span className="text-xs font-medium text-zinc-800 group-hover:text-zinc-950 leading-tight">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Example Prompt Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-600 font-medium">Try asking:</span>
          {[
            "What is the liability cap?",
            "Are there conflicts between 2023 and 2026 policies?",
            "Show all items needing human review",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void handleSubmitPrompt(ex)}
              className="px-3 py-1 rounded-full bg-white border border-zinc-200/90 hover:border-zinc-400 text-zinc-700 hover:text-zinc-950 transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              “{ex}”
            </button>
          ))}
        </div>

        {/* Safe Interrupt & Resume Banner */}
        {isPaused && (
          <div
            role="status"
            aria-live="polite"
            className="p-4 rounded-2xl bg-amber-50/90 border border-amber-200 text-amber-950 text-xs flex items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0">
                <Pause size={16} />
              </div>
              <div>
                <strong className="block font-semibold">
                  Paused at Agent {(activeJob?.current_agent_index ?? 0) + 1} ({currentAgent}) on Node {currentNode}.
                </strong>
                <span className="text-amber-900">
                  Checkpoint saved. Type an instruction in the box above to steer or click Resume.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void resumeJob()}
              className="px-3 py-1.5 rounded-lg bg-[#B45309] hover:bg-[#92400E] text-white font-medium shrink-0 cursor-pointer shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Resume Execution
            </button>
          </div>
        )}

        {/* Executive Summary streaming / error state */}
        {summaryStatus === "loading" && (
          <div
            role="status"
            aria-live="polite"
            data-testid="summary-loading-card"
            className="p-4 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 text-xs flex items-center gap-2.5"
          >
            <RefreshCw size={15} className="spin text-blue-700" />
            <span className="font-medium">
              Generating Envoy Executive Synthesis across {filteredDoc ? filteredDoc.filename : "active corpus"}…
            </span>
          </div>
        )}

        {summaryStatus === "error" && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} className="text-rose-700 shrink-0" />
              <span>{summaryError || "Failed to generate Executive Summary."}</span>
            </span>
            <button
              type="button"
              onClick={() => void requestExecutiveSummaryStream(selectedFileFilterId)}
              className="px-2.5 py-1 rounded-md bg-white border border-rose-300 text-rose-900 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live Stream & Human Escalation Cards */}
        <div role="status" aria-live="polite" className="space-y-4 pt-4 border-t border-zinc-200/80">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 uppercase tracking-wider font-mono">
            <span>Agent Telemetry & Verification Stream</span>
            <span>{visibleEvents.length} Recorded Steps</span>
          </div>

          {/* Human & Legal Escalation Cards */}
          {escalations.map((item) => {
            const citation = item.verified_citations[0];
            const citDoc = resolveCitationDocument(documents, {
              locator: citation?.locator,
              documentFilename: citation?.document_filename,
              fallbackDocumentId: item.document_id,
            });
            const matchedNode = citDoc
              ? nodesByDocument[citDoc.id]?.find((n) => n.id === citation?.ast_node_id)
              : undefined;
            const resolvedLocator = citation?.locator ?? deriveNodeLocator(matchedNode, citDoc);
            const isLegal = item.verification_status === "ESCALATED_LEGAL";
            const displayPriority = item.original_priority_tier || item.priority_tier;
            const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);

            return (
              <div
                key={item.id}
                data-testid="escalation-card"
                className={`p-5 rounded-2xl border shadow-sm text-xs space-y-3 ${
                  isLegal ? "bg-amber-50/75 border-amber-300" : "bg-[#FEF2F2] border-[#FECACA]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                        isLegal ? "bg-[#B45309] text-white" : "bg-[#B91C1C] text-white"
                      }`}
                    >
                      {displayPriority} · {isLegal ? "LEGAL REVIEW" : "ESCALATION"}
                    </span>
                    <span className="font-semibold text-zinc-950 font-ui">{item.category}</span>
                  </div>
                  <span
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded ${
                      isLegal ? "bg-amber-100 text-amber-900 border border-amber-300" : "text-rose-800"
                    }`}
                  >
                    {item.verification_status}
                  </span>
                </div>

                <div className="text-sm font-semibold text-zinc-950">{item.prompt_or_question}</div>

                {citation && (
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <EvidenceLocatorBadge
                      locator={resolvedLocator}
                      document={citDoc}
                      fallbackPage={citation.page_number}
                      fallbackBbox={citation.bounding_box ?? matchedNode?.bounding_box}
                      regionMatchScore={citation.region_match_score}
                      context={`escalation:${item.id}`}
                    />
                    <button
                      type="button"
                      data-testid="citation-badge"
                      onClick={() =>
                        inspectCitation({
                          ...citation,
                          document_filename: citation.document_filename || citDoc?.filename || "",
                          locator: resolvedLocator,
                          bounding_box: citation.bounding_box ?? matchedNode?.bounding_box ?? null,
                          confidence_score: item.gate_telemetry.citation_match,
                        })
                      }
                      className="text-[11px] font-semibold text-blue-700 hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                    >
                      Inspect source →
                    </button>
                  </div>
                )}

                <p className="text-zinc-800 leading-relaxed font-serif text-xs bg-white/90 p-3 rounded-xl border border-zinc-200">
                  {item.fluent_output}
                </p>

                {isLegal ? (
                  <div className="p-3 rounded-xl bg-white border border-amber-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-amber-950">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Scale size={13} className="text-amber-700" />
                        <span>Assigned: {item.escalation_assignee || "Legal Counsel"}</span>
                      </div>
                      {item.escalation_reason && (
                        <div className="text-[11px] text-amber-900">Reason: {item.escalation_reason}</div>
                      )}
                      {item.escalated_at && (
                        <div className="text-[10px] font-mono text-zinc-600">
                          Escalated {new Date(item.escalated_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => void undoWorkItem(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-amber-950 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <RotateCcw size={12} />
                        <span>Undo Legal Flag</span>
                      </button>
                    )}
                  </div>
                ) : inlineAnswerId === item.id ? (
                  <div className="space-y-2 pt-2 border-t border-rose-200">
                    <input
                      type="text"
                      aria-label={`Manual answer for ${item.prompt_or_question}`}
                      value={manualText}
                      onChange={(e) => setManualText(e.target.value)}
                      placeholder="Enter verified manual answer or confirmation note..."
                      className="w-full px-3 py-2 rounded-lg bg-white border border-rose-300 text-xs text-zinc-900 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleManualResolve(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#B91C1C] hover:bg-[#991B1B] text-white font-medium text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Save & Verify Answer
                      </button>
                      <button
                        type="button"
                        onClick={() => setInlineAnswerId(null)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : legalDialogId === item.id ? (
                  <div className="space-y-2 pt-2 border-t border-rose-200 bg-white/85 p-3 rounded-xl">
                    <div className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <Scale size={13} className="text-amber-700" />
                      <span>Flag for Legal Counsel ({displayPriority} priority preserved)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Legal escalation assignee"
                        value={legalAssignee}
                        onChange={(e) => setLegalAssignee(e.target.value)}
                        placeholder="Assignee (e.g. Outside Counsel)"
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                      <input
                        type="text"
                        aria-label="Legal escalation reason note"
                        value={legalReason}
                        onChange={(e) => setLegalReason(e.target.value)}
                        placeholder="Reason note for counsel..."
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmLegalFlag(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-[#18181B] hover:bg-[#27272A] text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Confirm Legal Flag
                      </button>
                      <button
                        type="button"
                        onClick={() => setLegalDialogId(null)}
                        className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setInlineAnswerId(item.id);
                        setManualText(item.fluent_output.includes("Insufficient") ? "" : item.fluent_output);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-900 font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Type Manual Answer / Override
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        void resolveWorkItem(
                          item.id,
                          "approve",
                          "Accepted Vision Rescue transcription with OCR confidence flag."
                        )
                      }
                      className="px-3 py-1.5 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Accept Vision Rescue Text
                    </button>

                    <button
                      type="button"
                      onClick={() => setLegalDialogId(item.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#27272A] hover:bg-[#18181B] text-white font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Flag for Legal
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* User Chat & Executive Summary Cards */}
          {visibleChatMessages.map((msg) => (
            <div
              key={msg.id}
              data-testid={msg.summarySnapshot ? "executive-summary-card" : "chat-answer-card"}
              className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-2.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2 text-zinc-700">
                <span className="font-semibold text-zinc-950">User Query: “{msg.prompt}”</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopyMessage(msg.id, msg.answer ?? "")}
                    aria-label={`Copy response for ${msg.prompt}`}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-medium text-[10px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                  >
                    {copiedMsgId === msg.id ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                    <span>{copiedMsgId === msg.id ? "Copied" : "Copy"}</span>
                  </button>
                  <span className="font-mono text-[10px]">
                    {msg.status === "VERIFIED" ? (
                      <span className="text-emerald-800 font-bold">VERIFIED ({msg.match_score}%)</span>
                    ) : (
                      <span className="text-rose-800 font-bold">INSUFFICIENT EVIDENCE</span>
                    )}
                  </span>
                </div>
              </div>

              {msg.summarySnapshot && (
                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                  <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 font-semibold">
                    {msg.summarySnapshot.defensibility_score}% Defensibility
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">
                    {msg.summarySnapshot.verified_count}/{msg.summarySnapshot.total_work_items} Verified
                  </span>
                  {msg.summarySnapshot.escalated_legal_count > 0 && (
                    <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-300 font-semibold">
                      {msg.summarySnapshot.escalated_legal_count} Escalated Legal
                    </span>
                  )}
                </div>
              )}

              <p className="text-zinc-900 text-xs leading-relaxed bg-zinc-50 p-3 rounded-xl border border-zinc-100 whitespace-pre-wrap">
                {msg.answer || "Processing response through 7-agent verification gate..."}
              </p>

              {msg.citations.length > 0 && (
                <div className="pt-1 space-y-2" role="group" aria-label="Verified source citations">
                  <div className="text-[11px] font-semibold text-zinc-700 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-blue-700" />
                    <span>Verified Citations ({msg.citations.length}):</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {msg.citations.map((citation, idx) => {
                      const targetDoc = resolveCitationDocument(documents, {
                        locator: citation.locator,
                        documentFilename: citation.document_filename,
                        fallbackDocumentId: msg.document_id,
                      });
                      const matchedNode = targetDoc
                        ? nodesByDocument[targetDoc.id]?.find((n) => n.id === citation.ast_node_id)
                        : undefined;
                      const resolvedLocator =
                        citation.locator ?? deriveNodeLocator(matchedNode, targetDoc);

                      return (
                        <button
                          key={`${citation.ast_node_id}-${idx}`}
                          type="button"
                          data-testid="citation-badge"
                          onClick={() => {
                            inspectCitation({
                              ...citation,
                              locator: resolvedLocator,
                              bounding_box: citation.bounding_box ?? matchedNode?.bounding_box ?? null,
                            });
                          }}
                          aria-label={`Inspect citation in ${citation.document_filename}, page ${citation.page_number ?? 1}, confidence ${Math.round(citation.confidence_score)}%`}
                          className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50/90 hover:bg-blue-100 border border-blue-200 text-blue-950 text-[11px] font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 shadow-2xs text-left"
                        >
                          <EvidenceLocatorBadge
                            locator={resolvedLocator}
                            document={targetDoc}
                            fallbackPage={citation.page_number}
                            fallbackBbox={citation.bounding_box ?? matchedNode?.bounding_box}
                            regionMatchScore={citation.region_match_score}
                            context={`chat-cit:${msg.id}:${idx}`}
                          />
                          <span className="font-semibold truncate max-w-[180px]" title={citation.document_filename}>
                            {citation.document_filename}
                          </span>
                          <span className="font-mono text-[10px] bg-blue-200/70 px-1.5 py-0.5 rounded text-blue-950 shrink-0">
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

          {/* Agent Activity Cards */}
          {visibleEvents.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white border border-zinc-200/70 text-zinc-600 text-xs">
              {filteredDoc
                ? `No agent telemetry recorded specifically for ${filteredDoc.filename} in this window.`
                : "No agent events yet. Click Load Investor Demo Case or upload a document to start."}
            </div>
          ) : (
            visibleEvents.slice(-15).map((ev, i) => {
              const agentName = ev.agent_name || "Envoy";
              const targetDoc =
                documents.find((d) => d.id === ev.document_id)?.filename ||
                documents[0]?.filename ||
                "Corpus";
              const isComplete = ev.status === "completed";

              return (
                <div
                  key={`${ev.type}-${i}`}
                  className="p-4 rounded-xl bg-white border border-zinc-200/80 shadow-2xs text-xs space-y-2 hover:border-zinc-300 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px] font-bold shrink-0">
                        {agentName.slice(0, 1)}
                      </span>
                      <strong className="font-semibold text-zinc-900">{agentName}</strong>
                      <span className="text-zinc-600 font-mono text-[10px]">·</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 font-mono text-[10px] text-zinc-700 truncate">
                        {targetDoc}
                      </span>
                    </div>

                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold shrink-0 ${
                        isComplete
                          ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                          : "bg-blue-50 text-blue-800 border border-blue-200"
                      }`}
                    >
                      {isComplete ? "VERIFIED SAFE" : "INSPECTION ACTIVE"}
                    </span>
                  </div>

                  <p className="text-zinc-800 text-xs leading-relaxed">
                    {ev.message || `Agent executed atomic verification pass on ${targetDoc}.`}
                  </p>

                  <div className="flex items-center justify-between text-[10px] font-mono text-zinc-600 pt-1">
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
