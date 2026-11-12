import { create } from "zustand";
import { type DocumentSlice, createDocumentSlice } from "./documentSlice";
import { type EvidenceInspectionSlice, createEvidenceInspectionSlice } from "./evidenceInspectionSlice";
import { type JobExecutionSlice, createJobExecutionSlice } from "./jobExecutionSlice";
import { type CopilotSlice, createCopilotSlice } from "./copilotSlice";
import { AGENTS, AGENT_ROLES } from "./simulatorService";

export type { CorpusStatus } from "./documentSlice";
export type {
  ActiveInspectorTab,
  ActiveViewMode,
  ActiveHighlightBox,
  WorkspaceNavigator,
} from "./evidenceInspectionSlice";
export type { SummaryStatus, UndoToast } from "./jobExecutionSlice";

export { AGENTS, AGENT_ROLES };
export { registerWorkspaceNavigator } from "./evidenceInspectionSlice";

export type BertState = DocumentSlice & JobExecutionSlice & EvidenceInspectionSlice & CopilotSlice;
export type ShieldStaffState = BertState;

export const useBertStore = create<BertState>()((...a) => ({
  ...createDocumentSlice(...a),
  ...createJobExecutionSlice(...a),
  ...createEvidenceInspectionSlice(...a),
  ...createCopilotSlice(...a),
}));

export const useShieldStaffStore = useBertStore;
