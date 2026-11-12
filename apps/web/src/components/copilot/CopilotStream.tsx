import {
  AlertCircle,
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Code2,
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
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  deriveNodeLocator,
  resolveCitationDocument,
} from "../../lib/evidenceLocators";
import {
  formatElapsedMs,
  formatHumanAgentSummary,
  parseTimestampMs,
} from "../../lib/pipelineTelemetry";
import { getAcceptActionState, sortTriageQueue } from "../../lib/triageQueue";
import {
  getMatchBadgeTone,
  itemMatchesDocumentFilter,
  MANUAL_OVERRIDE_REASON_CODES,
  NOT_APPLICABLE_REASON_CODES,
  validateManualOverrideInput,
  validateNotApplicableInput,
} from "../../lib/workItemMetrics";
import { AGENTS, useBertStore } from "../../store/useBertStore";
import { TriageToast } from "../triage/TriageToast";
import { CorpusFilterBanner } from "./CorpusFilterBanner";
import { EvidenceLocatorBadge } from "./EvidenceLocatorBadge";

export function CopilotStream() {
  const {
    documents,
    nodesByDocument,
    workItems,
    workItemUndoSnapshots,
    agentRuns,
    activeJob,
    chatMessages,
    asking,
    selectedFileFilterId,
    summaryStatus,
    summaryError,
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
  const [manualReasonCode, setManualReasonCode] = useState<string>(MANUAL_OVERRIDE_REASON_CODES[0].value);
  const [manualCitationText, setManualCitationText] = useState("");
  const [noEvidenceAttestation, setNoEvidenceAttestation] = useState(false);
  const [manualValidationError, setManualValidationError] = useState<string | null>(null);
  const [naDialogId, setNaDialogId] = useState<string | null>(null);
  const [naReasonCode, setNaReasonCode] = useState<string>("");
  const [naReasonNote, setNaReasonNote] = useState("");
  const [naValidationError, setNaValidationError] = useState<string | null>(null);
  const [legalDialogId, setLegalDialogId] = useState<string | null>(null);
  const [legalReason, setLegalReason] = useState("Flagged for Legal Review and excluded from auto-certification.");
  const [legalAssignee, setLegalAssignee] = useState("Legal Counsel");
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  const [expandedRawRunIds, setExpandedRawRunIds] = useState<Record<string, boolean>>({});
  const [liveNowMs, setLiveNowMs] = useState<number>(() => Date.now());

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

  // Escalated & unresolved items filtered cleanly by sidebar selection, pending actions first & priority ordered
  const escalations = useMemo(() => {
    const filtered = workItems.filter((item) => {
      if (selectedFileFilterId && !itemMatchesDocumentFilter(item, selectedFileFilterId)) {
        return false;
      }
      return item.verification_status !== "VERIFIED";
    });
    const orderRank = (status: string) => {
      if (status === "NEEDS_HUMAN_VERIFICATION" || status === "INSUFFICIENT_EVIDENCE") return 0;
      if (status === "ESCALATED_LEGAL") return 1;
      if (status === "HUMAN_OVERRIDE") return 2;
      return 3;
    };
    const prioritySorted = sortTriageQueue(filtered);
    return [...prioritySorted].sort((a, b) => orderRank(a.verification_status) - orderRank(b.verification_status));
  }, [selectedFileFilterId, workItems]);

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

  const visibleAgentRuns = useMemo(
    () =>
      agentRuns.filter((run) => {
        if (!selectedFileFilterId) return true;
        return !run.documentId || run.documentId === selectedFileFilterId;
      }),
    [agentRuns, selectedFileFilterId]
  );

  const hasRunningCard = useMemo(
    () =>
      visibleAgentRuns.some((run) => run.status === "running") &&
      activeJob?.status !== "PAUSED" &&
      activeJob?.status !== "COMPLETED" &&
      activeJob?.status !== "FAILED",
    [visibleAgentRuns, activeJob?.status]
  );

  useEffect(() => {
    if (!hasRunningCard) return;
    let rafId = 0;
    let lastTick = 0;
    const tick = (frameTime: number) => {
      if (frameTime - lastTick >= 150) {
        lastTick = frameTime;
        setLiveNowMs(Date.now());
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [hasRunningCard]);

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
    const item = workItems.find((w) => w.id === id);
    const hasExistingLocator = Boolean(
      item?.verified_citations?.some((c) => Boolean(c.locator || c.bounding_box || c.quote))
    );
    const validation = validateManualOverrideInput({
      correction: manualText,
      reasonCode: manualReasonCode,
      overrideCitationText: manualCitationText,
      noEvidenceAttestation,
      hasExistingLocator,
    });
    if (!validation.valid) {
      setManualValidationError(validation.message || "Invalid override submission.");
      return;
    }
    setManualValidationError(null);
    try {
      await resolveWorkItem(id, {
        action: "manual_correction",
        correction: manualText.trim(),
        reason_code: manualReasonCode,
        override_citation_text: manualCitationText.trim() || null,
        no_evidence_attestation: noEvidenceAttestation,
      });
      setInlineAnswerId(null);
      setManualText("");
      setManualCitationText("");
      setNoEvidenceAttestation(false);
    } catch (err) {
      setManualValidationError(err instanceof Error ? err.message : "Failed to save override.");
    }
  };

  const handleConfirmNotApplicable = async (id: string) => {
    const validation = validateNotApplicableInput({
      reasonCode: naReasonCode,
      note: naReasonNote,
    });
    if (!validation.valid) {
      setNaValidationError(validation.message || "Reason is required to mark N/A.");
      return;
    }
    setNaValidationError(null);
    try {
      await resolveWorkItem(id, {
        action: "skip",
        reason_code: naReasonCode,
        note: naReasonNote.trim(),
      });
      setNaDialogId(null);
      setNaReasonNote("");
    } catch (err) {
      setNaValidationError(err instanceof Error ? err.message : "Failed to mark N/A.");
    }
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
  }, [visibleChatMessages.length, visibleAgentRuns.length]);

  return (
    <div className="flex-1 h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 bg-[#F8F9FA] text-zinc-900">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Shared Undo Toast Notification */}
        <TriageToast />

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
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-zinc-700 uppercase tracking-wider font-mono">
            <span>Agent Telemetry & Verification Stream</span>
            <div className="flex items-center gap-3">
              {escalations.length > 0 && (
                <Link
                  to="/triage"
                  data-testid="copilot-open-triage-link"
                  className="text-[11px] font-sans normal-case tracking-normal font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded"
                >
                  Open in Triage Queue →
                </Link>
              )}
              <span>{visibleAgentRuns.length} Recorded Steps</span>
            </div>
          </div>

          {/* Human, Legal, Override & N/A Escalation Cards */}
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
            const isOverride = item.verification_status === "HUMAN_OVERRIDE";
            const isNA = item.verification_status === "NOT_APPLICABLE";
            const displayPriority = item.original_priority_tier || item.priority_tier;
            const canUndo = Boolean(item.can_undo || workItemUndoSnapshots[item.id]);
            const acceptState = getAcceptActionState(item);
            const matchTone = getMatchBadgeTone(
              item.gate_telemetry.citation_match,
              item.verification_status,
              item.weak_evidence
            );

            return (
              <div
                key={item.id}
                data-testid="escalation-card"
                className={`p-5 rounded-2xl border shadow-sm text-xs space-y-3 ${
                  isOverride
                    ? "bg-purple-50/75 border-purple-300"
                    : isNA
                      ? "bg-slate-50 border-slate-300"
                      : isLegal
                        ? "bg-amber-50/75 border-amber-300"
                        : "bg-[#FEF2F2] border-[#FECACA]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                        isOverride
                          ? "bg-purple-800 text-white"
                          : isNA
                            ? "bg-slate-700 text-white"
                            : isLegal
                              ? "bg-[#B45309] text-white"
                              : "bg-[#B91C1C] text-white"
                      }`}
                    >
                      {displayPriority} ·{" "}
                      {isOverride
                        ? "HUMAN OVERRIDE"
                        : isNA
                          ? "MARKED N/A"
                          : isLegal
                            ? "LEGAL REVIEW"
                            : "ESCALATION"}
                    </span>
                    <span className="font-semibold text-zinc-950 font-ui">{item.category}</span>
                    {item.weak_evidence && (
                      <span
                        data-testid="weak-evidence-badge"
                        title={item.weak_evidence_reason || "Weak quote specificity"}
                        className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300"
                      >
                        Weak Evidence
                      </span>
                    )}
                  </div>
                  <span
                    data-testid={isOverride ? "human-override-badge" : undefined}
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border ${matchTone.badgeClass}`}
                  >
                    {isOverride
                      ? "Human Override · Unverified by gate"
                      : isNA
                        ? "NOT_APPLICABLE"
                        : item.verification_status}
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

                {isOverride ? (
                  <div className="p-3 rounded-xl bg-white border border-purple-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-purple-950 text-[11px]">
                      <div className="font-semibold">
                        Human Override ({item.human_override_reason_code || "SME_ATTESTATION"}) · Match:{" "}
                        {Math.round(item.gate_telemetry.citation_match ?? 0)}% (Unverified by gate)
                      </div>
                      <div className="text-zinc-700 font-mono text-[10px]">
                        {item.no_evidence_attestation
                          ? "No corpus evidence — reviewer attested"
                          : item.gate_telemetry?.override_citation_text
                            ? `Cited: ${item.gate_telemetry.override_citation_text}`
                            : item.override_locator
                              ? `Locator attached (${item.override_locator.source_type.toUpperCase()})`
                              : "Backed by stored citation"}
                        {item.original_priority_tier ? ` · Priority ${item.priority_tier} preserved` : ""}
                      </div>
                    </div>
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => void undoWorkItem(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-100 hover:bg-purple-200 border border-purple-300 text-purple-950 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <RotateCcw size={12} />
                        <span>Undo Override</span>
                      </button>
                    )}
                  </div>
                ) : isNA ? (
                  <div className="p-3 rounded-xl bg-white border border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-slate-900 text-[11px]">
                      <div className="font-semibold">
                        Marked Not Applicable ({item.human_override_reason_code || "OUT_OF_SCOPE"})
                      </div>
                      <div className="text-zinc-700 font-mono text-[10px]">
                        Priority {item.priority_tier} preserved (Original: {displayPriority})
                        {item.escalation_reason ? ` · Reason: ${item.escalation_reason}` : ""}
                      </div>
                    </div>
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => void undoWorkItem(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <RotateCcw size={12} />
                        <span>Undo N/A</span>
                      </button>
                    )}
                  </div>
                ) : isLegal ? (
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
                  <div className="space-y-2.5 pt-2 border-t border-rose-200 bg-white/90 p-3 rounded-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor={`override-reason-${item.id}`}
                          className="block text-[10px] font-semibold text-zinc-700 mb-1"
                        >
                          Override Reason Code
                        </label>
                        <select
                          id={`override-reason-${item.id}`}
                          aria-label="Override reason code"
                          value={manualReasonCode}
                          onChange={(e) => setManualReasonCode(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        >
                          {MANUAL_OVERRIDE_REASON_CODES.map((rc) => (
                            <option key={rc.value} value={rc.value}>
                              {rc.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          htmlFor={`override-citation-${item.id}`}
                          className="block text-[10px] font-semibold text-zinc-700 mb-1"
                        >
                          Citation / Source Reference (optional if attesting)
                        </label>
                        <input
                          id={`override-citation-${item.id}`}
                          type="text"
                          aria-label="Override citation or locator reference"
                          value={manualCitationText}
                          onChange={(e) => setManualCitationText(e.target.value)}
                          placeholder="e.g. COI Policy #CYB-2026 p.1 or SOC 2 §4.1"
                          className="w-full px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-900 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`override-answer-${item.id}`}
                        className="block text-[10px] font-semibold text-zinc-700 mb-1"
                      >
                        Substantive Override Answer (min 12 chars & 3 words)
                      </label>
                      <input
                        id={`override-answer-${item.id}`}
                        type="text"
                        aria-label={`Manual answer for ${item.prompt_or_question}`}
                        value={manualText}
                        onChange={(e) => {
                          setManualText(e.target.value);
                          if (manualValidationError) setManualValidationError(null);
                        }}
                        placeholder="Enter substantive verified compliance answer (e.g. Vendor maintains $10M cyber coverage per COI)..."
                        className="w-full px-3 py-2 rounded-lg bg-white border border-rose-300 text-xs text-zinc-900 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-zinc-800 cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="No evidence — reviewer attests"
                        checked={noEvidenceAttestation}
                        onChange={(e) => setNoEvidenceAttestation(e.target.checked)}
                        className="rounded border-zinc-300 text-purple-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                      <span>No evidence — reviewer attests (manual SME sign-off without corpus quote)</span>
                    </label>

                    {manualValidationError && (
                      <div
                        role="alert"
                        data-testid="override-validation-error"
                        className="p-2 rounded-lg bg-rose-100 border border-rose-300 text-rose-950 text-[11px] font-semibold"
                      >
                        {manualValidationError}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleManualResolve(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-purple-800 hover:bg-purple-900 text-white font-medium text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Save Human Override
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInlineAnswerId(null);
                          setManualValidationError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : naDialogId === item.id ? (
                  <div className="space-y-2 pt-2 border-t border-rose-200 bg-white/90 p-3 rounded-xl">
                    <div className="font-semibold text-zinc-900">
                      Mark Not Applicable ({displayPriority} priority preserved)
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        aria-label="Not applicable reason code"
                        value={naReasonCode}
                        onChange={(e) => {
                          setNaReasonCode(e.target.value);
                          if (naValidationError) setNaValidationError(null);
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        <option value="">Select N/A reason code…</option>
                        {NOT_APPLICABLE_REASON_CODES.map((rc) => (
                          <option key={rc.value} value={rc.value}>
                            {rc.label}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        aria-label="Not applicable reason note"
                        value={naReasonNote}
                        onChange={(e) => {
                          setNaReasonNote(e.target.value);
                          if (naValidationError) setNaValidationError(null);
                        }}
                        placeholder="Required rationale why N/A..."
                        className="px-2.5 py-1.5 rounded-lg bg-white border border-zinc-300 text-xs text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      />
                    </div>
                    {naValidationError && (
                      <div
                        role="alert"
                        data-testid="na-validation-error"
                        className="p-2 rounded-lg bg-rose-100 border border-rose-300 text-rose-950 text-[11px] font-semibold"
                      >
                        {naValidationError}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmNotApplicable(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        Confirm Mark N/A
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNaDialogId(null);
                          setNaValidationError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-800 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
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
                        setManualValidationError(null);
                        setNaDialogId(null);
                        setLegalDialogId(null);
                        setManualText(item.fluent_output.includes("Insufficient") ? "" : item.fluent_output);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 border border-rose-300 text-rose-900 font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Override
                    </button>

                    {acceptState.visible && (
                      <button
                        type="button"
                        onClick={() =>
                          void resolveWorkItem(
                            item.id,
                            "approve",
                            acceptState.kind === "rescue"
                              ? item.vision_rescue_text ||
                                  item.structured_facts[0]?.verbatim_quote ||
                                  "Accepted Vision Rescue transcription with OCR confidence flag."
                              : item.machine_extracted_text ||
                                  item.structured_facts[0]?.verbatim_quote ||
                                  "Accepted verified machine-extracted evidence."
                          )
                        }
                        className="px-3 py-1.5 rounded-lg bg-[#047857] hover:bg-[#065F46] text-white font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                      >
                        {acceptState.label}
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setNaDialogId(item.id);
                        setNaReasonCode("");
                        setNaReasonNote("");
                        setNaValidationError(null);
                        setInlineAnswerId(null);
                        setLegalDialogId(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 border border-slate-300 text-slate-900 font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Mark N/A
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLegalDialogId(item.id);
                        setInlineAnswerId(null);
                        setNaDialogId(null);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#27272A] hover:bg-[#18181B] text-white font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      Flag for Legal
                    </button>

                    <Link
                      to={`/triage?item=${encodeURIComponent(item.id)}`}
                      className="ml-auto text-[11px] font-semibold text-blue-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded px-1 py-1"
                    >
                      Open in Triage Queue →
                    </Link>
                  </div>
                )}
              </div>
            );
          })}

          {/* User Chat & Executive Summary Cards */}
          {visibleChatMessages.map((msg) => {
            const msgTone = getMatchBadgeTone(
              msg.match_score,
              msg.status === "VERIFIED" ? "VERIFIED" : "INSUFFICIENT_EVIDENCE",
              msg.weak_evidence
            );
            return (
              <div
                key={msg.id}
                data-testid={msg.summarySnapshot ? "executive-summary-card" : "chat-answer-card"}
                className="p-4 rounded-2xl bg-white border border-zinc-200/90 shadow-2xs space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2 text-zinc-700">
                  <span className="font-semibold text-zinc-950">User Query: “{msg.prompt}”</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {msg.weak_evidence && (
                      <span
                        data-testid="weak-evidence-badge"
                        title={msg.weak_evidence_reason || "Weak quote specificity"}
                        className="px-2 py-0.5 rounded bg-amber-100 text-amber-950 border border-amber-300 font-mono text-[10px] font-bold"
                      >
                        Weak Evidence
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCopyMessage(msg.id, msg.answer ?? "")}
                      aria-label={`Copy response for ${msg.prompt}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-100 hover:bg-zinc-200 text-zinc-800 font-medium text-[10px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      {copiedMsgId === msg.id ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                      <span>{copiedMsgId === msg.id ? "Copied" : "Copy"}</span>
                    </button>
                    <span className={`font-mono text-[10px] px-2 py-0.5 rounded border font-bold ${msgTone.badgeClass}`}>
                      {msg.status === "VERIFIED"
                        ? `VERIFIED (${msg.match_score}%)`
                        : msg.match_score > 0
                          ? `NEEDS REVIEW (${msg.match_score}%)`
                          : "INSUFFICIENT EVIDENCE"}
                    </span>
                  </div>
                </div>

                {msg.summarySnapshot && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono">
                    <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-900 border border-blue-200 font-semibold">
                      {msg.summarySnapshot.defensibility_score ?? 0}% Defensibility
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-900 border border-emerald-200 font-semibold">
                      {msg.summarySnapshot.verified_count}/{msg.summarySnapshot.total_work_items} Machine Verified
                    </span>
                    {(msg.summarySnapshot.human_override_count ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-950 border border-purple-300 font-semibold">
                        {msg.summarySnapshot.human_override_count} Human Overridden
                      </span>
                    )}
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
                      <span>Citations ({msg.citations.length}):</span>
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
                        const citTone = getMatchBadgeTone(
                          citation.confidence_score,
                          msg.status === "VERIFIED" ? "VERIFIED" : "NEEDS_HUMAN_VERIFICATION",
                          msg.weak_evidence
                        );

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
                            <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-bold ${citTone.badgeClass}`}>
                              {Math.round(citation.confidence_score)}% match
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Agent Activity Cards (One card per agent run, updated in place) */}
          {visibleAgentRuns.length === 0 ? (
            <div className="p-8 text-center rounded-2xl bg-white border border-zinc-200/70 text-zinc-600 text-xs">
              {filteredDoc
                ? `No agent telemetry recorded specifically for ${filteredDoc.filename} in this window.`
                : "No agent events yet. Click Load Investor Demo Case or upload a document to start."}
            </div>
          ) : (
            visibleAgentRuns.map((run) => {
              const targetDocLabel =
                (run.documentId
                  ? documents.find((d) => d.id === run.documentId)?.filename
                  : null) ||
                run.documentFilename ||
                "Corpus-wide";
              const isDone = run.status === "done";
              const isFailed = run.status === "failed";
              const startedMs = parseTimestampMs(run.startedAt);
              const computedElapsed =
                run.status === "running" && startedMs !== null
                  ? Math.max(1, liveNowMs - startedMs)
                  : run.elapsedMs;
              const elapsedLabel = formatElapsedMs(computedElapsed);
              const humanSummary = formatHumanAgentSummary({
                summary: run.summary,
                details: run.details,
                agentName: run.agentName,
                status: run.status,
                documentFilename: targetDocLabel === "Corpus-wide" ? null : targetDocLabel,
              });
              const isRawExpanded = Boolean(expandedRawRunIds[run.id]);
              const rawPanelId = `raw-json-${run.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
              const rawPayload = run.details ?? run.rawEvent;

              return (
                <div
                  key={run.id}
                  data-testid="agent-run-card"
                  data-agent-name={run.agentName}
                  data-run-status={run.status}
                  className={`p-4 rounded-xl bg-white border shadow-2xs text-xs space-y-2 transition-colors ${
                    isFailed
                      ? "border-rose-300 bg-rose-50/40"
                      : isDone
                        ? "border-zinc-200/90 hover:border-zinc-300"
                        : "border-blue-300 bg-blue-50/20"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isFailed
                            ? "bg-rose-100 text-rose-900"
                            : isDone
                              ? "bg-emerald-100 text-emerald-900"
                              : "bg-blue-100 text-blue-900"
                        }`}
                      >
                        {run.agentName.slice(0, 1)}
                      </span>
                      <strong className="font-semibold text-zinc-950">{run.agentName}</strong>
                      <span className="text-zinc-600 text-[11px] font-medium">· {run.role}</span>
                      <span className="px-2 py-0.5 rounded bg-zinc-100 font-mono text-[10px] text-zinc-800 border border-zinc-200 truncate max-w-[200px]">
                        {targetDocLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {elapsedLabel && (
                        <span
                          data-testid="agent-run-elapsed"
                          className="font-mono text-[10px] font-semibold text-zinc-700 bg-zinc-100 px-2 py-0.5 rounded border border-zinc-200"
                        >
                          {elapsedLabel}
                        </span>
                      )}
                      <span
                        className={`font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isFailed
                            ? "bg-rose-100 text-rose-900 border border-rose-300"
                            : isDone
                              ? "bg-emerald-50 text-emerald-900 border border-emerald-200"
                              : "bg-blue-50 text-blue-900 border border-blue-200"
                        }`}
                      >
                        {isFailed ? "FAILED" : isDone ? "DONE" : "RUNNING"}
                      </span>
                    </div>
                  </div>

                  <p data-testid="agent-run-summary" className="text-zinc-900 text-xs leading-relaxed">
                    {humanSummary}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-zinc-700 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {run.inputHash && (
                        <span
                          title={run.inputHash}
                          className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200"
                        >
                          in: {run.inputHash.slice(0, 10)}
                        </span>
                      )}
                      {run.outputHash && (
                        <span
                          title={run.outputHash}
                          className="px-1.5 py-0.5 rounded bg-zinc-100 border border-zinc-200"
                        >
                          out: {run.outputHash.slice(0, 10)}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      data-testid="raw-json-toggle"
                      aria-expanded={isRawExpanded}
                      aria-controls={rawPanelId}
                      onClick={() =>
                        setExpandedRawRunIds((prev) => ({
                          ...prev,
                          [run.id]: !prev[run.id],
                        }))
                      }
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-300 bg-zinc-50 hover:bg-zinc-100 text-zinc-800 font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                    >
                      <Code2 size={11} />
                      <span>Raw JSON</span>
                      {isRawExpanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                  </div>

                  {isRawExpanded && (
                    <pre
                      id={rawPanelId}
                      data-testid="raw-json-panel"
                      className="mt-2 p-2.5 rounded-lg bg-zinc-900 text-zinc-100 text-[10px] font-mono overflow-x-auto max-h-56 leading-relaxed"
                    >
                      {JSON.stringify(rawPayload, null, 2)}
                    </pre>
                  )}
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
