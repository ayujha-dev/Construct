import type {
  ASTNode,
  AuditLogEntry,
  CopilotChatResponse,
  CorpusResetResponse,
  Document,
  Escalation,
  EscalationActionPayload,
  ExecutiveSummary,
  JobExecution,
  MetricsResponse,
  WorkItem,
} from "../types/bert";

export const API_URL =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) || "http://localhost:8000";

export interface SummaryQueryParams {
  document_id?: string | null;
  only_critical?: boolean;
  latest_only?: boolean;
}

function buildSummaryQueryString(params?: SummaryQueryParams): string {
  const qs = new URLSearchParams();
  if (params?.document_id && params.document_id !== "ALL") {
    qs.set("document_id", params.document_id);
  }
  qs.set("only_critical", String(Boolean(params?.only_critical)));
  qs.set("latest_only", String(Boolean(params?.latest_only)));
  return qs.toString();
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) throw new Error((await response.text()) || `Request failed with ${response.status}`);
  return response.json() as Promise<T>;
}

export const bertApi = {
  getDocuments: () => request<Document[]>("/api/v1/documents"),
  getWorkItems: () => request<WorkItem[]>("/api/v1/work-items"),
  getNodes: (documentId: string) => request<ASTNode[]>(`/api/v1/documents/${documentId}/nodes`),
  getFile: async (documentId: string): Promise<ArrayBuffer> => {
    const response = await fetch(`${API_URL}/api/v1/documents/${documentId}/file`);
    if (!response.ok) throw new Error((await response.text()) || `File request failed with ${response.status}`);
    return response.arrayBuffer();
  },
  getEscalations: () => request<Escalation[]>("/api/v1/escalations"),
  getAuditLog: () => request<AuditLogEntry[]>("/api/v1/audit-log"),
  askCopilot: (prompt: string, documentId?: string) =>
    request<CopilotChatResponse>("/api/v1/copilot/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, document_id: documentId ?? null }),
    }),
  upload: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<Document>("/api/v1/documents/upload", { method: "POST", body });
  },
  startJob: (documentId?: string) =>
    request<JobExecution>("/api/v1/jobs/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(documentId ? { document_id: documentId } : {}),
    }),
  startDemo: () => request<JobExecution>("/api/v1/jobs/demo", { method: "POST" }),
  getJob: (jobId: string) => request<JobExecution>(`/api/v1/jobs/${jobId}`),
  pause: (jobId: string) => request<JobExecution>(`/api/v1/jobs/${jobId}/pause`, { method: "POST" }),
  interrupt: (jobId: string) => request<JobExecution>(`/api/v1/jobs/${jobId}/interrupt`, { method: "POST" }),
  resume: (jobId: string, instruction?: string) =>
    request<JobExecution>(`/api/v1/jobs/${jobId}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instruction: instruction ?? null }),
    }),
  resolve: (
    workItemId: string,
    actionOrPayload: string | EscalationActionPayload = "manual_correction",
    correction: string = ""
  ) => {
    const payload: EscalationActionPayload =
      typeof actionOrPayload === "string"
        ? {
            action: (actionOrPayload === "not_applicable" ? "skip" : actionOrPayload) as EscalationActionPayload["action"],
            correction,
          }
        : actionOrPayload;
    return request<WorkItem>(`/api/v1/escalations/${workItemId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  },
  undoWorkItem: (workItemId: string, body?: { actor?: string; note?: string }) =>
    request<WorkItem>(`/api/v1/work-items/${workItemId}/undo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    }),
  getMetrics: (params?: SummaryQueryParams) =>
    request<MetricsResponse>(`/api/v1/metrics?${buildSummaryQueryString(params)}`),
  resetCorpus: () =>
    request<CorpusResetResponse>("/api/v1/corpus/reset", {
      method: "POST",
    }),
  getSummary: (params?: SummaryQueryParams) =>
    request<ExecutiveSummary>(`/api/v1/summary?${buildSummaryQueryString(params)}`),
  generateSummary: (body?: SummaryQueryParams) =>
    request<ExecutiveSummary>("/api/v1/summary/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        document_id: body?.document_id && body.document_id !== "ALL" ? body.document_id : null,
        only_critical: Boolean(body?.only_critical),
        latest_only: Boolean(body?.latest_only),
      }),
    }),
  exportSummaryMdUrl: (params?: SummaryQueryParams) =>
    `${API_URL}/api/v1/export/summary.md?${buildSummaryQueryString(params)}`,
  exportQuestionnaireXlsxUrl: () => `${API_URL}/api/v1/export/questionnaire.xlsx`,
  downloadQuestionnaireXlsx: async (): Promise<Blob> => {
    const response = await fetch(`${API_URL}/api/v1/export/questionnaire.xlsx`);
    if (!response.ok) throw new Error((await response.text()) || `Export failed with ${response.status}`);
    return response.blob();
  },
};
