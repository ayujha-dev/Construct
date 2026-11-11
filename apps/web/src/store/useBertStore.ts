import { create } from "zustand";
import { type DocumentSlice, createDocumentSlice } from "./documentSlice";
import { type EvidenceInspectionSlice, createEvidenceInspectionSlice } from "./evidenceInspectionSlice";
import { type JobExecutionSlice, createJobExecutionSlice } from "./jobExecutionSlice";
import { type CopilotSlice, createCopilotSlice } from "./copilotSlice";
import { AGENTS, AGENT_ROLES } from "./simulatorService";

export type {
  ActiveInspectorTab,
  ActiveViewMode,
  ActiveHighlightBox,
} from "./evidenceInspectionSlice";

export { AGENTS, AGENT_ROLES };

export type BertState = DocumentSlice & JobExecutionSlice & EvidenceInspectionSlice & CopilotSlice;

export const useBertStore = create<BertState>()((...a) => ({
  ...createDocumentSlice(...a),
  ...createJobExecutionSlice(...a),
  ...createEvidenceInspectionSlice(...a),
  ...createCopilotSlice(...a),
}));
