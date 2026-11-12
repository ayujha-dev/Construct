import type { StateCreator } from "zustand";
import { bertApi, type SummaryQueryParams } from "../lib/api";
import type {
  AuditLogEntry,
  EscalationActionPayload,
  ExecutiveSummary,
  JobExecution,
  PipelineEvent,
  WorkItem,
} from "../types/bert";
import { buildDemoCorpus } from "./demoCorpusService";
import {
  AGENTS,
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
  label: string;
  action: string;
}

export interface JobExecutionSlice {
  activeJob: JobExecution | null;
  job: JobExecution | null;
  workItems: WorkItem[];
  events: PipelineEvent[];
  isSimulating: boolean;
  executiveSummary: ExecutiveSummary | null;
  summaryStatus: SummaryStatus;
  summaryError: string | null;
  summaryParams: SummaryQueryParams;
  auditLogs: AuditLogEntry[];
  workItemUndoSnapshots: Record<string, WorkItem>;
  undoToast: UndoToast | null;
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
  dismissUndoToast: () => void;
  batchResolve: (workItemIds: string[], action: string, note?: string) => Promise<void>;
  loadSummary: (params?: SummaryQueryParams, forceGenerate?: boolean) => Promise<ExecutiveSummary | null>;
  generateSummary: (params?: SummaryQueryParams) => Promise<ExecutiveSummary | null>;
  loadAuditLogs: () => Promise<void>;
  appendEvent: (event: PipelineEvent) => void;
  refresh: () => Promise<void>;
  retryCorpusRefresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
}

const DEFAULT_SUMMARY_PARAMS: SummaryQueryParams = {
  document_id: null,
  only_critical: false,
  latest_only: false,
};

function isNetworkFailure(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /failed to fetch|network|load failed|econnrefused|abort/i.test(error.message);
}

