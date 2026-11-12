"""Pydantic v2 request and response contracts shared with the web client."""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated, Any, Literal, Union
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PDFLocator(BaseModel):
    source_type: Literal["pdf"] = "pdf"
    doc_id: str
    page: int = Field(ge=1)
    bbox: list[float] = Field(min_length=4, max_length=4)
    coord_system: Literal["pdf_user_space_bl_pt"] = "pdf_user_space_bl_pt"
    page_width: float = Field(gt=0)
    page_height: float = Field(gt=0)
    crop_box: list[float] = Field(min_length=4, max_length=4)
    rotation: int = 0
    node_id: str
    checksum: str = ""


class XLSXLocator(BaseModel):
    source_type: Literal["xlsx"] = "xlsx"
    doc_id: str
    sheet: str
    row: int = Field(ge=1)
    col_range: str
    node_id: str
    checksum: str = ""


class JSONLocator(BaseModel):
    source_type: Literal["json"] = "json"
    doc_id: str
    json_path: str
    node_id: str
    checksum: str = ""


class TextLocator(BaseModel):
    source_type: Literal["text"] = "text"
    doc_id: str
    page: int = Field(ge=1)
    line_start: int = Field(ge=1)
    line_end: int = Field(ge=1)
    node_id: str
    checksum: str = ""


EvidenceLocator = Annotated[
    Union[PDFLocator, XLSXLocator, JSONLocator, TextLocator],
    Field(discriminator="source_type"),
]


class GateTelemetry(BaseModel):
    model_config = ConfigDict(extra="allow")
    citation_match: float = 0.0
    critical_logprob: float = 0.0
    failed_citations: list[dict[str, Any]] = Field(default_factory=list)
    failed_logprobs: list[dict[str, Any]] = Field(default_factory=list)
    supersession: str | None = None
    region_match_score: float | None = None
    weak_evidence: bool | None = None
    weak_evidence_reason: str | None = None
    override_citation_text: str | None = None
    manual_override: bool | None = None


class FactResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fact_type: str
    value: str
    verbatim_quote: str
    ast_node_id: str
    confidence: float
    locator: EvidenceLocator | None = None
    region_match_score: float | None = None


class WorkItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    workspace_id: UUID
    batch_id: UUID
    document_id: UUID | None
    item_type: str
    category: str
    priority_tier: str
    priority_score: int
    prompt_or_question: str
    fluent_output: str
    structured_facts: list[FactResponse]
    verified_citations: list[dict[str, Any]]
    verification_status: str
    resolved_by_tier: str
    gate_telemetry: GateTelemetry
    escalation_reason: str | None = None
    escalation_assignee: str | None = None
    escalated_at: datetime | None = None
    escalated_by: str | None = None
    original_priority_tier: str | None = None
    human_override_reason_code: str | None = None
    no_evidence_attestation: bool = False
    override_locator: EvidenceLocator | None = None
    weak_evidence: bool = False
    weak_evidence_reason: str | None = None
    evidence_quality: str = "missing"
    temporal_conflict: dict[str, Any] | None = None
    can_undo: bool = False
    created_at: datetime


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    filename: str
    source_format: str
    category: str | None
    sub_category: str | None
    priority_tier: str
    priority_score: int
    ast_checksum: str
    file_size_bytes: int = 0
    total_pages: int
    total_ast_nodes: int
    processing_status: str
    effective_date: date | None = None
    is_latest_version: bool


class ASTNodeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    document_id: UUID
    node_type: str
    section_path: str | None
    verbatim_text: str
    structured_payload: dict[str, Any] | None
    page_number: int | None
    bounding_box: dict[str, float] | None
    locator: EvidenceLocator | None = None
    ocr_confidence: float
    node_order: int


class CopilotChatRequest(BaseModel):
    prompt: str
    document_id: UUID | None = None


class CitationMatch(BaseModel):
    quote: str
    ast_node_id: str
    page_number: int | None = None
    bounding_box: dict[str, float] | None = None
    document_filename: str
    confidence_score: float
    locator: EvidenceLocator | None = None
    region_match_score: float | None = None


class CopilotChatResponse(BaseModel):
    answer: str
    verification_status: str
    match_score: float
    citations: list[CitationMatch]


class AuditResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    document_id: UUID | None
    work_item_id: UUID | None
    agent_name: str
    action: str
    input_hash: str
    output_hash: str
    confidence: float | None
    model_name: str
    processing_time_ms: int
    metadata_json: dict[str, Any] | None
    created_at: datetime


class SeedResponse(BaseModel):
    workspace_id: UUID
    batch_id: UUID
    document_count: int
    work_item_count: int
    critical_count: int
    verified_count: int = 0
    unresolved_count: int = 0
    defensibility_score: int | None = None


