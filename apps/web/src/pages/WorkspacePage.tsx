import { useEffect, useMemo } from "react";
import { FileQueueSidebar } from "../components/copilot/FileQueueSidebar";
import { AgentChatStream } from "../components/copilot/AgentChatStream";
import { SourceDocumentInspector } from "../components/copilot/SourceDocumentInspector";
import { useBertStore } from "../store/useBertStore";

export function WorkspacePage() {
  const { refresh, selectedDocumentId, selectedNodeId, setSelectedNode } = useBertStore();
  useEffect(() => { void refresh(); }, [refresh]);
  const focus = useMemo(() => (nodeId: string) => { if (nodeId) setSelectedNode(nodeId); }, [setSelectedNode]);
  return <div className="workspace-page"><FileQueueSidebar /><AgentChatStream onFocusNode={focus} /><SourceDocumentInspector /></div>;
}