export const createJobExecutionSlice: StateCreator<BertState, [], [], JobExecutionSlice> = (set, get) => ({
  activeJob: null,
  job: null,
  workItems: [],
  events: [],
  isSimulating: false,
  executiveSummary: null,
  summaryStatus: "idle",
  summaryError: null,
  summaryParams: DEFAULT_SUMMARY_PARAMS,
  auditLogs: [],
  workItemUndoSnapshots: {},
  undoToast: null,

  startJob: async (documentId) => {
    const docId = documentId ?? get().selectedDocumentId;
    if (!docId) return;
    try {
      const job = await bertApi.startJob(docId);
      set({
        activeJob: job,
        job,
        workspaceId: job.workspace_id ?? get().workspaceId,
        isSimulating: true,
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
      set({
        activeJob: resumed,
        job: resumed,
        isSimulating: true,
        notice: instruction
          ? `Applied instruction: "${instruction}" · Resuming execution.`
          : "Review resumed from checkpoint.",
      });
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
        : actionOrPayload;

    if (payload.action === "undo") {
      await get().undoWorkItem(workItemId, payload.actor, payload.note);
      return;
    }

    const existing = state.workItems.find((item) => item.id === workItemId);
    const snapshot = existing ? { ...existing } : undefined;
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
      } catch {
        updatedItem = null;
      }
    }

    if (!updatedItem && existing) {
      usedFallback = true;
      const action = payload.action;
      let status: WorkItem["verification_status"] = "VERIFIED";
      let tier: WorkItem["priority_tier"] = existing.priority_tier;
      let score = existing.priority_score;
      let output = payload.correction || payload.note || existing.fluent_output;
      let escalationReason = existing.escalation_reason ?? null;
      let escalationAssignee = existing.escalation_assignee ?? null;
      let escalatedAt = existing.escalated_at ?? null;
      const escalatedBy = payload.actor?.trim() || "Compliance Reviewer";
      const originalTier = existing.original_priority_tier ?? existing.priority_tier;

      if (action === "manual_correction") {
        output = payload.correction || "Manually resolved by reviewer with confirmed evidence.";
        tier = "P2_MEDIUM";
        score = 50;
      } else if (action === "retry") {
        status = "NEEDS_HUMAN_VERIFICATION";
        output = "Deep vision rescue retry requested — awaiting fresh crop pass.";
        tier = "P1_HIGH";
        score = 75;
        escalationReason = payload.note?.trim() || "Deep vision retry requested.";
      } else if (action === "skip") {
        status = "VERIFIED";
        tier = "P3_LOW";
        score = 10;
        output = payload.note?.trim() || payload.correction || "Marked not applicable by reviewer.";
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
        status = "VERIFIED";
        output = payload.correction || existing.structured_facts[0]?.verbatim_quote
          ? payload.correction || `Reviewer approved extracted evidence: ${existing.structured_facts[0]?.verbatim_quote}`
          : "Reviewer approved finding.";
      }

      updatedItem = {
        ...existing,
        verification_status: status,
        priority_tier: tier,
        priority_score: score,
        fluent_output: output,
        resolved_by_tier: action === "counsel" || action === "retry" ? existing.resolved_by_tier : "HUMAN_IN_THE_LOOP",
        escalation_reason: escalationReason,
        escalation_assignee: escalationAssignee,
        escalated_at: escalatedAt,
        escalated_by: escalatedBy,
        original_priority_tier: originalTier,
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
          label: itemToSet.prompt_or_question.slice(0, 48),
          action: payload.action === "counsel" ? "Flagged for Legal" : `Updated (${itemToSet.verification_status})`,
        },
        notice:
          payload.action === "counsel"
            ? `Escalated "${itemToSet.prompt_or_question.slice(0, 32)}..." to ${itemToSet.escalation_assignee || "Legal Counsel"} (${itemToSet.priority_tier} preserved).`
            : `Updated "${itemToSet.prompt_or_question.slice(0, 36)}..." (${itemToSet.verification_status}).`,
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

  batchResolve: async (workItemIds, action, note = "") => {
    if (!workItemIds.length) return;
    await Promise.all(workItemIds.map((id) => get().resolveWorkItem(id, action, note)));
    set({ notice: `Batch resolved ${workItemIds.length} item(s) (${action}).` });
  },

  appendEvent: (event) => {
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
          event.status &&
          ["RUNNING", "PAUSING", "PAUSED", "RESUMING", "COMPLETED", "FAILED"].includes(event.status)
        ) {
          // Ignore lowercase "running"/"completed" on agent_transition events
          newStatus = event.status as JobExecution["status"];
        }

        nextJob = {
          ...state.activeJob,
          status: newStatus,
          current_agent_index:
            event.current_agent_index !== undefined
              ? event.current_agent_index
              : state.activeJob.current_agent_index,
          current_node_index:
            event.current_node_index !== undefined
              ? event.current_node_index
              : state.activeJob.current_node_index,
          current_document_id:
            event.document_id !== undefined ? event.document_id : state.activeJob.current_document_id,
        };
      }

      const isCompleted = event.type === "JOB_COMPLETED" || event.status === "COMPLETED";
      const isPaused = event.type === "JOB_PAUSED" || event.status === "PAUSED";
      const isFailed = event.type === "JOB_FAILED" || event.status === "FAILED";

      return {
        events: [...state.events.slice(-249), { ...event, created_at: event.created_at ?? Date.now() }],
        activeJob: nextJob,
        job: nextJob,
        isSimulating: isCompleted || isPaused || isFailed ? false : state.isSimulating || nextJob?.status === "RUNNING",
      };
    });

    if (event.type === "JOB_COMPLETED" || event.status === "COMPLETED") {
      void get().refresh();
    } else if (event.type === "summary_generated") {
      void get().loadSummary(get().summaryParams, false);
    }
  },

  refresh: async () => {
    // Never wipe documents while loading so Active Corpus sidebar has zero 0-file flicker
    set({ corpusStatus: "loading", corpusError: null });
    try {
      const [documents, workItems] = await Promise.all([bertApi.getDocuments(), bertApi.getWorkItems()]);
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

      set({
        documents,
        workItems,
        backendAvailable: true,
        corpusStatus: "ready",
        corpusError: null,
        workspaceId: resolvedWorkspaceId,
        selectedDocumentId,
        selectedFileFilterId,
      });

      if (selectedDocumentId && !get().nodesByDocument[selectedDocumentId]) {
        await get().loadNodes(selectedDocumentId);
      }
      void get().loadSummary(get().summaryParams, false);
      void get().loadAuditLogs();
    } catch (err) {
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

  loadDemo: async () => {
    set({
      corpusStatus: "loading",
      corpusError: null,
      events: [],
      chatMessages: [],
      messages: [],
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
    });

    let started = false;
    try {
      const job = await bertApi.startDemo();
      set({
        activeJob: job,
        job,
        workspaceId: job.workspace_id,
        isSimulating: true,
        backendAvailable: true,
        notice: "Investor demo case loaded · 7-Agent regiment reviewing corpus.",
      });
      await get().refresh();
      started = true;
    } catch {
      // Backend unavailable or demo failed, seed rich local demo case
    }

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
        nodesByDocument: demo.nodesByDocument,
        workItems: demo.workItems,
        workspaceId: demo.workspaceId,
        corpusStatus: "ready",
        corpusError: null,
        selectedDocumentId: demo.documents[0].id,
        selectedFileFilterId: null,
        activeJob: job,
        job,
        isSimulating: true,
        backendAvailable: false,
        notice: "Investor demo case loaded · 4 documents active in corpus.",
      });

      void get().loadSummary(get().summaryParams, true);
      void runLocalMultiAgentReview(set, get, demo.documents, job);
    }
  },
});
