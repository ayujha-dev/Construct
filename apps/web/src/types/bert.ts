export type PriorityTier = "P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM" | "P3_LOW";
export type VerificationStatus = "VERIFIED" | "NEEDS_HUMAN_VERIFICATION" | "INSUFFICIENT_EVIDENCE";
export type JobStatus = "RUNNING" | "PAUSING" | "PAUSED" | "RESUMING" | "COMPLETED" | "FAILED";

export interface Document {
  id: string;
  filename: string;
  source_format: string;
  category: string | null;
  sub_category: string | null;
  priority_tier: PriorityTier;
  priority_score: number;
  ast_checksum: string;
  file_size_bytes: number;
  total_pages: number;
  total_ast_nodes: number;
  processing_status: string;
  effective_date: string | null;
  is_latest_version: boolean;
}

export interface ASTNode {
  id: string;
  document_id: string;
  node_type: string;
  section_path: string | null;
  verbatim_text: string;
  structured_payload: Record<string, unknown> | null;
  page_number: number | null;
  bounding_box: { x0: number; y0: number; x1: number; y1: number } | null;
  ocr_confidence: number;
  node_order: number;
}

export interface Fact {
  fact_type: string;
  value: string;
  verbatim_quote: string;
  ast_node_id: string;
  confidence: number;
}

export interface Citation {
  quote: string;
  ast_node_id: string;
  page_number: number | null;
  document_filename?: string | null;
}

export interface WorkItem {
  id: string;
  workspace_id: string;
  batch_id: string;
  document_id: string | null;
  item_type: string;
  category: string;
  priority_tier: PriorityTier;
  priority_score: number;
  prompt_or_question: string;
  fluent_output: string;
  structured_facts: Fact[];
  verified_citations: Citation[];
  verification_status: VerificationStatus;
  resolved_by_tier: string;
  gate_telemetry: { citation_match: number; critical_logprob: number; failed_citations: unknown[]; failed_logprobs: unknown[]; supersession?: string | null };
  created_at: string;
}

export interface JobExecution {
  job_id: string;
  workspace_id: string;
  batch_id: string;
  status: JobStatus;
  current_agent_index: number;
  current_document_id: string | null;
  current_node_index: number;
  checkpoint_id: string;
  completed_step_outputs: Record<string, unknown>;
  user_override_instructions: string[];
  error_message: string | null;
}

export interface CitationMatch {
  quote: string;
  ast_node_id: string;
  page_number: number | null;
  bounding_box: { x0: number; y0: number; x1: number; y1: number } | null;
  document_filename: string;
  confidence_score: number;
}

export interface CopilotChatResponse {
  answer: string;
  verification_status: string;
  match_score: number;
  citations: CitationMatch[];
}

export type CopilotChatStatus = "PENDING" | "VERIFIED" | "INSUFFICIENT_EVIDENCE";

export interface CopilotChatMessage {
  id: string;
  prompt: string;
  answer: string | null;
  status: CopilotChatStatus;
  match_score: number;
  citations: CitationMatch[];
  document_id: string | null;
  created_at: number;
}

export interface PipelineEvent {
  type: string;
  created_at?: number;
  agent_name?: string;
  status?: string;
  latency_ms?: number;
  input_hash?: string;
  output_hash?: string;
  document_id?: string | null;
  node_index?: number;
  message?: string;
  job_id?: string;
  checkpoint_id?: string;
  paused_at_agent?: string;
  current_agent_index?: number;
  current_node_index?: number;
  passed?: boolean;
  match_score?: number;
  logprob?: number;
  id?: string;
}

export interface Escalation {
  work_item_id: string;
  reason: string;
  prompt_or_question: string;
  priority_tier: PriorityTier;
  verification_status: VerificationStatus;
  fluent_output: string;
}

export interface ContradictionRecord {
  id: string;
  title: string;
  category: string;
  status: "SUPERSEDED" | "VIOLATION" | "RESOLVED";
  arbiter_resolution: string;
  legacy: {
    document_id?: string | null;
    filename: string;
    effective_date?: string | null;
    quote: string;
    tag: string;
  };
  authoritative: {
    document_id?: string | null;
    filename: string;
    effective_date?: string | null;
    quote: string;
    tag: string;
  };
}
