"""Pydantic v2 request and response contracts shared with the web client."""

from __future__ import annotations

from datetime import date, datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class GateTelemetry(BaseModel):
    citation_match: float = 100.0
    critical_logprob: float = 1.0
    failed_citations: list[dict[str, Any]] = Field(default_factory=list)
    failed_logprobs: list[dict[str, Any]] = Field(default_factory=list)
    supersession: str | None = None


class FactResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    fact_type: str
    value: str
    verbatim_quote: str
    ast_node_id: str
    confidence: float


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
    ocr_confidence: float
    node_order: int


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
    user_override_instructions: list[str]
    error_message: str | None


class JobResumeRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    instruction: str | None = Field(default=None, alias="user_instruction")


class JobStartRequest(BaseModel):
    document_id: UUID | None = None


class EscalationResponse(BaseModel):
    work_item_id: UUID
    reason: str
    prompt_or_question: str
    priority_tier: str
    verification_status: str
    fluent_output: str


class EscalationActionRequest(BaseModel):
    action: Literal["manual_correction", "retry", "skip"]
    correction: str | None = None


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
