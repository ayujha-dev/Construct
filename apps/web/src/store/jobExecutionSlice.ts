import type { StateCreator } from "zustand";
import { bertApi } from "../lib/api";
import type { JobExecution, PipelineEvent, WorkItem } from "../types/bert";
import { buildDemoCorpus } from "./demoCorpusService";
import {
  AGENTS,
  pauseLocalSimulation,
  resumeLocalSimulation,
  runLocalMultiAgentReview,
  uid,
} from "./simulatorService";
import type { BertState } from "./useBertStore";

export interface JobExecutionSlice {
  activeJob: JobExecution | null;
  job: JobExecution | null;
  workItems: WorkItem[];
  events: PipelineEvent[];
  isSimulating: boolean;
  startJob: (documentId?: string) => Promise<void>;
  pauseJob: () => Promise<void>;
  resumeJob: (instruction?: string) => Promise<void>;
  updateWorkItem: (id: string, update: Partial<WorkItem>) => void;
  resolveWorkItem: (workItemId: string, action?: string, correction?: string) => Promise<void>;
  batchResolve: (workItemIds: string[], action: string, note?: string) => Promise<void>;
  appendEvent: (event: PipelineEvent) => void;
  refresh: () => Promise<void>;
  loadDemo: () => Promise<void>;
}

