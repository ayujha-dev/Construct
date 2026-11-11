import type { StateCreator } from "zustand";
import { bertApi } from "../lib/api";
import type { ASTNode, Document, JobExecution } from "../types/bert";
import { checksum, localDocument, localItems, readWithFileReader, runLocalMultiAgentReview, uid } from "./simulatorService";
import type { BertState } from "./useBertStore";

export interface DocumentSlice {
  documents: Document[];
  selectedDocumentId: string | null;
  nodesByDocument: Record<string, ASTNode[]>;
  documentFiles: Record<string, File>;
  setSelectedDocument: (id: string | null) => void;
  selectDocument: (id: string) => void;
  setDocuments: (docs: Document[]) => void;
  loadNodes: (documentId: string) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
}

export const createDocumentSlice: StateCreator<BertState, [], [], DocumentSlice> = (set, get) => ({
  documents: [],
  selectedDocumentId: null,
  nodesByDocument: {},
  documentFiles: {},

  setSelectedDocument: (id) => {
    set({ selectedDocumentId: id, selectedNodeId: null, activeHighlightBox: null });
    if (id) void get().loadNodes(id);
  },

  selectDocument: (id) => {
    get().setSelectedDocument(id);
  },

  setDocuments: (documents) => {
    set({ documents });
  },

  loadNodes: async (documentId) => {
    try {
      const nodes = await bertApi.getNodes(documentId);
      set((state) => {
        const selectedNode = state.selectedNodeId ? nodes.find((node) => node.id === state.selectedNodeId) : undefined;
        return {
          nodesByDocument: { ...state.nodesByDocument, [documentId]: nodes },
          activeHighlightBox: selectedNode?.bounding_box
            ? {
                ...selectedNode.bounding_box,
                nodeId: selectedNode.id,
                pageNumber: selectedNode.page_number,
                confidence: selectedNode.ocr_confidence,
              }
            : state.activeHighlightBox,
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
        activeJob: job,
        job,
        selectedDocumentId: document.id,
        backendAvailable: true,
        notice: `Uploaded ${document.filename} · Seven-agent review started.`,
      }));
      await get().loadNodes(document.id);
    } catch {
      const text = await readWithFileReader(file).catch(() => "");
      const hash = await checksum(text || file.name);
      const { document, nodes } = localDocument(file, text, hash);
      const workspaceId = uid();
      const batchId = uid();
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
        selectedDocumentId: document.id,
        activeJob: job,
        job,
        isSimulating: true,
        backendAvailable: false,
        notice: `Uploaded ${document.filename} · Running local 7-agent verification.`,
      }));
      void runLocalMultiAgentReview(set, get, [document], job);
    }
  },
});