class AgentStepTelemetry(BaseModel):
    agent_name: str
    index: int
    status: Literal["pending", "running", "done", "failed"] = "pending"
    started_at: str | None = None
    completed_at: str | None = None
    latency_ms: int | None = None
    summary: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    input_hash: str | None = None
    output_hash: str | None = None
    document_id: str | None = None
    document_filename: str | None = None
    run_id: str | None = None


class JobExecutionResponse(BaseModel):
    job_id: UUID
    workspace_id: UUID
    batch_id: UUID
    status: str
    current_agent_index: int
    current_document_id: UUID | None
    current_node_index: int
    checkpoint_id: UUID
    completed_step_outputs: dict[str, Any]
    step_telemetry: list[AgentStepTelemetry] = Field(default_factory=list)
    user_override_instructions: list[str]
    error_message: str | None


class JobResumeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    instruction: str | None = Field(default=None, alias="user_instruction")


class JobStartRequest(BaseModel):
    document_id: UUID | None = None


class EscalationResponse(BaseModel):
    work_item_id: UUID
    document_id: UUID | None = None
    item_type: str = "QUESTIONNAIRE_ROW"
    reason: str
    prompt_or_question: str
    priority_tier: str
    verification_status: str
    fluent_output: str
    escalation_reason: str | None = None
    escalation_assignee: str | None = None
    escalated_at: datetime | None = None
    escalated_by: str | None = None
    original_priority_tier: str | None = None
    human_override_reason_code: str | None = None
    no_evidence_attestation: bool = False
    override_locator: EvidenceLocator | None = None
    weak_evidence: bool = False
    weak_evidence_reason: str | None = None
    evidence_quality: str = "missing"
    temporal_conflict: dict[str, Any] | None = None
    gate_telemetry: GateTelemetry = Field(default_factory=GateTelemetry)
    can_undo: bool = False
    verified_citations: list[dict[str, Any]] = Field(default_factory=list)


class EscalationActionRequest(BaseModel):
    action: Literal["manual_correction", "retry", "skip", "not_applicable", "approve", "counsel", "undo"]
    note: str | None = None
    correction: str | None = None
    manual_payload: dict[str, Any] | None = None
    assignee: str | None = None
    actor: str | None = None
    reason_code: str | None = None
    no_evidence_attestation: bool = False
    override_locator: EvidenceLocator | None = None
    override_citation_text: str | None = None


class UndoRequest(BaseModel):
    actor: str | None = None
    note: str | None = None


class SummaryGenerateRequest(BaseModel):
    document_id: str | UUID | None = None
    only_critical: bool = False
    latest_only: bool = False


class SummaryKeyFinding(BaseModel):
    work_item_id: str
    document_id: str | None = None
    document_filename: str | None = None
    priority_tier: str
    verification_status: str
    category: str
    prompt_or_question: str
    fluent_output: str


class ExecutiveSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    workspace_id: UUID | None = None
    document_id: UUID | None = None
    only_critical: bool = False
    latest_only: bool = False
    total_work_items: int
    verified_count: int
    human_override_count: int = 0
    unresolved_count: int
    escalated_legal_count: int
    not_applicable_count: int = 0
    critical_count: int
    critical_open_count: int = 0
    high_open_count: int = 0
    weak_evidence_count: int = 0
    defensibility_score: float | None = None
    summary_text: str
    markdown: str
    key_findings: list[SummaryKeyFinding] = Field(default_factory=list)
    arbiter_resolutions: dict[str, Any] = Field(default_factory=dict)
    is_stale: bool = False
    created_at: datetime


class ExportWarningsResponse(BaseModel):
    has_unresolved: bool = False
    has_escalated: bool = False
    has_overrides: bool = False
    has_not_applicable: bool = False
    has_weak_evidence: bool = False


class MetricsResponse(BaseModel):
    total: int
    machine_verified: int
    human_override: int
    escalated_legal: int
    not_applicable: int
    unresolved: int
    critical_total: int
    critical_open: int
    high_open: int
    needs_triage: int
    weak_evidence_count: int = 0
    defensibility_score: int | None = None
    export_warnings: ExportWarningsResponse = Field(default_factory=ExportWarningsResponse)


class CorpusResetResponse(BaseModel):
    status: str = "reset"
    deleted_documents: int = 0
    deleted_ast_nodes: int = 0
    deleted_work_items: int = 0
    deleted_audit_logs: int = 0
    deleted_summaries: int = 0
    deleted_jobs: int = 0


class SandboxRequest(BaseModel):
    test: Literal["citation", "logprob", "checksum"]
    quote: str | None = None
    probability: float | None = Field(default=None, ge=0.0, le=1.0)
    expected_checksum: str | None = None
    actual_checksum: str | None = None


class SandboxResponse(BaseModel):
    passed: bool
    status: str
    priority_tier: str
    message: str
    score: float
