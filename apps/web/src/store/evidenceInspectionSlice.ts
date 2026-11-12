import type { StateCreator } from "zustand";
import { normalizeBbox } from "../lib/evidenceLocators";
import type { CitationMatch, EvidenceLocator } from "../types/bert";
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
  locator?: EvidenceLocator | null;
}

export type WorkspaceNavigator = (opts: {
  docId?: string | null;
  page?: number | null;
  nodeId?: string | null;
}) => void;

let registeredWorkspaceNavigator: WorkspaceNavigator | null = null;

export function registerWorkspaceNavigator(navigator: WorkspaceNavigator | null): void {
  registeredWorkspaceNavigator = navigator;
}

export interface EvidenceInspectionSlice {
  activeInspectorTab: ActiveInspectorTab;
  activeHighlightBox: ActiveHighlightBox | null;
  activeLocator: EvidenceLocator | null;
  activeCitationQuote: string | null;
  activeRegionMatchScore: number | null;
  requestedPage: number | null;
  currentPdfPage: number | null;
  selectedNodeId: string | null;
  zoomLevel: number;
  activeViewMode: ActiveViewMode;
  setActiveInspectorTab: (tab: ActiveInspectorTab) => void;
  setActiveHighlightBox: (box: ActiveHighlightBox | null) => void;
  setRequestedPage: (page: number | null) => void;
  setCurrentPdfPage: (page: number | null) => void;
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
  activeLocator: null,
  activeCitationQuote: null,
  activeRegionMatchScore: null,
  requestedPage: null,
  currentPdfPage: null,
  selectedNodeId: null,
  zoomLevel: 1,
  activeViewMode: "visual",

  setActiveInspectorTab: (tab) => set({ activeInspectorTab: tab }),

  setActiveHighlightBox: (box) => set({ activeHighlightBox: box }),

  setRequestedPage: (requestedPage) => set({ requestedPage }),

  setCurrentPdfPage: (currentPdfPage) => set({ currentPdfPage }),

  setZoomLevel: (level) => set({ zoomLevel: Math.min(3, Math.max(0.5, Number(level.toFixed(2)))) }),

  setActiveViewMode: (mode) => set({ activeViewMode: mode }),

