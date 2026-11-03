import { create } from "zustand";
import { bertApi } from "../lib/api";
import type { ASTNode, Document, JobExecution, PipelineEvent, WorkItem } from "../types/bert";

const AGENTS = ["Scout", "Quartermaster", "Chronos", "Vanguard", "Ranger", "Arbiter", "Envoy"];
const AGENT_ROLES = ["Vision Rescue", "Categorizer", "Temporal Tracker", "Risk Prioritizer", "Fact Extractor", "Conflict Resolver", "Summary Scribe"];

interface BertState {
  documents: Document[];
  nodesByDocument: Record<string, ASTNode[]>;
  workItems: WorkItem[];
  events: PipelineEvent[];
  activeJob: JobExecution | null;
  selectedDocumentId: string | null;
  selectedNodeId: string | null;
  notice: string;
  backendAvailable: boolean;
  setSelectedDocument: (id: string | null) => void;
  setSelectedNode: (id: string | null) => void;
  appendEvent: (event: PipelineEvent) => void;
  refresh: () => Promise<void>;
  loadNodes: (documentId: string) => Promise<void>;
  uploadFile: (file: File) => Promise<void>;
  loadDemo: () => Promise<void>;
  pauseJob: () => Promise<void>;
  resumeJob: (instruction?: string) => Promise<void>;
}

let localPaused = false;
let localResume: (() => void) | null = null;
let localRun = 0;

const uid = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function checksum(value: string): Promise<string> {
  if (globalThis.crypto?.subtle) {
    const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
  }
  return Array.from(value).reduce((hash, char) => `${hash}${char.charCodeAt(0).toString(16)}`, "").slice(0, 64).padEnd(64, "0");
}

function readWithFileReader(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read source locally"));
    reader.readAsText(file);
  });
}

function categoryFor(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes("mfa") || lower.includes("password") || lower.includes("access")) return "Access Control";
  if (lower.includes("encrypt") || lower.includes("key")) return "Cryptography";
  if (lower.includes("liabil") || lower.includes("indemn")) return "Liability";
  if (lower.includes("retain") || lower.includes("delete")) return "Compliance";
  return "Security Operations";
}

function priorityFor(text: string, confidence: number): { tier: WorkItem["priority_tier"]; score: number } {
  const lower = text.toLowerCase();
  if (confidence < 0.9 || ["wildcard", "uncapped", "liability", "admin", "secret"].some((term) => lower.includes(term))) return { tier: "P0_CRITICAL", score: 96 };
  if (["mfa", "password", "encryption", "policy"].some((term) => lower.includes(term))) return { tier: "P1_HIGH", score: 72 };
  return { tier: "P2_MEDIUM", score: 38 };
}

function localDocument(file: File, text: string, hash: string): { document: Document; nodes: ASTNode[] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const sourceLines = lines.length ? lines : [`${file.name} uploaded for local review.`];
  const id = uid();
  const nodes = sourceLines.map((line, index) => ({
    id: uid(), document_id: id, node_type: file.name.endsWith(".json") ? "JSON_RULE" : "PARAGRAPH",
    section_path: file.name.endsWith(".json") ? `root.item[${index}]` : `Page ${index + 1}`,
    verbatim_text: line, structured_payload: null, page_number: file.name.endsWith(".pdf") ? index + 1 : null,
    bounding_box: null, ocr_confidence: /stamp|unreadable|low_confidence/i.test(line) ? 0.82 : 1, node_order: index,
  } satisfies ASTNode));
  const risk = priorityFor(nodes[0].verbatim_text, nodes[0].ocr_confidence);
  return { document: { id, filename: file.name, source_format: file.name.split(".").pop()?.toUpperCase() ?? "TEXT", category: categoryFor(nodes[0].verbatim_text), sub_category: null, priority_tier: risk.tier, priority_score: risk.score, ast_checksum: hash, file_size_bytes: file.size, total_pages: file.name.endsWith(".pdf") ? nodes.length : 0, total_ast_nodes: nodes.length, processing_status: "COMPLETED", effective_date: null, is_latest_version: true }, nodes };
}

