import type { StateCreator } from "zustand";
import { bertApi } from "../lib/api";
import type { CopilotChatMessage, CopilotChatResponse } from "../types/bert";
import { localCopilotSearch, uid } from "./simulatorService";
import type { BertState } from "./useBertStore";

export interface CopilotSlice {
  chatMessages: CopilotChatMessage[];
  messages: CopilotChatMessage[];
  asking: boolean;
  notice: string;
  backendAvailable: boolean;
  askCopilot: (prompt: string, documentId?: string) => Promise<void>;
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
    const targetDocumentId = documentId ?? get().selectedDocumentId;
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

  resolveEscalation: async (action, note) => {
    const escalatedItem = get().workItems.find(
      (item) => item.verification_status === "NEEDS_HUMAN_VERIFICATION" || item.priority_tier === "P0_CRITICAL"
    );
    if (escalatedItem) {
      await get().resolveWorkItem(escalatedItem.id, action, note);
    }
  },
});
