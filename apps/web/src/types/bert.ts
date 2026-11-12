export type PriorityTier = "P0_CRITICAL" | "P1_HIGH" | "P2_MEDIUM" | "P3_LOW";
export type VerificationStatus =
  | "VERIFIED"
  | "HUMAN_OVERRIDE"
  | "NEEDS_HUMAN_VERIFICATION"
  | "INSUFFICIENT_EVIDENCE"
  | "ESCALATED_LEGAL"
  | "NOT_APPLICABLE";
export type JobStatus = "RUNNING" | "PAUSING" | "PAUSED" | "RESUMING" | "COMPLETED" | "FAILED";

export interface BoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export type BboxTuple = [number, number, number, number];

export interface PdfEvidenceLocator {
  source_type: "pdf";
  doc_id: string;
  page: number;
  bbox: BboxTuple | BoundingBox | null;
  coord_system?: "pdf_user_space_bl_pt" | string;
  page_width?: number | null;
  page_height?: number | null;
  crop_box?: BboxTuple | BoundingBox | null;
  rotation?: number | null;
  node_id?: string | null;
  checksum?: string | null;
  is_scan?: boolean;
}

export interface XlsxEvidenceLocator {
  source_type: "xlsx";
  doc_id: string;
  sheet: string;
  row: number;
  col_range?: string | null;
  node_id?: string | null;
  checksum?: string | null;
}

export interface JsonEvidenceLocator {
  source_type: "json";
  doc_id: string;
  json_path: string;
  node_id?: string | null;
  checksum?: string | null;
}

export interface TextEvidenceLocator {
  source_type: "text";
  doc_id: string;
  page?: number | null;
  line_start?: number | null;
  line_end?: number | null;
  node_id?: string | null;
  checksum?: string | null;
}

export type EvidenceLocator =
  | PdfEvidenceLocator
  | XlsxEvidenceLocator
  | JsonEvidenceLocator
  | TextEvidenceLocator;

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
  workspace_id?: string | null;
  superseded_by?: string | null;
  created_at?: string;
}

export interface ASTNode {
  id: string;
  document_id: string;
  node_type: string;
  section_path: string | null;
  verbatim_text: string;
  structured_payload: Record<string, unknown> | null;
  page_number: number | null;
  bounding_box: BoundingBox | null;
  ocr_confidence: number;
  node_order: number;
  locator?: EvidenceLocator | null;
}

export interface Fact {
  fact_type: string;
  value: string;
  verbatim_quote: string;
  ast_node_id: string;
  confidence: number;
  locator?: EvidenceLocator | null;
  region_match_score?: number | null;
}

export interface Citation {
  quote: string;
  ast_node_id: string;
  page_number: number | null;
  document_filename?: string | null;
  bounding_box?: BoundingBox | null;
  locator?: EvidenceLocator | null;
  confidence_score?: number;
  region_match_score?: number | null;
}

export interface TemporalConflict {
  newer_doc_id?: string | null;
  newer_filename: string;
  newer_effective_date?: string | null;
  newer_quote: string;
  newer_locator?: EvidenceLocator | null;
  newer_region_match_score?: number | null;
  older_doc_id?: string | null;
  older_filename: string;
  older_effective_date?: string | null;
  older_quote: string;
  older_locator?: EvidenceLocator | null;
  older_region_match_score?: number | null;
  resolution: string;
  superseded_by?: string | null;
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
  gate_telemetry: {
    citation_match: number;
    critical_logprob: number;
    failed_citations: unknown[];
    failed_logprobs: unknown[];
    supersession?: string | null;
    region_match_score?: number | null;
    weak_evidence?: boolean | null;
    weak_evidence_reason?: string | null;
    override_citation_text?: string | null;
    manual_override?: boolean | null;
  };
  created_at: string;
  escalation_reason?: string | null;
  escalation_assignee?: string | null;
  escalated_at?: string | null;
  escalated_by?: string | null;
  original_priority_tier?: PriorityTier | null;
  human_override_reason_code?: string | null;
  no_evidence_attestation?: boolean;
  override_locator?: EvidenceLocator | null;
  weak_evidence?: boolean;
  weak_evidence_reason?: string | null;
  evidence_quality?: "strong" | "weak" | "missing" | string;
  temporal_conflict?: TemporalConflict | null;
  can_undo?: boolean;
  machine_extracted_text?: string | null;
  vision_rescue_text?: string | null;
  has_vision_rescue?: boolean;
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
  step_telemetry?: Array<Record<string, unknown>> | Record<string, unknown> | null;
  user_override_instructions: string[];
  error_message: string | null;
}

export interface CitationMatch {
  quote: string;
  ast_node_id: string;
  page_number: number | null;
  bounding_box: BoundingBox | null;
  document_filename: string;
  confidence_score: number;
  locator?: EvidenceLocator | null;
  region_match_score?: number | null;
}

export interface CopilotChatResponse {
  answer: string;
  verification_status: string;
  match_score: number;
  citations: CitationMatch[];
  weak_evidence?: boolean;
  weak_evidence_reason?: string | null;
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
  summarySnapshot?: ExecutiveSummary | null;
  weak_evidence?: boolean;
  weak_evidence_reason?: string | null;
}

export type AgentStepStatus = "pending" | "running" | "done" | "failed";