  setSelectedNode: (id) => {
    if (!id) {
      set({
        selectedNodeId: null,
        activeHighlightBox: null,
        activeLocator: null,
        activeCitationQuote: null,
        activeRegionMatchScore: null,
      });
      return;
    }
    const state = get();
    const documentId =
      Object.keys(state.nodesByDocument).find((candidate) =>
        state.nodesByDocument[candidate]?.some((node) => node.id === id)
      ) ??
      state.workItems.find(
        (item) => item.document_id && item.structured_facts.some((fact) => fact.ast_node_id === id)
      )?.document_id;

    const node = documentId ? state.nodesByDocument[documentId]?.find((candidate) => candidate.id === id) : undefined;
    const locator = node?.locator ?? null;
    const locatorBox = locator?.source_type === "pdf" ? normalizeBbox(locator.bbox) : null;
    const resolvedBox = node?.bounding_box ?? locatorBox ?? null;
    const resolvedPage =
      node?.page_number ??
      (locator?.source_type === "pdf" ? locator.page : locator?.source_type === "text" ? locator.page ?? 1 : null);

    set({
      selectedNodeId: id,
      ...(documentId ? { selectedDocumentId: documentId } : {}),
      ...(documentId && state.selectedFileFilterId && state.selectedFileFilterId !== documentId
        ? { selectedFileFilterId: documentId }
        : {}),
      activeLocator: locator,
      activeCitationQuote: node?.verbatim_text ?? null,
      activeRegionMatchScore: null,
      requestedPage: resolvedPage,
      currentPdfPage: resolvedPage,
      activeHighlightBox: resolvedBox
        ? {
            ...resolvedBox,
            nodeId: node?.id ?? id,
            pageNumber: resolvedPage,
            confidence: node?.ocr_confidence ?? 1.0,
            locator,
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
    let targetLocator: EvidenceLocator | null = null;
    let targetQuote: string | null = null;
    let targetRegionScore: number | null = null;
    let explicitConfidence: number | null = null;

    if (typeof citationOrDocId === "object" && citationOrDocId !== null) {
      const citation = citationOrDocId;
      const docFromLocator = citation.locator?.doc_id
        ? state.documents.find((candidate) => candidate.id === citation.locator?.doc_id)
        : undefined;
      const document =
        docFromLocator ??
        state.documents.find((candidate) => candidate.filename === citation.document_filename) ??
        state.documents.find((candidate) => candidate.id === state.selectedDocumentId) ??
        null;
      docId = document?.id ?? citation.locator?.doc_id ?? state.selectedDocumentId;
      targetNodeId = citation.ast_node_id;
      targetLocator = citation.locator ?? null;
      targetPage =
        citation.page_number ??
        (targetLocator?.source_type === "pdf"
          ? targetLocator.page
          : targetLocator?.source_type === "text"
            ? (targetLocator.page ?? 1)
            : null);
      targetBox =
        citation.bounding_box ??
        (targetLocator?.source_type === "pdf" ? normalizeBbox(targetLocator.bbox) : null) ??
        null;
      targetQuote = citation.quote ?? null;
      targetRegionScore = citation.region_match_score ?? null;
      if (typeof citation.confidence_score === "number" && Number.isFinite(citation.confidence_score)) {
        explicitConfidence =
          citation.confidence_score > 1 ? citation.confidence_score / 100 : citation.confidence_score;
      }
    } else {
      const docQuery = citationOrDocId;
      const document =
        state.documents.find((candidate) => candidate.id === docQuery || candidate.filename === docQuery) ??
        state.documents.find((candidate) => candidate.id === state.selectedDocumentId) ??
        null;
      docId = document?.id ?? docQuery;
      targetPage = page ?? null;
      targetBox = bbox ?? null;
      targetNodeId = nodeId;
    }

    const node =
      docId && targetNodeId ? state.nodesByDocument[docId]?.find((candidate) => candidate.id === targetNodeId) : undefined;

    const resolvedLocator = targetLocator ?? node?.locator ?? null;
    const locatorBox = resolvedLocator?.source_type === "pdf" ? normalizeBbox(resolvedLocator.bbox) : null;
    const resolvedBox = targetBox ?? locatorBox ?? node?.bounding_box ?? null;
    const resolvedPage =
      targetPage ??
      node?.page_number ??
      (resolvedLocator?.source_type === "pdf"
        ? resolvedLocator.page
        : resolvedLocator?.source_type === "text"
          ? (resolvedLocator.page ?? 1)
          : null);
    const resolvedConfidence =
      explicitConfidence !== null ? Math.max(0, Math.min(1, explicitConfidence)) : (node?.ocr_confidence ?? 1.0);
    const resolvedQuote = targetQuote ?? node?.verbatim_text ?? null;

    set({
      selectedDocumentId: docId ?? state.selectedDocumentId,
      ...(state.selectedFileFilterId && docId && state.selectedFileFilterId !== docId
        ? { selectedFileFilterId: docId }
        : {}),
      selectedNodeId: targetNodeId ?? null,
      activeInspectorTab: "visual",
      activeViewMode: "visual",
      activeLocator: resolvedLocator,
      activeCitationQuote: resolvedQuote,
      activeRegionMatchScore: targetRegionScore,
      requestedPage: resolvedPage,
      currentPdfPage: resolvedPage,
      activeHighlightBox:
        resolvedBox && targetNodeId
          ? {
              ...resolvedBox,
              nodeId: targetNodeId,
              pageNumber: resolvedPage,
              confidence: resolvedConfidence,
              locator: resolvedLocator,
            }
          : null,
    });

    if (docId && !state.nodesByDocument[docId]) {
      void get().loadNodes(docId);
    }

    registeredWorkspaceNavigator?.({
      docId: docId ?? state.selectedDocumentId,
      page: resolvedPage,
      nodeId: targetNodeId ?? null,
    });
  },
});
