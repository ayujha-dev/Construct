import type { StateCreator } from "zustand";
import { bertApi } from "../lib/api";
import type { CitationMatch, CopilotChatMessage, CopilotChatResponse } from "../types/bert";
import { localCopilotSearch, uid } from "./simulatorService";
import type { BertState } from "./useBertStore";

export interface CopilotSlice {
  chatMessages: CopilotChatMessage[];
  messages: CopilotChatMessage[];
  asking: boolean;
  notice: string;
  backendAvailable: boolean;
  askCopilot: (prompt: string, documentId?: string) => Promise<void>;
  requestExecutiveSummaryStream: (documentId?: string | null) => Promise<void>;
  resolveEscalation: (action: string, note?: string) => Promise<void>;
  setNotice: (notice: string) => void;
}

export const createCopilotSlice: StateCreator<BertState, [], [], CopilotSlice> = (set, get) => ({
  chatMessages: [],
  messages: [],
  asking: false,
  notice: "System ready · Evidence gate online",
  backendAvailable: true,

  setNotice: (notice) => set({ notice }),

  askCopilot: async (prompt, documentId) => {
    const text = prompt.trim();
    if (!text) return;
    const messageId = uid();
    const targetDocumentId = documentId ?? get().selectedFileFilterId ?? null;
    const pendingMessage: CopilotChatMessage = {
      id: messageId,
      prompt: text,
      answer: null,
      status: "PENDING",
      match_score: 0,
      citations: [],
      document_id: targetDocumentId,
      created_at: Date.now(),
    };

    set((state) => {
      const nextMessages = [...state.chatMessages.slice(-49), pendingMessage];
      return {
        asking: true,
        chatMessages: nextMessages,
        messages: nextMessages,
      };
    });

    let response: CopilotChatResponse | null = null;
    if (get().backendAvailable) {
      try {
        response = await bertApi.askCopilot(text, targetDocumentId ?? undefined);
      } catch {
        response = null;
      }
    }
    if (!response) {
      response = localCopilotSearch(text, targetDocumentId, get());
    }
    const resolved = response;

    set((state) => {
      const nextMessages = state.chatMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              answer: resolved.answer,
              status: resolved.verification_status === "VERIFIED" ? ("VERIFIED" as const) : ("INSUFFICIENT_EVIDENCE" as const),
              match_score: resolved.match_score,
              citations: resolved.citations,
            }
          : message
      );
      return {
        asking: false,
        chatMessages: nextMessages,
        messages: nextMessages,
        notice:
          resolved.verification_status === "VERIFIED"
            ? `Copilot verified a source match (${Math.round(resolved.match_score)}%).`
            : "Copilot found insufficient evidence — question flagged for review.",
      };
    });
  },

  requestExecutiveSummaryStream: async (documentId) => {
    const targetDocId = documentId !== undefined ? documentId : get().selectedFileFilterId ?? null;
    const messageId = uid();
    const docLabel = targetDocId
      ? get().documents.find((d) => d.id === targetDocId)?.filename ?? "Selected Document"
      : "Full Corpus";

    const pendingMessage: CopilotChatMessage = {
      id: messageId,
      prompt: `Executive Summary (${docLabel})`,
      answer: null,
      status: "PENDING",
      match_score: 0,
      citations: [],
      document_id: targetDocId,
      created_at: Date.now(),
      summarySnapshot: null,
    };

    set((state) => {
      const nextMessages = [...state.chatMessages.slice(-49), pendingMessage];
      return {
        asking: true,
        chatMessages: nextMessages,
        messages: nextMessages,
      };
    });

    const summary = await get().generateSummary({
      document_id: targetDocId,
      only_critical: false,
      latest_only: false,
    });

    if (!summary) {
      set((state) => {
        const nextMessages = state.chatMessages.map((message) =>
          message.id === messageId
            ? {
                ...message,
                answer: state.summaryError || "Unable to generate Envoy Executive Summary. Please retry.",
                status: "INSUFFICIENT_EVIDENCE" as const,
                match_score: 0,
              }
            : message
        );
        return { asking: false, chatMessages: nextMessages, messages: nextMessages };
      });
      return;
    }

    const workItemMap = new Map(get().workItems.map((w) => [w.id, w]));
    const docMap = new Map(get().documents.map((d) => [d.id, d]));
    const summaryCitations: CitationMatch[] = [];
    for (const finding of summary.key_findings) {
      const item = workItemMap.get(finding.work_item_id);
      const firstCit = item?.verified_citations[0];
      if (!firstCit) continue;
      const docName =
        firstCit.document_filename ||
        finding.document_filename ||
        (finding.document_id ? docMap.get(finding.document_id)?.filename : undefined) ||
        "Corpus";
      summaryCitations.push({
        quote: firstCit.quote,
        ast_node_id: firstCit.ast_node_id,
        page_number: firstCit.page_number,
        bounding_box: firstCit.bounding_box ?? null,
        document_filename: docName,
        confidence_score: item.gate_telemetry.citation_match || 100,
        locator: firstCit.locator ?? null,
        region_match_score: firstCit.region_match_score ?? null,
      });
      if (summaryCitations.length >= 4) break;
    }

    set((state) => {
      const nextMessages = state.chatMessages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              answer: summary.summary_text,
              status: summary.total_work_items > 0 ? ("VERIFIED" as const) : ("INSUFFICIENT_EVIDENCE" as const),
              match_score: summary.defensibility_score,
              citations: summaryCitations,
              summarySnapshot: summary,
            }
          : message
      );
      return {
        asking: false,
        chatMessages: nextMessages,
        messages: nextMessages,
        notice: `Envoy Executive Summary updated (${summary.defensibility_score}% defensibility · ${summary.verified_count}/${summary.total_work_items} verified).`,
      };
    });
  },

  resolveEscalation: async (action, note) => {
    const escalatedItem = get().workItems.find(
      (item) => item.verification_status === "NEEDS_HUMAN_VERIFICATION" || item.priority_tier === "P0_CRITICAL"
    );
    if (escalatedItem) {
      await get().resolveWorkItem(escalatedItem.id, action, note);
    }
  },
});
