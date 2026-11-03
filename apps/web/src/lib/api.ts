import type { ASTNode, Document, Escalation, JobExecution, WorkItem } from "../types/bert";

export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, options);
  if (!response.ok) throw new Error((await response.text()) || `Request failed with ${response.status}`);
  return response.json() as Promise<T>;
}

export const bertApi = {
  getDocuments: () => request<Document[]>("/api/v1/documents"),
  getWorkItems: () => request<WorkItem[]>("/api/v1/work-items"),
  getNodes: (documentId: string) => request<ASTNode[]>(`/api/v1/documents/${documentId}/nodes`),
  getEscalations: () => request<Escalation[]>("/api/v1/escalations"),
  upload: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<Document>("/api/v1/documents/upload", { method: "POST", body });
  },
  startJob: (documentId?: string) => request<JobExecution>("/api/v1/jobs/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(documentId ? { document_id: documentId } : {}),
  }),
  startDemo: () => request<JobExecution>("/api/v1/jobs/demo", { method: "POST" }),
  getJob: (jobId: string) => request<JobExecution>(`/api/v1/jobs/${jobId}`),
  pause: (jobId: string) => request<JobExecution>(`/api/v1/jobs/${jobId}/pause`, { method: "POST" }),
  interrupt: (jobId: string) => request<JobExecution>(`/api/v1/jobs/${jobId}/interrupt`, { method: "POST" }),
  resume: (jobId: string, instruction?: string) => request<JobExecution>(`/api/v1/jobs/${jobId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ instruction: instruction ?? null }),
  }),
  resolve: (workItemId: string, correction: string) => request<WorkItem>(`/api/v1/escalations/${workItemId}/resolve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "manual_correction", correction }),
  }),
};