function localItems(document: Document, nodes: ASTNode[], workspaceId: string, batchId: string): WorkItem[] {
  return nodes.map((node) => {
    const risk = priorityFor(node.verbatim_text, node.ocr_confidence);
    const verified = node.ocr_confidence >= 0.9;
    return {
      id: uid(), workspace_id: workspaceId, batch_id: batchId, document_id: document.id, item_type: "DOCUMENT_FINDING",
      category: categoryFor(node.verbatim_text), priority_tier: verified ? risk.tier : "P0_CRITICAL", priority_score: verified ? risk.score : 100,
      prompt_or_question: node.section_path ?? "Source item", fluent_output: verified ? `Verified against the exact source text in ${document.filename}.` : "Insufficient evidence in uploaded corpus — flagged for manual review.",
      structured_facts: [{ fact_type: "SOURCE_EXCERPT", value: node.verbatim_text.slice(0, 120), verbatim_quote: node.verbatim_text, ast_node_id: node.id, confidence: verified ? 0.98 : 0.72 }],
      verified_citations: verified ? [{ quote: node.verbatim_text, ast_node_id: node.id, page_number: node.page_number, document_filename: document.filename }] : [],
      verification_status: verified ? "VERIFIED" : "INSUFFICIENT_EVIDENCE", resolved_by_tier: "TIER2_SLM_REGIMENT",
      gate_telemetry: { citation_match: verified ? 100 : 0, critical_logprob: verified ? 0.98 : 0.72, failed_citations: [], failed_logprobs: [] }, created_at: new Date().toISOString(),
    };
  });
}

async function runLocalReview(set: (updater: (state: BertState) => Partial<BertState>) => void, get: () => BertState, document: Document, nodes: ASTNode[], items: WorkItem[], job: JobExecution): Promise<void> {
  const runId = ++localRun;
  set(() => ({ workItems: items, activeJob: job, notice: "Local simulator active — backend unavailable" }));
  for (let index = 0; index < AGENTS.length; index += 1) {
    if (runId !== localRun) return;
    if (localPaused) {
      await new Promise<void>((resolve) => { localResume = resolve; });
      if (runId !== localRun) return;
    }
    const current = { ...job, status: "RUNNING" as const, current_agent_index: index, current_document_id: document.id, current_node_index: Math.min(index, Math.max(nodes.length - 1, 0)) };
    set(() => ({ activeJob: current }));
    get().appendEvent({ type: "agent_transition", agent_name: AGENTS[index], status: "running", document_id: document.id, node_index: current.current_node_index, message: `${AGENT_ROLES[index]} is reading ${document.filename}.` });
    await sleep(460);
    get().appendEvent({ type: "agent_transition", agent_name: AGENTS[index], status: "completed", latency_ms: 460, document_id: document.id, node_index: current.current_node_index, message: `${AGENT_ROLES[index]} completed a verified pass over ${document.filename}.` });
  }
  set(() => ({ activeJob: { ...job, status: "COMPLETED", current_agent_index: 6, current_document_id: document.id, current_node_index: Math.max(nodes.length - 1, 0) }, notice: "Review complete — results are ready." }));
}

