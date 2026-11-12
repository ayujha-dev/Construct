import type { StateCreator } from "zustand";
import type { WebSocketStatus } from "../hooks/useWebSocket";
import { bertApi, type SummaryQueryParams } from "../lib/api";
import {
  createInitialAgentSteps,
  hydrateAgentStepsFromJob,
  normalizeStepStatus,
  resolveAgentIndex,
  upsertAgentTelemetryFromEvent,
} from "../lib/pipelineTelemetry";
import {
  validateManualOverrideInput,
  validateNotApplicableInput,
} from "../lib/workItemMetrics";
import { getAcceptActionState } from "../lib/triageQueue";
import type {
  AgentRunEntry,
  AgentStepState,
  AuditLogEntry,
  BatchResolvePayload,
  BatchResolveResponse,
  EscalationActionPayload,
  ExecutiveSummary,
  JobExecution,
  PipelineEvent,
  WorkItem,
} from "../types/bert";
import { buildDemoCorpus } from "./demoCorpusService";
import {
  AGENTS,
  cancelLocalSimulation,
  checksum,
  generateLocalExecutiveSummary,
  pauseLocalSimulation,
  resumeLocalSimulation,
  runLocalMultiAgentReview,
  uid,
} from "./simulatorService";
import type { BertState } from "./useBertStore";

export type SummaryStatus = "idle" | "loading" | "ready" | "error";

export interface UndoToast {
  workItemId: string;
  workItemIds: string[];
  label: string;
  action: string;
  isBulk?: boolean;
}

export interface JobExecutionSlice {
  activeJob: JobExecution | null;
  job: JobExecution | null;
  workItems: WorkItem[];
  events: PipelineEvent[];
  agentSteps: AgentStepState[];
  agentRuns: AgentRunEntry[];
  wsStatus: WebSocketStatus;
  jobStartedAt: number | null;
  jobCompletedAt: number | null;
  isSimulating: boolean;
  hasCompletedRun: boolean;
  executiveSummary: ExecutiveSummary | null;
  summaryStatus: SummaryStatus;
  summaryError: string | null;
  summaryParams: SummaryQueryParams;
  auditLogs: AuditLogEntry[];
  workItemUndoSnapshots: Record<string, WorkItem>;
  undoToast: UndoToast | null;
  setWsStatus: (status: WebSocketStatus) => void;
  syncJobState: (jobId: string) => Promise<JobExecution | null>;
  startJob: (documentId?: string) => Promise<void>;
  pauseJob: () => Promise<void>;
  resumeJob: (instruction?: string) => Promise<void>;
  updateWorkItem: (id: string, update: Partial<WorkItem>) => void;
  resolveWorkItem: (
    workItemId: string,
    actionOrPayload?: string | EscalationActionPayload,
    correction?: string
  ) => Promise<void>;
  undoWorkItem: (workItemId: string, actor?: string, note?: string) => Promise<void>;
  undoWorkItems: (workItemIds: string[], actor?: string, note?: string) => Promise<void>;
  dismissUndoToast: () => void;
  batchResolve: (
    workItemIds: string[],
    actionOrPayload: string | Omit<BatchResolvePayload, "work_item_ids">,
    note?: string
  ) => Promise<BatchResolveResponse>;
  loadSummary: (params?: SummaryQueryParams, forceGenerate?: boolean) => Promise<ExecutiveSummary | null>;
  generateSummary: (params?: SummaryQueryParams) => Promise<ExecutiveSummary | null>;
  loadAuditLogs: () => Promise<void>;
  appendEvent: (event: PipelineEvent) => void;
  refresh: () => Promise<void>;
  retryCorpusRefresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
  resetWorkspace: () => Promise<void>;
}

const DEFAULT_SUMMARY_PARAMS: SummaryQueryParams = {
  document_id: null,
  only_critical: false,
  latest_only: false,
};

let corpusEpoch = 0;
let progressiveDocSyncTimer: ReturnType<typeof setTimeout> | null = null;
let progressiveWorkItemSyncTimer: ReturnType<typeof setTimeout> | null = null;

function clearProgressiveSyncTimers(): void {
  if (progressiveDocSyncTimer !== null) {
    globalThis.clearTimeout(progressiveDocSyncTimer);
    progressiveDocSyncTimer = null;
  }
  if (progressiveWorkItemSyncTimer !== null) {
    globalThis.clearTimeout(progressiveWorkItemSyncTimer);
    progressiveWorkItemSyncTimer = null;
  }
}

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|network|load failed|econnrefused|abort/i.test(error.message);
}