export const createJobExecutionSlice: StateCreator<BertState, [], [], JobExecutionSlice> = (set, get) => ({
  activeJob: null,
  job: null,
  workItems: [],
  events: [],
  isSimulating: false,

  startJob: async (documentId) => {
    const docId = documentId ?? get().selectedDocumentId;
    if (!docId) return;
    try {
      const job = await bertApi.startJob(docId);
      set({ activeJob: job, job, isSimulating: true, backendAvailable: true });
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
      set({ activeJob: paused, job: paused, isSimulating: false, notice: "Pause requested — current atomic step will finish safely." });
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
        user_override_instructions: instruction ? [...job.user_override_instructions, instruction] : job.user_override_instructions,
      };
      set({
        activeJob: resumedJob,
        job: resumedJob,
        isSimulating: true,
        notice: instruction ? `Applied instruction: "${instruction}" · Resuming execution.` : "Review resumed from checkpoint.",
      });
      return;
    }
    try {
      const resumed = await bertApi.resume(job.job_id, instruction);
      set({
        activeJob: resumed,
        job: resumed,
        isSimulating: true,
        notice: instruction ? `Applied instruction: "${instruction}" · Resuming execution.` : "Review resumed from checkpoint.",
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

  resolveWorkItem: async (workItemId: string, action: string = "manual_correction", correction: string = "") => {
    const state = get();
    let updatedItem: WorkItem | null = null;
    if (state.backendAvailable) {
      try {
        updatedItem = await bertApi.resolve(workItemId, action, correction);
      } catch {
        updatedItem = null;
      }
    }
    if (!updatedItem) {
      const existing = state.workItems.find((item) => item.id === workItemId);
      if (existing) {
        let status: WorkItem["verification_status"] = "VERIFIED";
        let tier: WorkItem["priority_tier"] = "P2_MEDIUM";
        let score = 50;
        let output = correction || existing.fluent_output;
        if (action === "manual_correction") {
          output = correction || "Manually resolved by reviewer with confirmed evidence.";
          tier = "P2_MEDIUM";
          score = 50;
        } else if (action === "retry") {
          status = "NEEDS_HUMAN_VERIFICATION";
          output = "Deep vision rescue retry requested — awaiting fresh crop pass.";
          tier = "P1_HIGH";
          score = 75;
        } else if (action === "not_applicable" || action === "skip") {
          status = "VERIFIED";
          tier = "P3_LOW";
          score = 10;
          output = correction || "Marked not applicable by reviewer.";
        } else if (action === "counsel") {
          status = "NEEDS_HUMAN_VERIFICATION";
          tier = "P0_CRITICAL";
          score = 95;
          output = correction || "Escalated to outside legal counsel for risk assessment.";
        } else if (action === "approve") {
          status = "VERIFIED";
          tier = "P2_MEDIUM";
          score = 35;
          output = correction || "Approved with reviewer sign-off.";
        }
        updatedItem = {
          ...existing,
          verification_status: status,
          priority_tier: tier,
          priority_score: score,
          fluent_output: output,
        };
      }
    }
    if (updatedItem) {
      const itemToSet = updatedItem;
      set((s) => ({
        workItems: s.workItems.map((item) => (item.id === workItemId ? itemToSet : item)),
        notice: `Resolved finding "${itemToSet.prompt_or_question.slice(0, 36)}..." (${itemToSet.verification_status}).`,
      }));
    }
  },

  batchResolve: async (workItemIds: string[], action: string, note: string = "") => {
    if (!workItemIds.length) return;
    const actions = workItemIds.map((id) => get().resolveWorkItem(id, action, note));
    await Promise.all(actions);
    set({ notice: `Batch resolved ${workItemIds.length} item(s) (${action}).` });
  },

  appendEvent: (event) => {
    set((state) => {
      let nextJob = state.activeJob;
      if (state.activeJob && (!event.job_id || event.job_id === state.activeJob.job_id)) {
        const isJobTransition = ["JOB_PAUSED", "JOB_PAUSING", "JOB_RESUMED", "JOB_RESUMING", "JOB_COMPLETED", "JOB_FAILED"].includes(event.type);
        const newStatus = isJobTransition
          ? (event.type.replace("JOB_", "") as JobExecution["status"])
          : (event.status as JobExecution["status"]) ?? state.activeJob.status;

        nextJob = {
          ...state.activeJob,
          status: newStatus,
          current_agent_index: event.current_agent_index !== undefined ? event.current_agent_index : state.activeJob.current_agent_index,
          current_node_index: event.current_node_index !== undefined ? event.current_node_index : state.activeJob.current_node_index,
          current_document_id: event.document_id !== undefined ? event.document_id : state.activeJob.current_document_id,
        };
      }

      const isCompleted = event.type === "JOB_COMPLETED" || event.status === "COMPLETED";
      const isPaused = event.type === "JOB_PAUSED" || event.status === "PAUSED";

      return {
        events: [...state.events.slice(-249), { ...event, created_at: event.created_at ?? Date.now() }],
        activeJob: nextJob,
        job: nextJob,
        isSimulating: isCompleted || isPaused ? false : (state.isSimulating || (nextJob?.status === "RUNNING")),
      };
    });

    if (event.type === "JOB_COMPLETED" || event.status === "COMPLETED") {
      void get().refresh();
    }
  },

  refresh: async () => {
    try {
      const [documents, workItems] = await Promise.all([bertApi.getDocuments(), bertApi.getWorkItems()]);
      const currentSelected = get().selectedDocumentId;
      const selectedDocumentId = currentSelected && documents.some((d) => d.id === currentSelected)
        ? currentSelected
        : documents[0]?.id ?? null;
      set({ documents, workItems, backendAvailable: true, selectedDocumentId });
      if (selectedDocumentId && !get().nodesByDocument[selectedDocumentId]) {
        await get().loadNodes(selectedDocumentId);
      }
    } catch {
      set({ backendAvailable: false });
    }
  },

  loadDemo: async () => {
    let started = false;
    try {
      const job = await bertApi.startDemo();
      set({ activeJob: job, job, isSimulating: true, backendAvailable: true, notice: "Investor demo case loaded · 7-Agent regiment reviewing corpus." });
      await get().refresh();
      started = true;
    } catch {
      // Backend unavailable or demo failed, seed rich local demo case
    }

    if (!started) {
      const demo = buildDemoCorpus();
      const workspaceId = uid();
      const batchId = uid();
      const job: JobExecution = {
        job_id: uid(),
        workspace_id: workspaceId,
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
        selectedDocumentId: demo.documents[0].id,
        activeJob: job,
        job,
        isSimulating: true,
        backendAvailable: false,
        notice: "Investor demo case loaded · 4 documents active in corpus.",
      });

      void runLocalMultiAgentReview(set, get, demo.documents, job);
    }
  },
});