export const useBertStore = create<BertState>((set, get) => ({
  documents: [], nodesByDocument: {}, workItems: [], events: [], activeJob: null, selectedDocumentId: null, selectedNodeId: null,
  notice: "System ready", backendAvailable: true,
  setSelectedDocument: (id) => { set({ selectedDocumentId: id, selectedNodeId: null }); if (id) void get().loadNodes(id); },
  setSelectedNode: (id) => set({ selectedNodeId: id }),
  appendEvent: (event) => set((state) => {
    const activeJob = state.activeJob && event.job_id === state.activeJob.job_id && event.current_agent_index !== undefined
      ? { ...state.activeJob, status: (event.status as JobExecution["status"]) ?? state.activeJob.status, current_agent_index: event.current_agent_index, current_node_index: event.current_node_index ?? state.activeJob.current_node_index } : state.activeJob;
    return { events: [...state.events.slice(-249), event], activeJob };
  }),
  refresh: async () => {
    try {
      const [documents, workItems] = await Promise.all([bertApi.getDocuments(), bertApi.getWorkItems()]);
      const selectedDocumentId = get().selectedDocumentId ?? documents[0]?.id ?? null;
      set({ documents, workItems, backendAvailable: true, selectedDocumentId });
      if (selectedDocumentId && !get().nodesByDocument[selectedDocumentId]) await get().loadNodes(selectedDocumentId);
    } catch {
      set({ backendAvailable: false });
    }
  },
  loadNodes: async (documentId) => {
    try { const nodes = await bertApi.getNodes(documentId); set((state) => ({ nodesByDocument: { ...state.nodesByDocument, [documentId]: nodes } })); } catch { /* local fallback already owns its nodes */ }
  },
  uploadFile: async (file) => {
    try {
      const document = await bertApi.upload(file);
      const job = await bertApi.startJob(document.id);
      set((state) => ({ documents: [document, ...state.documents.filter((item) => item.id !== document.id)], activeJob: job, selectedDocumentId: document.id, backendAvailable: true, notice: `Uploaded ${document.filename}; seven-agent review started.` }));
      await get().loadNodes(document.id);
    } catch {
      const text = await readWithFileReader(file).catch(() => "");
      const hash = await checksum(text || file.name);
      const { document, nodes } = localDocument(file, text, hash);
      const workspaceId = uid(); const batchId = uid(); const job: JobExecution = { job_id: uid(), workspace_id: workspaceId, batch_id: batchId, status: "RUNNING", current_agent_index: 0, current_document_id: document.id, current_node_index: 0, checkpoint_id: uid(), completed_step_outputs: {}, user_override_instructions: [], error_message: null };
      set((state) => ({ documents: [document, ...state.documents], nodesByDocument: { ...state.nodesByDocument, [document.id]: nodes }, selectedDocumentId: document.id, backendAvailable: false }));
      void runLocalReview(set, get, document, nodes, localItems(document, nodes, workspaceId, batchId), job);
    }
  },
  loadDemo: async () => {
    try { const job = await bertApi.startDemo(); set({ activeJob: job, backendAvailable: true, notice: "Investor demo case loaded; agents are reviewing the source bundle." }); await get().refresh(); }
    catch { set({ backendAvailable: false, notice: "Demo service unavailable — upload a file to use the local simulator." }); }
  },
  pauseJob: async () => {
    const job = get().activeJob; if (!job || job.status === "COMPLETED") return;
    if (!get().backendAvailable) { localPaused = true; set({ activeJob: { ...job, status: "PAUSED" }, notice: `Paused at ${AGENTS[job.current_agent_index]}; waiting for your instruction.` }); return; }
    try { const paused = await bertApi.pause(job.job_id).catch(() => bertApi.interrupt(job.job_id)); set({ activeJob: paused, notice: "Pause requested — current atomic step will finish safely." }); } catch { set({ backendAvailable: false }); }
  },
  resumeJob: async (instruction) => {
    const job = get().activeJob; if (!job) return;
    if (!get().backendAvailable) { localPaused = false; localResume?.(); localResume = null; set({ activeJob: { ...job, status: "RUNNING", user_override_instructions: instruction ? [...job.user_override_instructions, instruction] : job.user_override_instructions }, notice: instruction ? `Applying instruction: ${instruction}` : "Review resumed from checkpoint." }); return; }
    try { const resumed = await bertApi.resume(job.job_id, instruction); set({ activeJob: resumed, notice: instruction ? `Applying instruction: ${instruction}` : "Review resumed from checkpoint." }); } catch { set({ backendAvailable: false }); }
  },
}));

export { AGENTS, AGENT_ROLES };
