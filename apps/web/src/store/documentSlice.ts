import type { StateCreator } from "zustand";
import { bertApi } from "../lib/api";
import { deriveNodeLocator } from "../lib/evidenceLocators";
import type { ASTNode, Document, JobExecution } from "../types/bert";
import {
  cancelLocalSimulation,
  localItems,
  parseUploadedFileLocally,
  runLocalMultiAgentReview,
  uid,
} from "./simulatorService";
import type { BertState } from "./useBertStore";

export type CorpusStatus = "idle" | "loading" | "ready" | "error";

export interface DocumentSlice {
  documents: Document[];
  selectedDocumentId: string | null;
  selectedFileFilterId: string | null;
  workspaceId: string | null;
  corpusStatus: CorpusStatus;
  corpusError: string | null;
  nodesByDocument: Record<string, ASTNode[]>;
  documentFiles: Record<string, File>;
  setSelectedDocument: (id: string | null) => void;
  selectDocument: (id: string) => void;
  setSelectedFileFilter: (id: string | null) => void;
  setWorkspaceId: (id: string | null) => void;
  setDocuments: (docs: Document[]) => void;
  loadNodes: (documentId: string) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  uploadFiles: (files: File[]) => Promise<void>;
}

export const createDocumentSlice: StateCreator<BertState, [], [], DocumentSlice> = (set, get) => ({
  documents: [],
  selectedDocumentId: null,
  selectedFileFilterId: null,
  workspaceId: null,
  corpusStatus: "idle",
  corpusError: null,
  nodesByDocument: {},
  documentFiles: {},

  setSelectedDocument: (id) => {
    set((state) => ({
      selectedDocumentId: id,
      selectedNodeId: null,
      activeHighlightBox: null,
      activeLocator: null,
      activeCitationQuote: null,
      activeRegionMatchScore: null,
      requestedPage: null,
      currentPdfPage: null,
      // If user already had a file filter active and switched to another file, update filter to match
      selectedFileFilterId:
        state.selectedFileFilterId && id && state.selectedFileFilterId !== id
          ? id
          : state.selectedFileFilterId,
    }));
    if (id && !get().nodesByDocument[id]) {
      void get().loadNodes(id);
    }
  },

  selectDocument: (id) => {
    get().setSelectedDocument(id);
  },

  setSelectedFileFilter: (id) => {
    if (!id) {
      set({ selectedFileFilterId: null });
      return;
    }
    const state = get();
    const docExists = state.documents.some((d) => d.id === id);
    const nextSelectedDoc = docExists ? id : state.selectedDocumentId;
    const isSwitchingDoc = nextSelectedDoc !== state.selectedDocumentId;

    set({
      selectedFileFilterId: id,
      selectedDocumentId: nextSelectedDoc,
      ...(isSwitchingDoc
        ? {
            selectedNodeId: null,
            activeHighlightBox: null,
            activeLocator: null,
            activeCitationQuote: null,
            activeRegionMatchScore: null,
            requestedPage: null,
            currentPdfPage: null,
          }
        : {}),
    });
    if (nextSelectedDoc && !get().nodesByDocument[nextSelectedDoc]) {
      void get().loadNodes(nextSelectedDoc);
    }
  },

  setWorkspaceId: (workspaceId) => set({ workspaceId }),

  setDocuments: (documents) => {
    set({ documents });
  },

  loadNodes: async (documentId) => {
    try {
      const rawNodes = await bertApi.getNodes(documentId);
      const doc = get().documents.find((d) => d.id === documentId) ?? null;
      const nodes: ASTNode[] = rawNodes.map((node) => {
        if (node.locator) return node;
        const derived = deriveNodeLocator(node, doc);
        return derived ? { ...node, locator: derived } : node;
      });
      set((state) => {
        const selectedNode = state.selectedNodeId ? nodes.find((node) => node.id === state.selectedNodeId) : undefined;
        return {
          nodesByDocument: { ...state.nodesByDocument, [documentId]: nodes },
          ...(selectedNode?.bounding_box
            ? {
                activeHighlightBox: {
                  ...selectedNode.bounding_box,
                  nodeId: selectedNode.id,
                  pageNumber: selectedNode.page_number,
                  confidence: selectedNode.ocr_confidence,
                },
                activeLocator: selectedNode.locator ?? state.activeLocator,
              }
            : {}),
        };
      });
    } catch {
      // Local fallback already owns its nodes
    }
  },

  uploadFile: async (file) => {
    try {
      const document = await bertApi.upload(file);
      const job = await bertApi.startJob(document.id);
      set((state) => ({
        documents: [document, ...state.documents.filter((item) => item.id !== document.id)],
        documentFiles: { ...state.documentFiles, [document.id]: file },
        workspaceId: document.workspace_id ?? job.workspace_id ?? state.workspaceId,
        corpusStatus: "ready",
        corpusError: null,
        activeJob: job,
        job,
        isSimulating: job.status === "RUNNING" || job.status === "RESUMING",
        hasCompletedRun: job.status === "COMPLETED",
        selectedDocumentId: document.id,
        selectedFileFilterId: null,
        selectedNodeId: null,
        activeHighlightBox: null,
        activeLocator: null,
        activeCitationQuote: null,
        activeRegionMatchScore: null,
        backendAvailable: true,
        notice: `Uploaded ${document.filename} · Seven-agent review started.`,
      }));
      await get().loadNodes(document.id);
      void get().loadSummary(get().summaryParams, true);
    } catch {
      cancelLocalSimulation();
      const workspaceId = get().workspaceId ?? uid();
      const batchId = uid();
      const { document, nodes } = await parseUploadedFileLocally(file, workspaceId);
      const job: JobExecution = {
        job_id: uid(),
        workspace_id: workspaceId,
        batch_id: batchId,
        status: "RUNNING",
        current_agent_index: 0,
        current_document_id: document.id,
        current_node_index: 0,
        checkpoint_id: uid(),
        completed_step_outputs: {},
        user_override_instructions: [],
        error_message: null,
      };
      const items = localItems(document, nodes, workspaceId, batchId);
      set((state) => ({
        documents: [document, ...state.documents],
        nodesByDocument: { ...state.nodesByDocument, [document.id]: nodes },
        documentFiles: { ...state.documentFiles, [document.id]: file },
        workItems: [...items, ...state.workItems],
        workspaceId,
        corpusStatus: "ready",
        corpusError: null,
        selectedDocumentId: document.id,
        selectedFileFilterId: null,
        selectedNodeId: null,
        activeHighlightBox: null,
        activeLocator: null,
        activeCitationQuote: null,
        activeRegionMatchScore: null,
        activeJob: job,
        job,
        isSimulating: true,
        hasCompletedRun: false,
        backendAvailable: false,
        notice: `Uploaded ${document.filename} · Running local 7-agent verification.`,
      }));
      void get().loadSummary(get().summaryParams, true);
      void runLocalMultiAgentReview(set, get, [document], job);
    }
  },

  uploadFiles: async (files) => {
    for (const file of files) {
      await get().uploadFile(file);
    }
  },
});
