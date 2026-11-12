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
    <div className="flex-1 h-full overflow-y-auto p-4 sm:p-6 md:p-8 space-y-6 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Shared Undo Toast Notification */}
        <TriageToast />

        <CorpusFilterBanner />

        {/* Greeting Header */}
        <div className="space-y-1">
          <h1 className="font-serif text-3xl sm:text-4xl font-semibold tracking-tight text-[var(--text-primary)]">
            Review Copilot
          </h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Ask anything about your corpus or steer the active 7-agent regiment with real-time checkpointing.
          </p>
        </div>

        {/* Prompt Composer Box */}
        <div className="rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-sm p-4 space-y-3 transition-all focus-within:border-[var(--accent-brand-ring)] focus-within:ring-2 focus-within:ring-[var(--accent-brand-soft)]">
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
            className="w-full resize-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] bg-transparent rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] p-1"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.xlsx,.xls,.csv,.json,.txt,.md"
                aria-label="Upload file to workspace"
                className="hidden focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-sunken)] hover:border-[var(--border-strong)] text-[var(--text-primary)] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
              >
                <FileUp size={13} className="text-[var(--text-secondary)]" />
                <span>+ Upload File</span>
              </button>

              <div className="hidden sm:flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-secondary)] font-medium">
                <Compass size={13} className="text-[var(--text-secondary)]" />
                <span>B2B Security Playbook</span>
              </div>

              <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[var(--status-verified-soft)] border border-[var(--status-verified-border)] text-[var(--status-verified-ink)] font-medium tabular-nums">
                <ShieldCheck size={13} className="text-[var(--status-verified-ink)]" />
                <span>7-Agent Strict Gate (≥97%)</span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isRunning && (
                <button
                  type="button"
                  onClick={() => void pauseJob()}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--status-warning-soft)] hover:opacity-90 border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[var(--status-verified-soft)] hover:opacity-90 border border-[var(--status-verified-border)] text-[var(--status-verified-ink)] font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                className="w-8 h-8 rounded-lg bg-[var(--accent-brand)] hover:bg-[var(--accent-brand-hover)] disabled:opacity-40 text-[var(--accent-brand-contrast)] flex items-center justify-center transition-all cursor-pointer shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] focus-visible:ring-offset-1"
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
              color:
                "text-[var(--status-verified-ink)] bg-[var(--status-verified-soft)] border-[var(--status-verified-border)]",
              action: () =>
                void handleSubmitPrompt(
                  "Auto-answer all rows in the security questionnaire using verified SOC 2 evidence."
                ),
            },
            {
              icon: ShieldAlert,
              label: "Flag Critical Risks",
              color:
                "text-[var(--status-danger-ink)] bg-[var(--status-danger-soft)] border-[var(--status-danger-border)]",
              action: () =>
                void handleSubmitPrompt(
                  "Expose all P0 Critical risks, uncapped liabilities, and open AWS IAM wildcard rules."
                ),
            },
            {
              icon: AlertCircle,
              label: "Verify Scan Readability",
              color:
                "text-[var(--status-warning-ink)] bg-[var(--status-warning-soft)] border-[var(--status-warning-border)]",
              action: () =>
                void handleSubmitPrompt(
                  "Verify OCR confidence across physical scan pages and highlight degraded stamp annotations."
                ),
            },
            {
              icon: Clock,
              label: "Check Policy Conflicts",
              color:
                "text-[var(--status-override-ink)] bg-[var(--status-override-soft)] border-[var(--status-override-border)]",
              action: () =>
                void handleSubmitPrompt(
                  "Detect contradictions between 2023 and 2026 policies, enforcing latest supersession."
                ),
            },
            {
              icon: Sparkles,
              label: "Executive Summary",
              color:
                "text-[var(--accent-brand-ink)] bg-[var(--accent-brand-soft)] border-[var(--accent-brand-border)]",
              action: () => void requestExecutiveSummaryStream(selectedFileFilterId),
            },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.action}
              className="flex flex-col items-center justify-center p-3.5 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xs hover:shadow-sm hover:border-[var(--border-strong)] transition-all text-center gap-2 cursor-pointer group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center border ${item.color} group-hover:scale-105 transition-transform`}
              >
                <item.icon size={18} />
              </div>
              <span className="text-xs font-medium text-[var(--text-primary)] leading-tight">
                {item.label}
              </span>
            </button>
          ))}
        </div>

        {/* Example Prompt Pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--text-secondary)] font-medium">Try asking:</span>
          {[
            "What is the liability cap?",
            "Are there conflicts between 2023 and 2026 policies?",
            "Show all items needing human review",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => void handleSubmitPrompt(ex)}
              className="px-3 py-1 rounded-full bg-[var(--bg-surface)] border border-[var(--border-subtle)] hover:border-[var(--border-strong)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
            className="p-4 rounded-2xl bg-[var(--status-warning-soft)] border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] text-xs flex items-center justify-between gap-3 shadow-xs"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--bg-surface)] border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] flex items-center justify-center shrink-0">
                <Pause size={16} />
              </div>
              <div>
                <strong className="block font-semibold tabular-nums">
                  Paused at Agent {(activeJob?.current_agent_index ?? 0) + 1} ({currentAgent}) on Node {currentNode}.
                </strong>
                <span>
                  Checkpoint saved. Type an instruction in the box above to steer or click Resume.
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void resumeJob()}
              className="px-3 py-1.5 rounded-lg bg-[var(--status-warning-solid)] hover:opacity-90 text-white font-medium shrink-0 cursor-pointer shadow-2xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
            className="p-4 rounded-2xl bg-[var(--accent-brand-soft)] border border-[var(--accent-brand-border)] text-[var(--accent-brand-ink)] text-xs flex items-center gap-2.5"
          >
            <RefreshCw size={15} className="spin shrink-0" />
            <span className="font-medium">
              Generating Envoy Executive Synthesis across {filteredDoc ? filteredDoc.filename : "active corpus"}…
            </span>
          </div>
        )}

        {summaryStatus === "error" && (
          <div
            role="alert"
            className="p-4 rounded-2xl bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] text-xs flex items-center justify-between gap-3"
          >
            <span className="flex items-center gap-2">
              <AlertTriangle size={15} className="shrink-0" />
              <span>{summaryError || "Failed to generate Executive Summary."}</span>
            </span>
            <button
              type="button"
              onClick={() => void requestExecutiveSummaryStream(selectedFileFilterId)}
              className="px-2.5 py-1 rounded-md bg-[var(--bg-surface)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
            >
              Retry
            </button>
          </div>
        )}

        {/* Live Stream & Human Escalation Cards */}
        <div role="status" aria-live="polite" className="space-y-4 pt-4 border-t border-[var(--border-subtle)]">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-[var(--text-secondary)] uppercase tracking-wider font-mono tabular-nums">
            <span>Agent Telemetry & Verification Stream</span>
            <div className="flex items-center gap-3">
              {escalations.length > 0 && (
                <Link
                  to="/triage"
                  data-testid="copilot-open-triage-link"
                  className="text-[11px] font-sans normal-case tracking-normal font-semibold text-[var(--accent-brand-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                >
                  Open in Triage Queue →
                </Link>
              )}
              <span className="tabular-nums">{visibleAgentRuns.length} Recorded Steps</span>
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
                    ? "bg-[var(--status-override-row)] border-[var(--status-override-border)]"
                    : isNA
                      ? "bg-[var(--status-neutral-row)] border-[var(--status-neutral-border)]"
                      : isLegal
                        ? "bg-[var(--status-warning-row)] border-[var(--status-warning-border)]"
                        : "bg-[var(--status-danger-row)] border-[var(--status-danger-border)]"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-[10px] font-bold text-white tabular-nums ${
                        isOverride
                          ? "bg-[var(--status-override-solid)]"
                          : isNA
                            ? "bg-[var(--status-neutral-solid)]"
                            : isLegal
                              ? "bg-[var(--status-warning-solid)]"
                              : "bg-[var(--status-danger-solid)]"
                      }`}
                    >
                      {isLegal ? (
                        <Scale size={11} aria-hidden="true" />
                      ) : isOverride ? (
                        <Sparkles size={11} aria-hidden="true" />
                      ) : (
                        <AlertTriangle size={11} aria-hidden="true" />
                      )}
                      <span>
                        {displayPriority} ·{" "}
                        {isOverride
                          ? "HUMAN OVERRIDE"
                          : isNA
                            ? "MARKED N/A"
                            : isLegal
                              ? "LEGAL REVIEW"
                              : "ESCALATION"}
                      </span>
                    </span>
                    <span className="font-semibold text-[var(--text-primary)]">{item.category}</span>
                    {item.weak_evidence && (
                      <span
                        data-testid="weak-evidence-badge"
                        title={item.weak_evidence_reason || "Weak quote specificity"}
                        className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)]"
                      >
                        <AlertTriangle size={10} aria-hidden="true" />
                        <span>Weak Evidence</span>
                      </span>
                    )}
                  </div>
                  <span
                    data-testid={isOverride ? "human-override-badge" : undefined}
                    className={`font-mono text-[10px] font-bold px-2 py-0.5 rounded border tabular-nums ${matchTone.badgeClass}`}
                  >
                    {isOverride
                      ? "Human Override · Unverified by gate"
                      : isNA
                        ? "NOT_APPLICABLE"
                        : item.verification_status}
                  </span>
                </div>

                <div className="text-sm font-semibold text-[var(--text-primary)]">
                  {item.prompt_or_question}
                </div>

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
                      className="text-[11px] font-semibold text-[var(--accent-brand-ink)] hover:underline cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded"
                    >
                      Inspect source →
                    </button>
                  </div>
                )}

                <p className="text-[var(--text-primary)] leading-relaxed font-serif text-sm bg-[var(--bg-surface)] p-3 rounded-xl border border-[var(--border-subtle)]">
                  {item.fluent_output}
                </p>

                {isOverride ? (
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--status-override-border)] flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-[var(--status-override-ink)] text-[11px]">
                      <div className="font-semibold tabular-nums">
                        Human Override ({item.human_override_reason_code || "SME_ATTESTATION"}) · Match:{" "}
                        {Math.round(item.gate_telemetry.citation_match ?? 0)}% (Unverified by gate)
                      </div>
                      <div className="text-[var(--text-secondary)] font-mono text-[10px]">
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
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--status-override-soft)] hover:opacity-90 border border-[var(--status-override-border)] text-[var(--status-override-ink)] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        <RotateCcw size={12} />
                        <span>Undo Override</span>
                      </button>
                    )}
                  </div>
                ) : isNA ? (
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--status-neutral-border)] flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-[var(--status-neutral-ink)] text-[11px]">
                      <div className="font-semibold">
                        Marked Not Applicable ({item.human_override_reason_code || "OUT_OF_SCOPE"})
                      </div>
                      <div className="text-[var(--text-secondary)] font-mono text-[10px]">
                        Priority {item.priority_tier} preserved (Original: {displayPriority})
                        {item.escalation_reason ? ` · Reason: ${item.escalation_reason}` : ""}
                      </div>
                    </div>
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => void undoWorkItem(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--status-neutral-soft)] hover:opacity-90 border border-[var(--status-neutral-border)] text-[var(--status-neutral-ink)] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        <RotateCcw size={12} />
                        <span>Undo N/A</span>
                      </button>
                    )}
                  </div>
                ) : isLegal ? (
                  <div className="p-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--status-warning-border)] flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5 text-[var(--status-warning-ink)]">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <Scale size={13} />
                        <span>Assigned: {item.escalation_assignee || "Legal Counsel"}</span>
                      </div>
                      {item.escalation_reason && (
                        <div className="text-[11px]">Reason: {item.escalation_reason}</div>
                      )}
                      {item.escalated_at && (
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
                          Escalated {new Date(item.escalated_at).toLocaleString()}
                        </div>
                      )}
                    </div>
                    {canUndo && (
                      <button
                        type="button"
                        onClick={() => void undoWorkItem(item.id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--status-warning-soft)] hover:opacity-90 border border-[var(--status-warning-border)] text-[var(--status-warning-ink)] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        <RotateCcw size={12} />
                        <span>Undo Legal Flag</span>
                      </button>
                    )}
                  </div>
                ) : inlineAnswerId === item.id ? (
                  <div className="space-y-2.5 pt-2 border-t border-[var(--status-danger-border)] bg-[var(--bg-surface)] p-3 rounded-xl">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label
                          htmlFor={`override-reason-${item.id}`}
                          className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1"
                        >
                          Override Reason Code
                        </label>
                        <select
                          id={`override-reason-${item.id}`}
                          aria-label="Override reason code"
                          value={manualReasonCode}
                          onChange={(e) => setManualReasonCode(e.target.value)}
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                          className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1"
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
                          className="w-full px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor={`override-answer-${item.id}`}
                        className="block text-[10px] font-semibold text-[var(--text-secondary)] mb-1"
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
                        className="w-full px-3 py-2 rounded-lg bg-[var(--bg-surface)] border border-[var(--status-danger-border)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                    </div>

                    <label className="flex items-center gap-2 text-[11px] text-[var(--text-primary)] cursor-pointer">
                      <input
                        type="checkbox"
                        aria-label="No evidence — reviewer attests"
                        checked={noEvidenceAttestation}
                        onChange={(e) => setNoEvidenceAttestation(e.target.checked)}
                        className="rounded border-[var(--border-strong)] accent-[var(--status-override-solid)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                      <span>No evidence — reviewer attests (manual SME sign-off without corpus quote)</span>
                    </label>

                    {manualValidationError && (
                      <div
                        role="alert"
                        data-testid="override-validation-error"
                        className="p-2 rounded-lg bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] text-[11px] font-semibold"
                      >
                        {manualValidationError}
                      </div>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleManualResolve(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-override-solid)] hover:opacity-90 text-white font-medium text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Save Human Override
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setInlineAnswerId(null);
                          setManualValidationError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] hover:border-[var(--border-strong)] border border-[var(--border-subtle)] text-[var(--text-primary)] text-xs cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : naDialogId === item.id ? (
                  <div className="space-y-2 pt-2 border-t border-[var(--status-danger-border)] bg-[var(--bg-surface)] p-3 rounded-xl">
                    <div className="font-semibold text-[var(--text-primary)]">
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
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                    </div>
                    {naValidationError && (
                      <div
                        role="alert"
                        data-testid="na-validation-error"
                        className="p-2 rounded-lg bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] text-[11px] font-semibold"
                      >
                        {naValidationError}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmNotApplicable(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-neutral-solid)] hover:opacity-90 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Confirm Mark N/A
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setNaDialogId(null);
                          setNaValidationError(null);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : legalDialogId === item.id ? (
                  <div className="space-y-2 pt-2 border-t border-[var(--status-danger-border)] bg-[var(--bg-surface)] p-3 rounded-xl">
                    <div className="font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      <Scale size={13} className="text-[var(--status-warning-ink)]" />
                      <span>Flag for Legal Counsel ({displayPriority} priority preserved)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="text"
                        aria-label="Legal escalation assignee"
                        value={legalAssignee}
                        onChange={(e) => setLegalAssignee(e.target.value)}
                        placeholder="Assignee (e.g. Outside Counsel)"
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                      <input
                        type="text"
                        aria-label="Legal escalation reason note"
                        value={legalReason}
                        onChange={(e) => setLegalReason(e.target.value)}
                        placeholder="Reason note for counsel..."
                        className="px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-strong)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmLegalFlag(item.id)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-warning-solid)] hover:opacity-90 text-white font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                      >
                        Confirm Legal Flag
                      </button>
                      <button
                        type="button"
                        onClick={() => setLegalDialogId(null)}
                        className="px-3 py-1.5 rounded-lg bg-[var(--bg-sunken)] border border-[var(--border-subtle)] text-[var(--text-primary)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                      className="px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] hover:bg-[var(--status-danger-soft)] border border-[var(--status-danger-border)] text-[var(--status-danger-ink)] font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                        className="px-3 py-1.5 rounded-lg bg-[var(--status-verified-solid)] hover:opacity-90 text-white font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                      className="px-3 py-1.5 rounded-lg bg-[var(--status-neutral-soft)] hover:opacity-90 border border-[var(--status-neutral-border)] text-[var(--status-neutral-ink)] font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                      className="px-3 py-1.5 rounded-lg bg-[var(--status-warning-solid)] hover:opacity-90 text-white font-medium transition-colors cursor-pointer shadow-2xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    >
                      Flag for Legal
                    </button>

                    <Link
                      to={`/triage?item=${encodeURIComponent(item.id)}`}
                      className="ml-auto text-[11px] font-semibold text-[var(--accent-brand-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] rounded px-1 py-1"
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
                className="p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] shadow-2xs space-y-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2 text-[var(--text-secondary)]">
                  <span className="font-semibold text-[var(--text-primary)]">
                    User Query: “{msg.prompt}”
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {msg.weak_evidence && (
                      <span
                        data-testid="weak-evidence-badge"
                        title={msg.weak_evidence_reason || "Weak quote specificity"}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] font-mono text-[10px] font-bold"
                      >
                        <AlertTriangle size={10} aria-hidden="true" />
                        <span>Weak Evidence</span>
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleCopyMessage(msg.id, msg.answer ?? "")}
                      aria-label={`Copy response for ${msg.prompt}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-sunken)] hover:border-[var(--border-strong)] border border-[var(--border-subtle)] text-[var(--text-primary)] font-medium text-[10px] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
                    >
                      {copiedMsgId === msg.id ? <CheckCircle2 size={11} /> : <Copy size={11} />}
                      <span>{copiedMsgId === msg.id ? "Copied" : "Copy"}</span>
                    </button>
                    <span
                      className={`font-mono text-[10px] px-2 py-0.5 rounded border font-bold tabular-nums ${msgTone.badgeClass}`}
                    >
                      {msg.status === "VERIFIED"
                        ? `VERIFIED (${msg.match_score}%)`
                        : msg.match_score > 0
                          ? `NEEDS REVIEW (${msg.match_score}%)`
                          : "INSUFFICIENT EVIDENCE"}
                    </span>
                  </div>
                </div>

                {msg.summarySnapshot && (
                  <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono tabular-nums">
                    <span className="px-2 py-0.5 rounded bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border border-[var(--accent-brand-border)] font-semibold">
                      {msg.summarySnapshot.defensibility_score ?? 0}% Defensibility
                    </span>
                    <span className="px-2 py-0.5 rounded bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)] font-semibold">
                      {msg.summarySnapshot.verified_count}/{msg.summarySnapshot.total_work_items} Machine Verified
                    </span>
                    {(msg.summarySnapshot.human_override_count ?? 0) > 0 && (
                      <span className="px-2 py-0.5 rounded bg-[var(--status-override-soft)] text-[var(--status-override-ink)] border border-[var(--status-override-border)] font-semibold">
                        {msg.summarySnapshot.human_override_count} Human Overridden
                      </span>
                    )}
                    {msg.summarySnapshot.escalated_legal_count > 0 && (
                      <span className="px-2 py-0.5 rounded bg-[var(--status-warning-soft)] text-[var(--status-warning-ink)] border border-[var(--status-warning-border)] font-semibold">
                        {msg.summarySnapshot.escalated_legal_count} Escalated Legal
                      </span>
                    )}
                  </div>
                )}

                <p className="text-[var(--text-primary)] text-xs leading-relaxed bg-[var(--bg-sunken)] p-3 rounded-xl border border-[var(--border-subtle)] whitespace-pre-wrap">
                  {msg.answer || "Processing response through 7-agent verification gate..."}
                </p>

                {msg.citations.length > 0 && (
                  <div className="pt-1 space-y-2" role="group" aria-label="Verified source citations">
                    <div className="text-[11px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                      <ShieldCheck size={13} className="text-[var(--accent-brand-ink)]" />
                      <span className="tabular-nums">Citations ({msg.citations.length}):</span>
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
                            className="inline-flex flex-wrap items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--accent-brand-soft)] hover:opacity-90 border border-[var(--accent-brand-border)] text-[var(--accent-brand-ink)] text-[11px] font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)] focus-visible:ring-offset-1 shadow-2xs text-left"
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
                            <span
                              className={`font-mono text-[10px] px-1.5 py-0.5 rounded border shrink-0 font-bold tabular-nums ${citTone.badgeClass}`}
                            >
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
            <div className="p-8 text-center rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-xs">
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
                  className={`p-4 rounded-xl bg-[var(--bg-surface)] border shadow-2xs text-xs space-y-2 transition-colors ${
                    isFailed
                      ? "border-[var(--status-danger-border)] bg-[var(--status-danger-row)]"
                      : isDone
                        ? "border-[var(--border-subtle)] hover:border-[var(--border-strong)]"
                        : "border-[var(--accent-brand-border)] bg-[var(--accent-brand-soft)]"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isFailed
                            ? "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)]"
                            : isDone
                              ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)]"
                              : "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)]"
                        }`}
                      >
                        {run.agentName.slice(0, 1)}
                      </span>
                      <strong className="font-semibold text-[var(--text-primary)]">{run.agentName}</strong>
                      <span className="text-[var(--text-secondary)] text-[11px] font-medium">· {run.role}</span>
                      <span className="px-2 py-0.5 rounded bg-[var(--bg-sunken)] font-mono text-[10px] text-[var(--text-primary)] border border-[var(--border-subtle)] truncate max-w-[200px]">
                        {targetDocLabel}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {elapsedLabel && (
                        <span
                          data-testid="agent-run-elapsed"
                          className="font-mono text-[10px] font-semibold text-[var(--text-secondary)] bg-[var(--bg-sunken)] px-2 py-0.5 rounded border border-[var(--border-subtle)] tabular-nums"
                        >
                          {elapsedLabel}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          isFailed
                            ? "bg-[var(--status-danger-soft)] text-[var(--status-danger-ink)] border border-[var(--status-danger-border)]"
                            : isDone
                              ? "bg-[var(--status-verified-soft)] text-[var(--status-verified-ink)] border border-[var(--status-verified-border)]"
                              : "bg-[var(--accent-brand-soft)] text-[var(--accent-brand-ink)] border border-[var(--accent-brand-border)]"
                        }`}
                      >
                        {isFailed ? (
                          <AlertTriangle size={10} aria-hidden="true" />
                        ) : isDone ? (
                          <CheckCircle2 size={10} aria-hidden="true" />
                        ) : (
                          <RefreshCw size={10} className="spin" aria-hidden="true" />
                        )}
                        <span>{isFailed ? "FAILED" : isDone ? "DONE" : "RUNNING"}</span>
                      </span>
                    </div>
                  </div>

                  <p data-testid="agent-run-summary" className="text-[var(--text-primary)] text-xs leading-relaxed">
                    {humanSummary}
                  </p>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[var(--text-secondary)] pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {run.inputHash && (
                        <span
                          title={run.inputHash}
                          className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)]"
                        >
                          in: {run.inputHash.slice(0, 10)}
                        </span>
                      )}
                      {run.outputHash && (
                        <span
                          title={run.outputHash}
                          className="px-1.5 py-0.5 rounded bg-[var(--bg-sunken)] border border-[var(--border-subtle)]"
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
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[var(--border-strong)] bg-[var(--bg-sunken)] hover:border-[var(--accent-brand-border)] text-[var(--text-primary)] font-semibold cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-brand-ring)]"
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
                      className="mt-2 p-2.5 rounded-lg bg-[var(--bg-hero)] text-[#F4F1EA] border border-[var(--border-subtle)] text-[10px] font-mono overflow-x-auto max-h-56 leading-relaxed"
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
