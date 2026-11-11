import type { StateCreator } from "zustand";
import type { CitationMatch } from "../types/bert";
import type { BertState } from "./useBertStore";

export type ActiveInspectorTab = "quotes" | "visual" | "audit" | "ast";
export type ActiveViewMode = "visual" | "ast";

export interface ActiveHighlightBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  nodeId: string;
  pageNumber: number | null;
  confidence: number;
}

export interface EvidenceInspectionSlice {
  activeInspectorTab: ActiveInspectorTab;
  activeHighlightBox: ActiveHighlightBox | null;
  selectedNodeId: string | null;
  zoomLevel: number;
  activeViewMode: ActiveViewMode;
  setActiveInspectorTab: (tab: ActiveInspectorTab) => void;
  setActiveHighlightBox: (box: ActiveHighlightBox | null) => void;
  setSelectedNode: (id: string | null) => void;
  setZoomLevel: (level: number) => void;
  setActiveViewMode: (mode: ActiveViewMode) => void;
  inspectCitation: (
    citationOrDocId: CitationMatch | string,
    page?: number,
    bbox?: { x0: number; y0: number; x1: number; y1: number } | null,
    nodeId?: string
  ) => void;
}

export const createEvidenceInspectionSlice: StateCreator<BertState, [], [], EvidenceInspectionSlice> = (set, get) => ({
  activeInspectorTab: "quotes",
  activeHighlightBox: null,
  selectedNodeId: null,
  zoomLevel: 1,
  activeViewMode: "visual",

  setActiveInspectorTab: (tab) => set({ activeInspectorTab: tab }),

  setActiveHighlightBox: (box) => set({ activeHighlightBox: box }),

  setZoomLevel: (level) => set({ zoomLevel: Math.min(3, Math.max(0.5, Number(level.toFixed(2)))) }),

  setActiveViewMode: (mode) => set({ activeViewMode: mode }),

  setSelectedNode: (id) => {
    if (!id) {
      set({ selectedNodeId: null, activeHighlightBox: null });
      return;
    }
    const state = get();
    const documentId = Object.keys(state.nodesByDocument).find((candidate) =>
      state.nodesByDocument[candidate]?.some((node) => node.id === id)
    ) ?? state.workItems.find((item) => item.document_id && item.structured_facts.some((fact) => fact.ast_node_id === id))?.document_id;

    const node = documentId ? state.nodesByDocument[documentId]?.find((candidate) => candidate.id === id) : undefined;
    set({
      selectedNodeId: id,
      ...(documentId ? { selectedDocumentId: documentId } : {}),
      activeHighlightBox: node?.bounding_box
        ? {
            ...node.bounding_box,
            nodeId: node.id,
            pageNumber: node.page_number,
            confidence: node.ocr_confidence,
          }
        : null,
    });
    if (documentId && !state.nodesByDocument[documentId]) void get().loadNodes(documentId);
  },

  inspectCitation: (citationOrDocId, page, bbox, nodeId) => {
    const state = get();
    let docId: string | null = null;
    let targetNodeId: string | undefined = undefined;
    let targetPage: number | null = null;
    let targetBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
    let targetConfidence = 1.0;

    if (typeof citationOrDocId === "object" && citationOrDocId !== null) {
      const citation = citationOrDocId;
      const document = state.documents.find((candidate) => candidate.filename === citation.document_filename)
        ?? state.documents.find((candidate) => candidate.id === state.selectedDocumentId)
        ?? null;
      docId = document?.id ?? state.selectedDocumentId;
      targetNodeId = citation.ast_node_id;
      targetPage = citation.page_number;
      targetBox = citation.bounding_box;
      targetConfidence = citation.confidence_score > 1 ? citation.confidence_score / 100 : citation.confidence_score;
    } else {
      const docQuery = citationOrDocId;
      const document = state.documents.find((candidate) => candidate.id === docQuery || candidate.filename === docQuery)
        ?? state.documents.find((candidate) => candidate.id === state.selectedDocumentId)
        ?? null;
      docId = document?.id ?? docQuery;
      targetPage = page ?? null;
      targetBox = bbox ?? null;
      targetNodeId = nodeId;
      targetConfidence = 1.0;
    }

    const node = (docId && targetNodeId)
      ? state.nodesByDocument[docId]?.find((candidate) => candidate.id === targetNodeId)
      : undefined;

    const resolvedBox = targetBox ?? node?.bounding_box ?? null;
    const resolvedPage = targetPage ?? node?.page_number ?? null;
    const resolvedConfidence = node?.ocr_confidence ?? targetConfidence;

    set({
      selectedDocumentId: docId ?? state.selectedDocumentId,
      selectedNodeId: targetNodeId ?? null,
      activeInspectorTab: "visual",
      activeViewMode: "visual",
      activeHighlightBox: resolvedBox && targetNodeId
        ? {
            ...resolvedBox,
            nodeId: targetNodeId,
            pageNumber: resolvedPage,
            confidence: resolvedConfidence,
          }
        : null,
    });

    if (docId && !state.nodesByDocument[docId]) {
      void get().loadNodes(docId);
    }
  },
});