export const createJobExecutionSlice: StateCreator<BertState, [], [], JobExecutionSlice> = (set, get) => ({
  activeJob: null,
  job: null,
  workItems: [],
  events: [],
  agentSteps: createInitialAgentSteps(),
  agentRuns: [],
  wsStatus: "connecting",
  jobStartedAt: null,
  jobCompletedAt: null,
  isSimulating: false,
  hasCompletedRun: false,
  executiveSummary: null,
  summaryStatus: "idle",
  summaryError: null,
  summaryParams: DEFAULT_SUMMARY_PARAMS,
  auditLogs: [],
  workItemUndoSnapshots: {},
  undoToast: null,

  setWsStatus: (wsStatus) => set({ wsStatus }),

  syncJobState: async (jobId) => {
    if (!jobId) return null;
    const myEpoch = corpusEpoch;
    try {
      const job = await bertApi.getJob(jobId);
      if (myEpoch !== corpusEpoch) return null;
      const hydrated = hydrateAgentStepsFromJob(job, get().documents);
      const currentRuns = get().agentRuns;
      const mergedRuns = currentRuns.length > 0 ? currentRuns : hydrated.agentRuns;
      set({
        activeJob: job,
        job,
        agentSteps: hydrated.agentSteps,
        agentRuns: mergedRuns,
        isSimulating: job.status === "RUNNING" || job.status === "RESUMING",
        hasCompletedRun: job.status === "COMPLETED" ? true : get().hasCompletedRun,
      });
      return job;
    } catch {
      return null;
    }
  },

  startJob: async (documentId) => {
    const docId = documentId ?? get().selectedDocumentId;
    if (!docId) return;
    try {
      const job = await bertApi.startJob(docId);
      const hydrated = hydrateAgentStepsFromJob(job, get().documents);
      set({
        activeJob: job,
        job,
        workspaceId: job.workspace_id ?? get().workspaceId,
        agentSteps: hydrated.agentSteps,
        agentRuns: hydrated.agentRuns,
        jobStartedAt: Date.now(),
        jobCompletedAt: null,
        isSimulating: true,
        hasCompletedRun: false,
        backendAvailable: true,
      });
    } catch {
      // Local fallback handled in uploadFile
    }
  },

  pauseJob: async () => {
    const job = get().activeJob;
    if (!job || job.status === "COMPLETED") return;
    if (!get().backendAvailable) {
      pauseLocalSimulation();
      const pausedJob: JobExecution = { ...job, status: "PAUSED" };
      set({
        activeJob: pausedJob,
        job: pausedJob,
        isSimulating: false,
        notice: `Paused at ${AGENTS[job.current_agent_index]} (Node ${job.current_node_index + 1}) · Waiting for reviewer direction.`,
      });
      return;
    }
    try {
      const paused = await bertApi.pause(job.job_id).catch(() => bertApi.interrupt(job.job_id));
      set({
        activeJob: paused,
        job: paused,
        isSimulating: false,
        notice: "Pause requested — current atomic step will finish safely.",
      });
    } catch {
      pauseLocalSimulation();
      const pausedJob: JobExecution = { ...job, status: "PAUSED" };
      set({ activeJob: pausedJob, job: pausedJob, isSimulating: false });
    }
  },

  resumeJob: async (instruction) => {
    const job = get().activeJob;
    if (!job) return;
    if (!get().backendAvailable) {
      resumeLocalSimulation();
      const resumedJob: JobExecution = {
        ...job,
        status: "RUNNING",
        user_override_instructions: instruction
          ? [...job.user_override_instructions, instruction]
          : job.user_override_instructions,
      };
      set({
        activeJob: resumedJob,
        job: resumedJob,
        isSimulating: true,
        notice: instruction
          ? `Applied instruction: "${instruction}" · Resuming execution.`
          : "Review resumed from checkpoint.",
      });
      return;
    }
    try {
      const resumed = await bertApi.resume(job.job_id, instruction);
      const hydrated = hydrateAgentStepsFromJob(resumed, get().documents);
      const hasTelemetry = hydrated.agentSteps.some((s) => s.status !== "pending");
      set((s) => ({
        activeJob: resumed,
        job: resumed,
        ...(hasTelemetry ? { agentSteps: hydrated.agentSteps } : {}),
        ...(s.agentRuns.length === 0 && hydrated.agentRuns.length > 0 ? { agentRuns: hydrated.agentRuns } : {}),
        isSimulating: true,
        notice: instruction
          ? `Applied instruction: "${instruction}" · Resuming execution.`
          : "Review resumed from checkpoint.",
      }));
    } catch {
      resumeLocalSimulation();
      const resumedJob: JobExecution = { ...job, status: "RUNNING" };
      set({ activeJob: resumedJob, job: resumedJob, isSimulating: true });
    }
  },

  updateWorkItem: (id, update) => {
    set((state) => ({
      workItems: state.workItems.map((item) => (item.id === id ? { ...item, ...update } : item)),
    }));
  },

  dismissUndoToast: () => set({ undoToast: null }),

  loadSummary: async (params, forceGenerate = false) => {
    const resolvedParams: SummaryQueryParams = {
      document_id:
        params?.document_id !== undefined ? params.document_id : get().summaryParams.document_id ?? null,
      only_critical:
        params?.only_critical !== undefined ? params.only_critical : Boolean(get().summaryParams.only_critical),
      latest_only:
        params?.latest_only !== undefined ? params.latest_only : Boolean(get().summaryParams.latest_only),
    };
    set({ summaryStatus: "loading", summaryError: null, summaryParams: resolvedParams });

    const runLocal = () => {
      const s = get();
      const local = generateLocalExecutiveSummary({
        documents: s.documents,
        workItems: s.workItems,
        documentId: resolvedParams.document_id ?? null,
        onlyCritical: Boolean(resolvedParams.only_critical),
        latestOnly: Boolean(resolvedParams.latest_only),
        workspaceId: s.workspaceId,
      });
      set({ executiveSummary: local, summaryStatus: "ready", summaryError: null });
      return local;
    };

    if (!get().backendAvailable) {
      return runLocal();
    }

    try {
      const summary = forceGenerate
        ? await bertApi.generateSummary(resolvedParams)
        : await bertApi.getSummary(resolvedParams);
      set({ executiveSummary: summary, summaryStatus: "ready", summaryError: null });
      return summary;
    } catch (err) {
      if (isNetworkFailure(err) || (err instanceof Error && /not found|404/i.test(err.message))) {
        return runLocal();
      }
      const message = err instanceof Error ? err.message : "Failed to load executive summary.";
      set({ summaryStatus: "error", summaryError: message });
      return null;
    }
  },

  generateSummary: async (params) => {
    return get().loadSummary(params, true);
  },

  loadAuditLogs: async () => {
    if (!get().backendAvailable) return;
    try {
      const rows = await bertApi.getAuditLog();
      const localFallback = get().auditLogs.filter((l) => l.model_name === "human-review-console");
      set({ auditLogs: localFallback.length > 0 ? [...localFallback, ...rows] : rows });
    } catch {
      // Retain local audit log entries if unreachable
    }
  },

  resolveWorkItem: async (workItemId, actionOrPayload = "manual_correction", correction = "") => {
    const state = get();
    const payload: EscalationActionPayload =
      typeof actionOrPayload === "string"
        ? {
            action: (actionOrPayload === "not_applicable" ? "skip" : actionOrPayload) as EscalationActionPayload["action"],
            correction,
          }
        : {
            ...actionOrPayload,
            action: (actionOrPayload.action === ("not_applicable" as string)
              ? "skip"
              : actionOrPayload.action) as EscalationActionPayload["action"],
          };

    if (payload.action === "undo") {
      await get().undoWorkItem(workItemId, payload.actor, payload.note);
      return;
    }

    const existing = state.workItems.find((item) => item.id === workItemId);
    const snapshot = existing ? { ...existing } : undefined;

    if (payload.action === "manual_correction") {
      const check = validateManualOverrideInput({
        correction: payload.correction ?? payload.note ?? "",
        reasonCode: payload.reason_code ?? "",
        overrideLocator: payload.override_locator ?? null,
        overrideCitationText: payload.override_citation_text ?? null,
        noEvidenceAttestation: payload.no_evidence_attestation,
        hasExistingLocator: Boolean(
          existing?.verified_citations?.some((c) => Boolean(c.locator || c.bounding_box || c.quote))
        ),
      });
      if (!check.valid) {
        const msg = check.message || "Invalid manual override submission.";
        set({ notice: msg });
        throw new Error(msg);
      }
    } else if (payload.action === "skip") {
      const check = validateNotApplicableInput({
        reasonCode: payload.reason_code,
        note: payload.note ?? payload.correction,
      });
      if (!check.valid) {
        const msg = check.message || "Mark N/A requires an explicit reason.";
        set({ notice: msg });
        throw new Error(msg);
      }
    } else if (payload.action === "approve" && existing) {
      const acceptState = getAcceptActionState(existing);
      if (!acceptState.visible) {
        const msg = "Cannot accept item without machine-extracted or vision rescue evidence.";
        set({ notice: msg });
        throw new Error(msg);
      }
    }

    let updatedItem: WorkItem | null = null;
    let usedFallback = false;

    if (state.backendAvailable) {
      try {
        const remote = await bertApi.resolve(workItemId, payload);
        if (payload.action === "counsel" && remote.verification_status !== "ESCALATED_LEGAL") {
          updatedItem = null;
        } else {
          updatedItem = remote;
        }
      } catch (err) {
        if (!isNetworkFailure(err)) {
          const msg = err instanceof Error ? err.message : "Failed to resolve work item.";
          set({ notice: msg });
          throw err instanceof Error ? err : new Error(msg);
        }
        updatedItem = null;
      }
    }

    if (!updatedItem && existing) {
      usedFallback = true;
      const action = payload.action;
      let status: WorkItem["verification_status"] = "VERIFIED";
      // Phase 3 invariant: human override & N/A NEVER downgrade priority_tier or priority_score
      let tier: WorkItem["priority_tier"] = existing.priority_tier;
      let score = existing.priority_score;
      let output = payload.correction || payload.note || existing.fluent_output;
      let escalationReason = existing.escalation_reason ?? null;
      let escalationAssignee = existing.escalation_assignee ?? null;
      let escalatedAt = existing.escalated_at ?? null;
      const escalatedBy = payload.actor?.trim() || "Compliance Reviewer";
      const originalTier = existing.original_priority_tier ?? existing.priority_tier;
      let humanOverrideReasonCode = existing.human_override_reason_code ?? null;
      let noEvidenceAttestation = existing.no_evidence_attestation ?? false;
      let overrideLocator = existing.override_locator ?? null;
      let gateTelemetry = { ...existing.gate_telemetry };

      if (action === "manual_correction") {
        status = "HUMAN_OVERRIDE";
        output = (payload.correction ?? payload.note ?? "").trim();
        tier = existing.priority_tier;
        score = existing.priority_score;
        humanOverrideReasonCode = payload.reason_code?.trim() || "SME_ATTESTATION";
        noEvidenceAttestation = Boolean(payload.no_evidence_attestation);
        overrideLocator =
          payload.override_locator ??
          (payload.override_citation_text?.trim()
            ? {
                source_type: "text",
                doc_id: existing.document_id ?? "",
              }
            : existing.override_locator ?? null);
        escalationReason = payload.note?.trim() || humanOverrideReasonCode;
        // Never inflate machine match% or critical logprob telemetry on human override
        gateTelemetry = {
          ...existing.gate_telemetry,
          citation_match: existing.gate_telemetry?.citation_match ?? 0,
          critical_logprob: existing.gate_telemetry?.critical_logprob ?? 0,
          override_citation_text:
            payload.override_citation_text?.trim() ||
            existing.gate_telemetry?.override_citation_text ||
            null,
          manual_override: true,
        };
      } else if (action === "retry") {
        status = "NEEDS_HUMAN_VERIFICATION";
        output = "Deep vision rescue retry requested — awaiting fresh crop pass.";
        tier = existing.priority_tier === "P0_CRITICAL" ? "P0_CRITICAL" : "P1_HIGH";
        score = Math.max(existing.priority_score, 75);
        escalationReason = payload.note?.trim() || "Deep vision retry requested.";
      } else if (action === "skip") {
        status = "NOT_APPLICABLE";
        tier = existing.priority_tier;
        score = existing.priority_score;
        humanOverrideReasonCode = payload.reason_code?.trim() || "OUT_OF_SCOPE";
        escalationReason =
          payload.note?.trim() || payload.correction?.trim() || humanOverrideReasonCode;
        output =
          payload.note?.trim() ||
          payload.correction?.trim() ||
          `Marked Not Applicable (${humanOverrideReasonCode})`;
      } else if (action === "counsel") {
        // Legal Counsel escalation preserves original priority tier & score; excluded from VERIFIED numerator
        status = "ESCALATED_LEGAL";
        tier = existing.priority_tier;
        score = existing.priority_score;
        escalationReason =
          payload.reason_code?.trim() ||
          payload.note?.trim() ||
          payload.correction?.trim() ||
          "Referred to legal counsel for review.";
        escalationAssignee = payload.assignee?.trim() || "Legal Counsel";
        escalatedAt = new Date().toISOString();
        output = `Escalated to ${escalationAssignee}: ${escalationReason}`;
      } else if (action === "approve") {
        const acceptState = getAcceptActionState(existing);
        status = "VERIFIED";
        const adoptedText =
          acceptState.kind === "rescue"
            ? existing.vision_rescue_text || existing.structured_facts[0]?.verbatim_quote || ""
            : existing.machine_extracted_text || existing.structured_facts[0]?.verbatim_quote || "";
        output =
          adoptedText ||
          payload.correction?.trim() ||
          "Reviewer approved finding.";
      }

      updatedItem = {
        ...existing,
        verification_status: status,
        priority_tier: tier,
        priority_score: score,
        fluent_output: output,
        resolved_by_tier:
          action === "counsel" || action === "retry" ? existing.resolved_by_tier : "HUMAN_IN_THE_LOOP",
        escalation_reason: escalationReason,
        escalation_assignee: escalationAssignee,
        escalated_at: escalatedAt,
        escalated_by: escalatedBy,
        original_priority_tier: originalTier,
        human_override_reason_code: humanOverrideReasonCode,
        no_evidence_attestation: noEvidenceAttestation,
        override_locator: overrideLocator,
        gate_telemetry: gateTelemetry,
        can_undo: true,
      };
    }

    if (updatedItem) {
      const itemToSet = updatedItem;
      const inHash = await checksum(JSON.stringify({ workItemId, payload }));
      const outHash = await checksum(JSON.stringify({ status: itemToSet.verification_status, output: itemToSet.fluent_output }));
      const localAudit: AuditLogEntry = {
        id: Date.now(),
        document_id: itemToSet.document_id,
        work_item_id: itemToSet.id,
        agent_name: "Human Review",
        action: `ESCALATION_${payload.action.toUpperCase()}`,
        input_hash: inHash,
        output_hash: outHash,
        confidence: null,
        model_name: "human-review-console",
        processing_time_ms: 1,
        metadata_json: {
          action: payload.action,
          reason: itemToSet.escalation_reason,
          reason_code: itemToSet.human_override_reason_code,
          no_evidence_attestation: itemToSet.no_evidence_attestation,
          assignee: itemToSet.escalation_assignee,
          original_priority_tier: itemToSet.original_priority_tier,
        },
        created_at: new Date().toISOString(),
      };

      set((s) => ({
        workItems: s.workItems.map((item) => (item.id === workItemId ? itemToSet : item)),
        workItemUndoSnapshots: snapshot
          ? { ...s.workItemUndoSnapshots, [workItemId]: snapshot }
          : s.workItemUndoSnapshots,
        auditLogs: usedFallback || !s.backendAvailable ? [localAudit, ...s.auditLogs.slice(0, 249)] : s.auditLogs,
        undoToast: {
          workItemId,
          workItemIds: [workItemId],
          label: itemToSet.prompt_or_question.slice(0, 48),
          action:
            payload.action === "counsel"
              ? "Flagged for Legal"
              : payload.action === "manual_correction"
                ? "Human Override"
                : payload.action === "skip"
                  ? "Marked N/A"
                  : payload.action === "approve"
                    ? getAcceptActionState(existing).kind === "rescue"
                      ? "Accepted Vision Rescue Text"
                      : "Accepted Extracted Evidence"
                    : `Updated (${itemToSet.verification_status})`,
          isBulk: false,
        },
        notice:
          payload.action === "counsel"
            ? `Escalated "${itemToSet.prompt_or_question.slice(0, 32)}..." to ${itemToSet.escalation_assignee || "Legal Counsel"} (${itemToSet.priority_tier} preserved).`
            : `Updated "${itemToSet.prompt_or_question.slice(0, 36)}..." (${itemToSet.verification_status} · ${itemToSet.priority_tier}).`,
      }));

      void get().loadSummary(get().summaryParams, true);
      if (state.backendAvailable && !usedFallback) void get().loadAuditLogs();
    }
  },

  undoWorkItem: async (workItemId, actor, note) => {
    const state = get();
    let restored: WorkItem | null = null;
    let usedFallback = false;

    if (state.backendAvailable) {
      try {
        restored = await bertApi.undoWorkItem(workItemId, { actor, note });
      } catch {
        restored = null;
      }
    }

    if (!restored) {
      usedFallback = true;
      const snap = state.workItemUndoSnapshots[workItemId];
      if (!snap) return;
      restored = { ...snap, can_undo: false };
    }

    const finalItem = restored;
    const inHash = await checksum(JSON.stringify({ action: "undo", workItemId, actor, note }));
    const outHash = await checksum(JSON.stringify({ status: finalItem.verification_status }));
    const localAudit: AuditLogEntry = {
      id: Date.now(),
      document_id: finalItem.document_id,
      work_item_id: finalItem.id,
      agent_name: "Human Review",
      action: "ESCALATION_UNDO",
      input_hash: inHash,
      output_hash: outHash,
      confidence: null,
      model_name: "human-review-console",
      processing_time_ms: 1,
      metadata_json: {
        action: "undo",
        restored_status: finalItem.verification_status,
        restored_priority_tier: finalItem.priority_tier,
      },
      created_at: new Date().toISOString(),
    };

    set((s) => {
      const nextSnaps = { ...s.workItemUndoSnapshots };
      delete nextSnaps[workItemId];
      return {
        workItems: s.workItems.map((item) => (item.id === workItemId ? finalItem : item)),
        workItemUndoSnapshots: nextSnaps,
        auditLogs: usedFallback || !s.backendAvailable ? [localAudit, ...s.auditLogs.slice(0, 249)] : s.auditLogs,
        undoToast: null,
        notice: `Reverted "${finalItem.prompt_or_question.slice(0, 36)}..." back to ${finalItem.verification_status}.`,
      };
    });

    void get().loadSummary(get().summaryParams, true);
    if (state.backendAvailable && !usedFallback) void get().loadAuditLogs();
  },

  undoWorkItems: async (workItemIds, actor, note) => {
    const uniqueIds = Array.from(new Set(workItemIds.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    if (uniqueIds.length === 1) {
      await get().undoWorkItem(uniqueIds[0], actor, note);
      return;
    }
    for (const id of uniqueIds) {
      await get().undoWorkItem(id, actor, note);
    }
    set({
      undoToast: null,
      notice: `Reverted ${uniqueIds.length} item(s) to previous state.`,
    });
  },

  batchResolve: async (workItemIds, actionOrPayload, note = "") => {
    const uniqueIds = Array.from(new Set(workItemIds.filter(Boolean)));
    if (uniqueIds.length === 0) {
      return { updated_count: 0, skipped_ids: [], items: [], errors: [] };
    }

    const basePayload: Omit<BatchResolvePayload, "work_item_ids"> =
      typeof actionOrPayload === "string"
        ? {
            action: (actionOrPayload === "not_applicable"
              ? "skip"
              : actionOrPayload) as EscalationActionPayload["action"],
            note,
          }
        : {
            ...actionOrPayload,
            action: (actionOrPayload.action === ("not_applicable" as string)
              ? "skip"
              : actionOrPayload.action) as EscalationActionPayload["action"],
          };

    if (basePayload.action === "skip") {
      const check = validateNotApplicableInput({
        reasonCode: basePayload.reason_code,
        note: basePayload.note ?? basePayload.correction,
      });
      if (!check.valid) {
        const msg = check.message || "Mark N/A requires an explicit reason.";
        set({ notice: msg });
        throw new Error(msg);
      }
    } else if (basePayload.action === "manual_correction") {
      const check = validateManualOverrideInput({
        correction: basePayload.correction ?? basePayload.note ?? "",
        reasonCode: basePayload.reason_code ?? "",
        noEvidenceAttestation: basePayload.no_evidence_attestation,
      });
      if (!check.valid) {
        const msg = check.message || "Invalid manual override submission.";
        set({ notice: msg });
        throw new Error(msg);
      }
    }

    const state = get();
    const preSnapshots: Record<string, WorkItem> = {};
    for (const id of uniqueIds) {
      const found = state.workItems.find((item) => item.id === id);
      if (found) preSnapshots[id] = { ...found };
    }

    const actionToastLabel =
      basePayload.action === "counsel"
        ? "Bulk Flagged for Legal"
        : basePayload.action === "skip"
          ? "Bulk Marked N/A"
          : basePayload.action === "approve"
            ? "Bulk Accepted Evidence"
            : basePayload.action === "manual_correction"
              ? "Bulk Override"
              : `Bulk ${basePayload.action}`;

    if (state.backendAvailable) {
      try {
        const response = await bertApi.batchResolve({
          work_item_ids: uniqueIds,
          ...basePayload,
        });
        const updatedMap = new Map(response.items.map((item) => [item.id, item]));
        const updatedIds = response.items.map((item) => item.id);
        set((s) => {
          const nextSnaps = { ...s.workItemUndoSnapshots };
          for (const id of updatedIds) {
            if (preSnapshots[id]) {
              nextSnaps[id] = preSnapshots[id];
            }
          }
          return {
            workItems: s.workItems.map((item) => updatedMap.get(item.id) ?? item),
            workItemUndoSnapshots: nextSnaps,
            undoToast:
              updatedIds.length > 0
                ? {
                    workItemId: updatedIds[0],
                    workItemIds: updatedIds,
                    label: `${updatedIds.length} item${updatedIds.length === 1 ? "" : "s"}`,
                    action: actionToastLabel,
                    isBulk: updatedIds.length > 1,
                  }
                : s.undoToast,
            notice: `Batch resolved ${response.updated_count} item(s)${
              response.skipped_ids.length > 0 ? ` (${response.skipped_ids.length} skipped)` : ""
            }.`,
          };
        });
        void get().loadSummary(get().summaryParams, true);
        void get().loadAuditLogs();
        return response;
      } catch (err) {
        if (!isNetworkFailure(err) && !(err instanceof Error && /404|not found/i.test(err.message))) {
          const msg = err instanceof Error ? err.message : "Batch resolve failed.";
          set({ notice: msg });
          throw err instanceof Error ? err : new Error(msg);
        }
      }
    }

    // Offline / local deterministic fallback parity
    const updatedItems: WorkItem[] = [];
    const skippedIds: string[] = [];
    const errors: Array<Record<string, unknown>> = [];

    for (const id of uniqueIds) {
      const existing = get().workItems.find((w) => w.id === id);
      if (!existing) {
        skippedIds.push(id);
        errors.push({ work_item_id: id, error: "Item not found" });
        continue;
      }
      if (basePayload.action === "approve" && !getAcceptActionState(existing).visible) {
        skippedIds.push(id);
        errors.push({ work_item_id: id, error: "No machine or rescue text" });
        continue;
      }
      try {
        await get().resolveWorkItem(id, {
          action: basePayload.action,
          note: basePayload.note,
          correction: basePayload.correction,
          reason_code: basePayload.reason_code,
          assignee: basePayload.assignee,
          actor: basePayload.actor,
          no_evidence_attestation: basePayload.no_evidence_attestation,
        });
        const latestItem = get().workItems.find((w) => w.id === id);
        if (latestItem) updatedItems.push(latestItem);
      } catch (err) {
        skippedIds.push(id);
        errors.push({
          work_item_id: id,
          error: err instanceof Error ? err.message : "Resolve failed",
        });
      }
    }

    const updatedIds = updatedItems.map((i) => i.id);
    if (updatedIds.length > 0) {
      set((s) => ({
        workItemUndoSnapshots: { ...s.workItemUndoSnapshots, ...preSnapshots },
        undoToast: {
          workItemId: updatedIds[0],
          workItemIds: updatedIds,
          label: `${updatedIds.length} item${updatedIds.length === 1 ? "" : "s"}`,
          action: actionToastLabel,
          isBulk: updatedIds.length > 1,
        },
        notice: `Batch resolved ${updatedIds.length} item(s)${
          skippedIds.length > 0 ? ` (${skippedIds.length} skipped)` : ""
        }.`,
      }));
    }

    return {
      updated_count: updatedItems.length,
      skipped_ids: skippedIds,
      items: updatedItems,
      errors,
    };
  },

  appendEvent: (event) => {
    if (event.type === "corpus_reset") {
      cancelLocalSimulation();
      clearProgressiveSyncTimers();
      corpusEpoch += 1;
      set({
        documents: [],
        nodesByDocument: {},
        workItems: [],
        events: [],
        agentSteps: createInitialAgentSteps(),
        agentRuns: [],
        jobStartedAt: null,
        jobCompletedAt: null,
        chatMessages: [],
        messages: [],
        executiveSummary: null,
        summaryStatus: "idle",
        summaryError: null,
        auditLogs: [],
        selectedDocumentId: null,
        selectedFileFilterId: null,
        selectedNodeId: null,
        activeHighlightBox: null,
        activeLocator: null,
        activeCitationQuote: null,
        activeRegionMatchScore: null,
        requestedPage: null,
        currentPdfPage: null,
        documentFiles: {},
        activeJob: null,
        job: null,
        isSimulating: false,
        hasCompletedRun: false,
        workItemUndoSnapshots: {},
        undoToast: null,
        corpusStatus: "idle",
        corpusError: null,
      });
      return;
    }

    const now = Date.now();
    set((state) => {
      let nextJob = state.activeJob;
      if (state.activeJob && (!event.job_id || event.job_id === state.activeJob.job_id)) {
        const isJobTransition = [
          "JOB_PAUSED",
          "JOB_PAUSING",
          "JOB_RESUMED",
          "JOB_RESUMING",
          "JOB_COMPLETED",
          "JOB_FAILED",
        ].includes(event.type);

        let newStatus = state.activeJob.status;
        if (event.type === "JOB_RESUMED") {
          newStatus = "RUNNING";
        } else if (isJobTransition) {
          newStatus = event.type.replace("JOB_", "") as JobExecution["status"];
        } else if (
          event.job_status &&
          ["RUNNING", "PAUSING", "PAUSED", "RESUMING", "COMPLETED", "FAILED"].includes(String(event.job_status))
        ) {
          newStatus = String(event.job_status) as JobExecution["status"];
        } else if (
          event.status &&
          ["RUNNING", "PAUSING", "PAUSED", "RESUMING", "COMPLETED", "FAILED"].includes(event.status)
        ) {
          // Ignore lowercase "running"/"completed" on agent_transition events
          newStatus = event.status as JobExecution["status"];
        }

        const derivedAgentIdx =
          event.current_agent_index !== undefined
            ? event.current_agent_index
            : event.type === "agent_transition" && event.agent_name
              ? resolveAgentIndex(event)
              : state.activeJob.current_agent_index;

        nextJob = {
          ...state.activeJob,
          status: newStatus,
          current_agent_index: derivedAgentIdx,
          current_node_index:
            event.current_node_index !== undefined && event.current_node_index !== null
              ? event.current_node_index
              : state.activeJob.current_node_index,
          current_document_id:
            event.document_id !== undefined ? event.document_id : state.activeJob.current_document_id,
          error_message:
            event.type === "JOB_FAILED"
              ? (event.message ?? state.activeJob.error_message)
              : event.type === "JOB_RESUMED"
                ? null
                : state.activeJob.error_message,
        };
      }

      const isCompleted = event.type === "JOB_COMPLETED" || event.status === "COMPLETED";
      const isPaused = event.type === "JOB_PAUSED" || event.status === "PAUSED";
      const isFailed = event.type === "JOB_FAILED" || event.status === "FAILED";
      const isResumed = event.type === "JOB_RESUMED" || event.type === "JOB_RESUMING";

      const { agentSteps, agentRuns } = upsertAgentTelemetryFromEvent({
        agentSteps: state.agentSteps,
        agentRuns: state.agentRuns,
        event,
        documents: state.documents,
        activeJobId: nextJob?.job_id ?? state.activeJob?.job_id ?? null,
        now,
      });

      let nextWorkItems = state.workItems;
      if (event.type === "work_item" && event.work_item) {
        const incoming = event.work_item;
        const exists = state.workItems.some((w) => w.id === incoming.id);
        nextWorkItems = exists
          ? state.workItems.map((w) => (w.id === incoming.id ? incoming : w))
          : [...state.workItems, incoming];
      }

      return {
        events: [...state.events.slice(-249), { ...event, created_at: event.created_at ?? now }],
        activeJob: nextJob,
        job: nextJob,
        agentSteps,
        agentRuns,
        workItems: nextWorkItems,
        jobStartedAt: state.jobStartedAt ?? (event.type === "agent_transition" ? now : null),
        jobCompletedAt: isCompleted || isFailed ? now : isResumed ? null : state.jobCompletedAt,
        isSimulating:
          isCompleted || isPaused || isFailed
            ? false
            : isResumed || state.isSimulating || nextJob?.status === "RUNNING" || nextJob?.status === "RESUMING",
        hasCompletedRun: isCompleted ? true : state.hasCompletedRun,
      };
    });

    if (event.type === "JOB_COMPLETED" || event.status === "COMPLETED") {
      clearProgressiveSyncTimers();
      void get().refresh();
      const jobId = event.job_id || get().activeJob?.job_id;
      if (jobId && get().backendAvailable) {
        void get().syncJobState(jobId);
      }
      return;
    }

    if (event.type === "summary_generated") {
      void get().loadSummary(get().summaryParams, false);
      return;
    }

    // Progressive Inspector Population (online backend only; 0 timers while idle)
    if (get().backendAvailable) {
      const myEpoch = corpusEpoch;
      const isStepCompleted =
        event.type === "agent_transition" && normalizeStepStatus(event.status) === "done";
      const agentIdx = event.type === "agent_transition" ? resolveAgentIndex(event) : -1;

      if (isStepCompleted && agentIdx >= 0 && agentIdx <= 2) {
        const targetDocId = event.document_id ?? null;
        if (progressiveDocSyncTimer !== null) {
          globalThis.clearTimeout(progressiveDocSyncTimer);
        }
        progressiveDocSyncTimer = globalThis.setTimeout(() => {
          progressiveDocSyncTimer = null;
          if (myEpoch !== corpusEpoch || !get().backendAvailable) return;
          void (async () => {
            try {
              const documents = await bertApi.getDocuments();
              if (myEpoch !== corpusEpoch || documents.length === 0) return;
              const latest = get();
              const selectedDocumentId =
                latest.selectedDocumentId && documents.some((d) => d.id === latest.selectedDocumentId)
                  ? latest.selectedDocumentId
                  : documents[0].id;
              set({ documents, corpusStatus: "ready", corpusError: null, selectedDocumentId });
              const docToLoad =
                (targetDocId && documents.some((d) => d.id === targetDocId) ? targetDocId : null) ??
                selectedDocumentId;
              if (docToLoad) {
                await get().loadNodes(docToLoad);
              }
            } catch {
              /* ignore transient mid-flight fetch errors */
            }
          })();
        }, 120);
      }

      if (event.type === "work_item" || (isStepCompleted && agentIdx >= 4)) {
        if (progressiveWorkItemSyncTimer !== null) {
          globalThis.clearTimeout(progressiveWorkItemSyncTimer);
        }
        progressiveWorkItemSyncTimer = globalThis.setTimeout(() => {
          progressiveWorkItemSyncTimer = null;
          if (myEpoch !== corpusEpoch || !get().backendAvailable) return;
          void (async () => {
            try {
              const workItems = await bertApi.getWorkItems();
              if (myEpoch !== corpusEpoch) return;
              set({ workItems });
            } catch {
              /* ignore transient mid-flight fetch errors */
            }
          })();
        }, 160);
      }
    }
  },

  refresh: async () => {
    const myEpoch = corpusEpoch;
    // Never wipe documents while loading so Active Corpus sidebar has zero 0-file flicker
    set({ corpusStatus: "loading", corpusError: null });
    try {
      const [documents, workItems] = await Promise.all([bertApi.getDocuments(), bertApi.getWorkItems()]);
      if (myEpoch !== corpusEpoch) return;
      const latest = get();
      const jobActive =
        latest.isSimulating || latest.activeJob?.status === "RUNNING" || latest.activeJob?.status === "RESUMING";

      // Anti-flicker guard: if a background demo/ingest job just cleared DB rows mid-flight, keep staged docs intact
      if (documents.length === 0 && jobActive && latest.documents.length > 0) {
        set({ backendAvailable: true, corpusStatus: "ready", corpusError: null });
        return;
      }

      const currentSelected = latest.selectedDocumentId;
      const defaultDoc =
        documents.find(
          (d) =>
            d.is_latest_version &&
            (d.source_format === "DIGITAL_PDF" || d.filename.toLowerCase().endsWith(".pdf"))
        ) ??
        documents.find(
          (d) =>
            d.source_format === "DIGITAL_PDF" ||
            d.source_format === "PHYSICAL_SCAN" ||
            d.filename.toLowerCase().endsWith(".pdf")
        ) ??
        documents[0] ??
        null;
      const selectedDocumentId =
        currentSelected && documents.some((d) => d.id === currentSelected)
          ? currentSelected
          : (defaultDoc?.id ?? null);

      const currentFilter = latest.selectedFileFilterId;
      const selectedFileFilterId =
        currentFilter && documents.some((d) => d.id === currentFilter) ? currentFilter : null;

      const resolvedWorkspaceId =
        documents[0]?.workspace_id ?? workItems[0]?.workspace_id ?? latest.workspaceId ?? null;

      const hasCompletedRun =
        latest.hasCompletedRun ||
        (workItems.length > 0 && !jobActive && latest.activeJob?.status !== "PAUSED");

      set({
        documents,
        workItems,
        backendAvailable: true,
        corpusStatus: "ready",
        corpusError: null,
        workspaceId: resolvedWorkspaceId,
        selectedDocumentId,
        selectedFileFilterId,
        hasCompletedRun,
      });

      if (selectedDocumentId && !get().nodesByDocument[selectedDocumentId]) {
        await get().loadNodes(selectedDocumentId);
      }
      if (myEpoch !== corpusEpoch) return;
      void get().loadSummary(get().summaryParams, false);
      void get().loadAuditLogs();
    } catch (err) {
      if (myEpoch !== corpusEpoch) return;
      const latest = get();
      const networkDown = isNetworkFailure(err);
      const rawMessage = err instanceof Error ? err.message.trim() : "";
      const corpusError =
        !networkDown && rawMessage
          ? `Corpus sync failed: ${rawMessage.slice(0, 120)}`
          : "Corpus API unreachable — retry or load local demo/files.";
      set({
        backendAvailable: networkDown ? false : latest.backendAvailable,
        corpusStatus: "error",
        corpusError,
      });
    }
  },

  retryCorpusRefresh: async () => {
    await get().refresh();
  },

  resetWorkspace: async () => {
    cancelLocalSimulation();
    clearProgressiveSyncTimers();
    const myEpoch = ++corpusEpoch;
    if (get().backendAvailable) {
      try {
        await bertApi.resetCorpus();
      } catch {
        // Proceed with local atomic reset even if backend reset fails/offline
      }
    }
    if (myEpoch !== corpusEpoch) return;
    set({
      documents: [],
      nodesByDocument: {},
      workItems: [],
      events: [],
      agentSteps: createInitialAgentSteps(),
      agentRuns: [],
      jobStartedAt: null,
      jobCompletedAt: null,
      chatMessages: [],
      messages: [],
      executiveSummary: null,
      summaryStatus: "idle",
      summaryError: null,
      auditLogs: [],
      selectedDocumentId: null,
      selectedFileFilterId: null,
      selectedNodeId: null,
      activeHighlightBox: null,
      activeLocator: null,
      activeCitationQuote: null,
      activeRegionMatchScore: null,
      requestedPage: null,
      currentPdfPage: null,
      documentFiles: {},
      activeJob: null,
      job: null,
      isSimulating: false,
      hasCompletedRun: false,
      workItemUndoSnapshots: {},
      undoToast: null,
      corpusStatus: "idle",
      corpusError: null,
      notice: "Workspace reset · Ready for a fresh corpus or demo case.",
    });
  },

  loadDemo: async () => {
    cancelLocalSimulation();
    clearProgressiveSyncTimers();
    const myEpoch = ++corpusEpoch;
    // Atomic transient-state clear while keeping existing documents intact during load to avoid 0-file flash
    set({
      corpusStatus: "loading",
      corpusError: null,
      events: [],
      agentSteps: createInitialAgentSteps(),
      agentRuns: [],
      jobStartedAt: Date.now(),
      jobCompletedAt: null,
      chatMessages: [],
      messages: [],
      workItems: [],
      executiveSummary: null,
      summaryStatus: "idle",
      summaryError: null,
      auditLogs: [],
      selectedNodeId: null,
      activeHighlightBox: null,
      activeLocator: null,
      activeCitationQuote: null,
      activeRegionMatchScore: null,
      requestedPage: null,
      currentPdfPage: null,
      selectedFileFilterId: null,
      documentFiles: {},
      undoToast: null,
      workItemUndoSnapshots: {},
      hasCompletedRun: false,
      isSimulating: true,
    });

    let started = false;
    try {
      const job = await bertApi.startDemo();
      if (myEpoch !== corpusEpoch) return;
      const stillRunning = job.status === "RUNNING" || job.status === "RESUMING";
      const hydrated = hydrateAgentStepsFromJob(job, get().documents);
      set({
        activeJob: job,
        job,
        agentSteps: hydrated.agentSteps,
        agentRuns: hydrated.agentRuns,
        workspaceId: job.workspace_id,
        isSimulating: stillRunning,
        hasCompletedRun: job.status === "COMPLETED",
        backendAvailable: true,
        notice: "Investor demo case loaded · 7-Agent regiment reviewing corpus.",
      });
      await get().refresh();
      started = true;
    } catch {
      // Backend unavailable or demo failed, seed rich local demo case
    }

    if (myEpoch !== corpusEpoch) return;

    if (!started) {
      const demo = buildDemoCorpus();
      const batchId = uid();
      const job: JobExecution = {
        job_id: uid(),
        workspace_id: demo.workspaceId,
        batch_id: batchId,
        status: "RUNNING",
        current_agent_index: 0,
        current_document_id: demo.documents[0].id,
        current_node_index: 0,
        checkpoint_id: uid(),
        completed_step_outputs: {},
        user_override_instructions: [],
        error_message: null,
      };

      set({
        documents: demo.documents,
        nodesByDocument: {},
        workItems: [],
        workspaceId: demo.workspaceId,
        corpusStatus: "ready",
        corpusError: null,
        selectedDocumentId: demo.documents[0].id,
        selectedFileFilterId: null,
        activeJob: job,
        job,
        agentSteps: createInitialAgentSteps(job.job_id),
        agentRuns: [],
        jobStartedAt: Date.now(),
        jobCompletedAt: null,
        isSimulating: true,
        hasCompletedRun: false,
        backendAvailable: false,
        notice: `Investor demo case loaded · ${demo.documents.length} documents active in corpus.`,
      });

      void runLocalMultiAgentReview(set, get, demo.documents, job, {
        nodesByDocument: demo.nodesByDocument,
        workItems: demo.workItems,
      });
    }
  },
});