export interface AgentStepState {
  agentName: string;
  index: number;
  role: string;
  status: AgentStepStatus;
  startedAt: string | number | null;
  completedAt: string | number | null;
  elapsedMs: number | null;
  summary: string | null;
  details: Record<string, unknown> | null;
  inputHash: string | null;
  outputHash: string | null;
  documentId: string | null;
  documentFilename: string | null;
  runId: string | null;
}

export interface AgentRunEntry {
  id: string;
  runId: string;
  jobId: string | null;
  agentName: string;
  agentIndex: number;
  role: string;
  status: "running" | "done" | "failed";
  startedAt: string | number | null;
  completedAt: string | number | null;
  elapsedMs: number | null;
  summary: string;
  details: Record<string, unknown> | null;
  inputHash: string | null;
  outputHash: string | null;
  documentId: string | null;
  documentFilename: string | null;
  rawEvent: PipelineEvent;
}

export interface PipelineEvent {
  type: string;
  created_at?: number;
  agent_name?: string;
  status?: string;
  job_status?: JobStatus | string;
  latency_ms?: number;
  started_at?: string | number | null;
  completed_at?: string | number | null;
  input_hash?: string;
  output_hash?: string;
  document_id?: string | null;
  document_filename?: string | null;
  node_index?: number | null;
  message?: string;
  summary?: string | null;
  details?: Record<string, unknown> | null;
  job_id?: string;
  run_id?: string;
  checkpoint_id?: string;
  paused_at_agent?: string;
  current_agent_index?: number;
  current_node_index?: number | null;
  passed?: boolean;
  match_score?: number;
  logprob?: number;
  id?: string;
  work_item?: WorkItem;
  step_telemetry?: Record<string, unknown> | null;
}

export interface Escalation {
  work_item_id: string;
  reason: string;
  prompt_or_question: string;
  priority_tier: PriorityTier;
  verification_status: VerificationStatus;
  fluent_output: string;
  document_id?: string | null;
  item_type?: string;
  escalation_reason?: string | null;
  escalation_assignee?: string | null;
  escalated_at?: string | null;
  escalated_by?: string | null;
  original_priority_tier?: PriorityTier | null;
  human_override_reason_code?: string | null;
  no_evidence_attestation?: boolean;
  override_locator?: EvidenceLocator | null;
  weak_evidence?: boolean;
  weak_evidence_reason?: string | null;
  evidence_quality?: string;
  temporal_conflict?: TemporalConflict | null;
  gate_telemetry?: WorkItem["gate_telemetry"];
  can_undo?: boolean;
  verified_citations?: Citation[];
  machine_extracted_text?: string | null;
  vision_rescue_text?: string | null;
  has_vision_rescue?: boolean;
}

export interface EscalationActionPayload {
  action: "manual_correction" | "retry" | "skip" | "not_applicable" | "approve" | "counsel" | "undo";
  note?: string;
  correction?: string;
  manual_payload?: Record<string, unknown>;
  assignee?: string;
  actor?: string;
  reason_code?: string;
  no_evidence_attestation?: boolean;
  override_locator?: EvidenceLocator | null;
  override_citation_text?: string | null;
}

export interface BatchResolvePayload {
  work_item_ids: string[];
  action: EscalationActionPayload["action"];
  note?: string;
  correction?: string;
  reason_code?: string;
  assignee?: string;
  actor?: string;
  no_evidence_attestation?: boolean;
}

export interface BatchResolveResponse {
  updated_count: number;
  skipped_ids: string[];
  items: WorkItem[];
  errors: Array<Record<string, unknown>>;
}

export interface ExecutiveSummaryFinding {
  work_item_id: string;
  document_id: string | null;
  document_filename: string | null;
  priority_tier: PriorityTier;
  verification_status: VerificationStatus;
  category: string;
  prompt_or_question: string;
  fluent_output: string;
}

export interface ExecutiveSummary {
  id: string;
  workspace_id?: string | null;
  document_id: string | null;
  only_critical: boolean;
  latest_only: boolean;
  total_work_items: number;
  verified_count: number;
  human_override_count?: number;
  unresolved_count: number;
  escalated_legal_count: number;
  not_applicable_count?: number;
  critical_count: number;
  critical_open_count?: number;
  high_open_count?: number;
  weak_evidence_count?: number;
  defensibility_score: number | null;
  summary_text: string;
  markdown: string;
  key_findings: ExecutiveSummaryFinding[];
  arbiter_resolutions: {
    latest_documents: string[];
    superseded_documents: string[];
    resolved: boolean;
  };
  is_stale: boolean;
  created_at: string;
}

export interface ExportWarnings {
  has_unresolved: boolean;
  has_escalated: boolean;
  has_overrides: boolean;
  has_not_applicable: boolean;
  has_weak_evidence: boolean;
}

export interface MetricsResponse {
  total: number;
  machine_verified: number;
  human_override: number;
  escalated_legal: number;
  not_applicable: number;
  unresolved: number;
  critical_total: number;
  critical_open: number;
  high_open: number;
  needs_triage: number;
  weak_evidence_count: number;
  defensibility_score: number | null;
  export_warnings: ExportWarnings;
}

export interface CorpusResetResponse {
  status: string;
  deleted_documents: number;
  deleted_ast_nodes: number;
  deleted_work_items: number;
  deleted_audit_logs: number;
  deleted_summaries: number;
  deleted_jobs: number;
}

export interface AuditLogEntry {
  id: number;
  document_id: string | null;
  work_item_id: string | null;
  agent_name: string;
  action: string;
  input_hash: string;
  output_hash: string;
  confidence: number | null;
  model_name: string;
  processing_time_ms: number;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
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
